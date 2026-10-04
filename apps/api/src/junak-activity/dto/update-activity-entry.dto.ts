import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { JunakActivityRole } from '@prisma/client';

export class UpdateActivityEntryDto {
  @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsEnum(JunakActivityRole) role?: JunakActivityRole;
  @IsOptional() @IsString() description?: string;
}
