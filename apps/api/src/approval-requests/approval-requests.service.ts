import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApprovalActionType, ApprovalStatus, PositionScope, PositionType, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { JunakImportRowProcessorService } from '../junak-import/junak-import-row-processor.service';
import { ResolvedJunakRow } from '../junak-import/junak-import-row.types';
import { JudgeBookSyncService } from '../kurins/judge-book-sync.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class ApprovalRequestsService {
  private readonly logger = new Logger(ApprovalRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rowProcessor: JunakImportRowProcessorService,
    private readonly judgeBookSync: JudgeBookSyncService,
    private readonly usersService: UsersService,
  ) {}

  async create(dto: CreateApprovalRequestDto, actor: CurrentUserPayload) {
    const canInitiateBulkImport =
      dto.actionType === ApprovalActionType.BULK_IMPORT_JUNAKY && actor.positions.includes(PositionType.SUDDIA);
    const canInitiateArchive =
      dto.actionType === ApprovalActionType.ARCHIVE_JUNAK && actor.positions.includes(PositionType.SUDDIA);
    const canInitiateChangeHurtok =
      dto.actionType === ApprovalActionType.CHANGE_HURTOK && actor.positions.includes(PositionType.SUDDIA);
    if (!actor.isKurinniy && !canInitiateBulkImport && !canInitiateArchive && !canInitiateChangeHurtok) {
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
      if (dto.actionType === ApprovalActionType.CHANGE_HURTOK && junak.archivedAt) {
        throw new BadRequestException('Юнак архівований');
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
    if (req.actionType === ApprovalActionType.BULK_IMPORT_JUNAKY) {
      return { ...req, matchedJunaky: await this.resolveMatchedJunaky(req.newData, kurinId) };
    }
    return req;
  }

  /**
   * Resolves the opaque `matchedUserId`s inside a bulk-import payload to the
   * junak's current data, so the approver sees WHO an "update" row targets and
   * what it would change instead of a bare UUID. Scoped to the approver's own
   * kurin and to JUNAK users — an id pointing anywhere else resolves to
   * nothing (the processor rejects such rows too).
   */
  private async resolveMatchedJunaky(newData: unknown, kurinId: string) {
    const rows = (newData as { rows?: unknown } | null)?.rows;
    if (!Array.isArray(rows)) return {};
    const ids = [
      ...new Set(
        rows
          .map((r) => (r as { matchedUserId?: unknown } | null)?.matchedUserId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    if (ids.length === 0) return {};

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, kurinId, role: Role.JUNAK },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        phone: true,
        birthDate: true,
        hurtok: { select: { name: true } },
        positionsHeld: {
          where: { removedAt: null },
          select: { positionType: true, scope: true },
        },
      },
    });

    return Object.fromEntries(
      users.map((u) => [
        u.id,
        {
          firstName: u.firstName,
          lastName: u.lastName,
          nickname: u.nickname,
          email: u.email,
          phone: u.phone,
          birthDate: u.birthDate,
          hurtokName: u.hurtok?.name ?? null,
          kurinPositionTypes: u.positionsHeld.filter((p) => p.scope === PositionScope.KURIN).map((p) => p.positionType),
          hurtokPositionTypes: u.positionsHeld.filter((p) => p.scope === PositionScope.HURTOK).map((p) => p.positionType),
        },
      ]),
    );
  }

  async approve(requestId: string, actor: CurrentUserPayload) {
    const req = await this.loadPendingRequestForKurin(requestId, actor.kurinId);

    if (req.actionType === ApprovalActionType.BULK_IMPORT_JUNAKY) {
      return this.approveBulkImport(req, actor);
    }
    if (req.actionType === ApprovalActionType.ARCHIVE_JUNAK) {
      await this.usersService.archiveUser(req.junakId!, actor);
      const claim = await this.prisma.approvalRequest.updateMany({
        where: { id: requestId, status: ApprovalStatus.PENDING },
        data: { status: ApprovalStatus.APPROVED, approvedById: actor.userId, decidedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Request already decided');
      }
      return this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
    }

    let createdJunakId: string | undefined;

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
        let created;
        try {
          created = await tx.user.create({
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
        } catch (err: any) {
          if (err.code === 'P2002') {
            throw new ConflictException('This email is already in use');
          }
          throw err;
        }
        createdJunakId = created.id;
      } else {
        const updateData = this.buildUpdateData(req.actionType, req.newData as Record<string, unknown>);
        if (req.actionType === ApprovalActionType.CHANGE_HURTOK) {
          const junak = await tx.user.findUnique({ where: { id: req.junakId! } });
          if (junak?.archivedAt) {
            throw new BadRequestException('Юнак архівований');
          }
          if (updateData.hurtokId) {
            await this.validateHurtokBelongsToKurin(updateData.hurtokId as string, actor.kurinId);
          }
        }
        try {
          await tx.user.update({ where: { id: req.junakId! }, data: updateData });
        } catch (err: any) {
          if (err.code === 'P2002') {
            throw new ConflictException('This email is already in use');
          }
          throw err;
        }
      }

      // Conditional claim (not a plain update): a concurrent reject() may have
      // decided this request after loadPendingRequestForKurin ran. Throwing
      // here rolls back the side effects above (e.g. the created junak).
      const claim = await tx.approvalRequest.updateMany({
        where: { id: requestId, status: ApprovalStatus.PENDING },
        data: { status: ApprovalStatus.APPROVED, approvedById: actor.userId, decidedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Request already decided');
      }
      return tx.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
    });

    if (createdJunakId) {
      await this.judgeBookSync.appendNewJunak(actor.kurinId, createdJunakId);
    }

    return updatedRequest;
  }

  private async approveBulkImport(req: { id: string; newData: unknown }, actor: CurrentUserPayload) {
    // Validate the payload shape before claiming: a malformed request must
    // fail with a clear 400 while still PENDING (so it can be rejected),
    // not get stuck APPROVED with nothing processed.
    const data = req.newData as { rows?: unknown } | null;
    if (!data || !Array.isArray(data.rows)) {
      throw new BadRequestException('Запит пошкоджений: відсутній список рядків для імпорту');
    }
    const rows = data.rows as ResolvedJunakRow[];

    const claim = await this.prisma.approvalRequest.updateMany({
      where: { id: req.id, status: ApprovalStatus.PENDING },
      data: { status: ApprovalStatus.APPROVED, approvedById: actor.userId, decidedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new BadRequestException('Request already decided');
    }

    const results = [];
    let processingError: string | undefined;
    try {
      for (const row of rows) {
        results.push(
          await this.rowProcessor.processRow(actor.kurinId, row, row.rowIndex, actor, {
            restrictProtectedTargets: true,
          }),
        );
      }
    } catch (error) {
      // processRow catches its own per-row errors, so reaching here means
      // something outside a single row failed (e.g. DB connection loss, a
      // non-object row). The request is already APPROVED and some rows may
      // have been applied — record that instead of leaving APPROVED with no
      // results at all. The raw error goes to the log only, not to the client.
      this.logger.error(
        `Bulk import ${req.id} aborted after ${results.length}/${rows.length} rows: ${(error as Error).message}`,
        (error as Error).stack,
      );
      processingError = `Обробку перервано після ${results.length} з ${rows.length} рядків через внутрішню помилку. Частину рядків уже застосовано — перевірте результати.`;
    }

    return this.prisma.approvalRequest.update({
      where: { id: req.id },
      data: { newData: { rows, results, ...(processingError ? { processingError } : {}) } as any },
    });
  }

  async reject(requestId: string, actor: CurrentUserPayload) {
    await this.loadPendingRequestForKurin(requestId, actor.kurinId);
    // Conditional claim so a concurrent approve() can't be overwritten with
    // REJECTED after it already applied its changes (same pattern as
    // approveBulkImport / the ARCHIVE_JUNAK branch).
    const claim = await this.prisma.approvalRequest.updateMany({
      where: { id: requestId, status: ApprovalStatus.PENDING },
      data: { status: ApprovalStatus.REJECTED, approvedById: actor.userId, decidedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new BadRequestException('Request already decided');
    }
    return this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
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
        return { firstName: junak.firstName, lastName: junak.lastName };
      default:
        return undefined;
    }
  }
}
