import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApprovalActionType, ApprovalStatus, PositionType, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { JunakImportRowProcessorService } from '../junak-import/junak-import-row-processor.service';
import { ResolvedJunakRow } from '../junak-import/junak-import-row.types';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class ApprovalRequestsService {
  private readonly logger = new Logger(ApprovalRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rowProcessor: JunakImportRowProcessorService,
    private readonly googleDrive: GoogleDriveService,
    private readonly usersService: UsersService,
  ) {}

  async create(dto: CreateApprovalRequestDto, actor: CurrentUserPayload) {
    const canInitiateBulkImport =
      dto.actionType === ApprovalActionType.BULK_IMPORT_JUNAKY && actor.positions.includes(PositionType.SUDDIA);
    const canInitiateArchive =
      dto.actionType === ApprovalActionType.ARCHIVE_JUNAK && actor.positions.includes(PositionType.SUDDIA);
    if (!actor.isKurinniy && !canInitiateBulkImport && !canInitiateArchive) {
      throw new ForbiddenException('Only kurinniy can create approval requests');
    }
    const noJunakIdActionTypes = [ApprovalActionType.CREATE_JUNAK, ApprovalActionType.BULK_IMPORT_JUNAKY] as const;
    if (noJunakIdActionTypes.includes(dto.actionType as any) && dto.junakId) {
      throw new BadRequestException('junakId must not be provided for this action type');
    }
    if (!noJunakIdActionTypes.includes(dto.actionType as any) && !dto.junakId) {
      throw new BadRequestException('junakId is required for this action type');
    }

    let oldData: Record<string, unknown> | undefined;
    if (dto.junakId) {
      const junak = await this.prisma.user.findUnique({ where: { id: dto.junakId } });
      if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actor.kurinId) {
        throw new NotFoundException('Junak not found');
      }
      oldData = this.extractRelevantFields(dto.actionType, junak);
    }

    return this.prisma.approvalRequest.create({
      data: {
        initiatedById: actor.userId,
        junakId: dto.junakId,
        actionType: dto.actionType,
        oldData: oldData as any,
        newData: dto.newData as any,
        status: ApprovalStatus.PENDING,
      },
    });
  }

  list(kurinId: string, status?: ApprovalStatus) {
    return this.prisma.approvalRequest.findMany({
      where: { status, initiatedBy: { kurinId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, kurinId: string) {
    const req = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!req) {
      throw new NotFoundException('Request not found');
    }
    const initiator = await this.prisma.user.findUnique({ where: { id: req.initiatedById } });
    if (!initiator || initiator.kurinId !== kurinId) {
      throw new NotFoundException('Request not found');
    }
    return req;
  }

  async approve(requestId: string, actor: CurrentUserPayload) {
    const req = await this.loadPendingRequestForKurin(requestId, actor.kurinId);

    if (req.actionType === ApprovalActionType.BULK_IMPORT_JUNAKY) {
      return this.approveBulkImport(req, actor);
    }
    if (req.actionType === ApprovalActionType.ARCHIVE_JUNAK) {
      await this.usersService.archiveUser(req.junakId!, actor);
      return this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: ApprovalStatus.APPROVED, approvedById: actor.userId, decidedAt: new Date() },
      });
    }

    let createdJunak:
      | { firstName: string; lastName: string; nickname: string | null; birthDate: Date | null; email: string; phone: string | null; hurtokName?: string }
      | undefined;

    const updatedRequest = await this.prisma.$transaction(async (tx) => {
      if (req.actionType === ApprovalActionType.CREATE_JUNAK) {
        const data = req.newData as {
          firstName: string;
          lastName: string;
          email: string;
          hurtokId: string;
          birthDate?: string;
        };
        await this.validateHurtokBelongsToKurin(data.hurtokId, actor.kurinId);
        const created = await tx.user.create({
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            role: Role.JUNAK,
            kurinId: actor.kurinId,
            hurtokId: data.hurtokId,
            birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          },
        });
        const hurtok = await tx.hurtok.findUnique({ where: { id: data.hurtokId }, select: { name: true } });
        createdJunak = { ...created, hurtokName: hurtok?.name };
      } else {
        const updateData = this.buildUpdateData(req.actionType, req.newData as Record<string, unknown>);
        if (req.actionType === ApprovalActionType.CHANGE_HURTOK) {
          await this.validateHurtokBelongsToKurin(updateData.hurtokId as string, actor.kurinId);
        }
        await tx.user.update({ where: { id: req.junakId! }, data: updateData });
      }

      return tx.approvalRequest.update({
        where: { id: requestId },
        data: { status: ApprovalStatus.APPROVED, approvedById: actor.userId, decidedAt: new Date() },
      });
    });

    if (createdJunak) {
      await this.appendToJudgeBookIfConnected(actor.kurinId, createdJunak);
    }

    return updatedRequest;
  }

  private async approveBulkImport(req: { id: string; newData: unknown }, actor: CurrentUserPayload) {
    const claim = await this.prisma.approvalRequest.updateMany({
      where: { id: req.id, status: ApprovalStatus.PENDING },
      data: { status: ApprovalStatus.APPROVED, approvedById: actor.userId, decidedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new BadRequestException('Request already decided');
    }

    const data = req.newData as unknown as { rows: ResolvedJunakRow[] };
    const results = [];
    for (let i = 0; i < data.rows.length; i++) {
      results.push(
        await this.rowProcessor.processRow(actor.kurinId, data.rows[i], i, actor, {
          restrictProtectedTargets: true,
        }),
      );
    }

    return this.prisma.approvalRequest.update({
      where: { id: req.id },
      data: { newData: { rows: data.rows, results } as any },
    });
  }

  async reject(requestId: string, actor: CurrentUserPayload) {
    await this.loadPendingRequestForKurin(requestId, actor.kurinId);
    return this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: ApprovalStatus.REJECTED, approvedById: actor.userId, decidedAt: new Date() },
    });
  }

  private async loadPendingRequestForKurin(requestId: string, kurinId: string) {
    const req = await this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    const initiator = await this.prisma.user.findUnique({ where: { id: req.initiatedById } });
    if (!initiator || initiator.kurinId !== kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    if (req.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Request already decided');
    }
    return req;
  }

  private async validateHurtokBelongsToKurin(hurtokId: string, kurinId: string) {
    const hurtok = await this.prisma.hurtok.findUnique({ where: { id: hurtokId } });
    if (!hurtok || hurtok.kurinId !== kurinId) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }
  }

  private buildUpdateData(actionType: ApprovalActionType, newData: Record<string, unknown>) {
    switch (actionType) {
      case ApprovalActionType.CHANGE_FULL_NAME:
        return { firstName: newData.firstName as string, lastName: newData.lastName as string };
      case ApprovalActionType.CHANGE_BIRTH_DATE:
        return { birthDate: new Date(newData.birthDate as string) };
      case ApprovalActionType.CHANGE_EMAIL:
        return { email: newData.email as string };
      case ApprovalActionType.CHANGE_HURTOK:
        return { hurtokId: newData.hurtokId as string };
      default:
        throw new BadRequestException('Unsupported action type');
    }
  }

  private extractRelevantFields(actionType: ApprovalActionType, junak: User) {
    switch (actionType) {
      case ApprovalActionType.CHANGE_FULL_NAME:
        return { firstName: junak.firstName, lastName: junak.lastName };
      case ApprovalActionType.CHANGE_BIRTH_DATE:
        return { birthDate: junak.birthDate };
      case ApprovalActionType.CHANGE_EMAIL:
        return { email: junak.email };
      case ApprovalActionType.CHANGE_HURTOK:
        return { hurtokId: junak.hurtokId };
      case ApprovalActionType.ARCHIVE_JUNAK:
        return {};
      default:
        return undefined;
    }
  }

  private async appendToJudgeBookIfConnected(
    kurinId: string,
    junak: {
      firstName: string;
      lastName: string;
      nickname: string | null;
      birthDate: Date | null;
      email: string;
      phone: string | null;
      hurtokName?: string;
    },
  ): Promise<void> {
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      select: { judgeBookSpreadsheetId: true },
    });
    if (!kurin?.judgeBookSpreadsheetId) {
      return;
    }
    const mapping = await this.prisma.junakImportMapping.findUnique({ where: { kurinId } });
    if (!mapping) {
      return;
    }
    try {
      const columnMapping = mapping.columnMapping as { column: string; field: string }[];
      const row = this.buildSheetRow(columnMapping, junak);
      await this.googleDrive.appendSheetRow(kurinId, kurin.judgeBookSpreadsheetId, row);
    } catch (error) {
      this.logger.warn(`Failed to append new junak to Книга судді for kurin ${kurinId}: ${(error as Error).message}`);
    }
  }

  private buildSheetRow(
    columnMapping: { column: string; field: string }[],
    junak: {
      firstName: string;
      lastName: string;
      nickname: string | null;
      birthDate: Date | null;
      email: string;
      phone: string | null;
      hurtokName?: string;
    },
  ): string[] {
    const columnIndex = (column: string): number => {
      let index = 0;
      for (const char of column) {
        index = index * 26 + (char.charCodeAt(0) - 'A'.charCodeAt(0) + 1);
      }
      return index - 1;
    };
    const values: string[] = [];
    for (const { column, field } of columnMapping) {
      const idx = columnIndex(column);
      let value = '';
      if (field === 'FIRST_LAST_NAME') value = `${junak.firstName} ${junak.lastName}`;
      else if (field === 'NICKNAME') value = junak.nickname ?? '';
      else if (field === 'BIRTH_DATE') {
        if (junak.birthDate) {
          const d = junak.birthDate;
          const day = String(d.getUTCDate()).padStart(2, '0');
          const month = String(d.getUTCMonth() + 1).padStart(2, '0');
          value = `${day}.${month}.${d.getUTCFullYear()}`;
        }
      } else if (field === 'EMAIL') value = junak.email;
      else if (field === 'PHONE') value = junak.phone ?? '';
      else if (field === 'HURTOK') value = junak.hurtokName ?? '';
      while (values.length <= idx) values.push('');
      values[idx] = value;
    }
    return values;
  }
}
