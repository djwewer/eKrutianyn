import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { JunakActivityRole } from '@prisma/client';

export class CreateActivityEntryDto {
  @IsString() @IsNotEmpty() title: string;
  @IsDateString() occurredAt: string;
  @IsEnum(JunakActivityRole) role: JunakActivityRole;
  @IsOptional() @IsString() description?: string;
}
