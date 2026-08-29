import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalActionType, ApprovalStatus, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';

@Injectable()
export class ApprovalRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateApprovalRequestDto, actor: CurrentUserPayload) {
    if (dto.actionType === ApprovalActionType.CREATE_JUNAK && dto.junakId) {
      throw new BadRequestException('junakId must not be provided for CREATE_JUNAK');
    }
    if (dto.actionType !== ApprovalActionType.CREATE_JUNAK && !dto.junakId) {
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

    return this.prisma.$transaction(async (tx) => {
      if (req.actionType === ApprovalActionType.CREATE_JUNAK) {
        const data = req.newData as {
          firstName: string;
          lastName: string;
          email: string;
          hurtokId: string;
          birthDate?: string;
        };
        await this.validateHurtokBelongsToKurin(data.hurtokId, actor.kurinId);
        await tx.user.create({
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
      default:
        return undefined;
    }
  }
}
