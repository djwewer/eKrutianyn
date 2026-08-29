import { IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';
import { ApprovalActionType } from '@prisma/client';

export class CreateApprovalRequestDto {
  @IsEnum(ApprovalActionType) actionType: ApprovalActionType;
  @IsOptional() @IsUUID() junakId?: string;
  @IsObject() newData: Record<string, unknown>;
}
