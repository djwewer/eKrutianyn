import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalActionType, ApprovalStatus, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';

@Injectable()
export class ApprovalRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateApprovalRequestDto, actor: CurrentUserPayload) {
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
