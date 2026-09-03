import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PositionScope, PositionType } from '@prisma/client';

export class AssignPositionDto {
  @IsUUID() userId: string;
  @IsEnum(PositionScope) scope: PositionScope;
  @IsEnum(PositionType) positionType: PositionType;
  @IsOptional() @IsUUID() hurtokId?: string;
}
