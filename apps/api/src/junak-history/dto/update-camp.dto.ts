import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { JunakActivityRole } from '@prisma/client';

export class UpdateCampDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsInt() yearFrom?: number;
  /** null = the camp has no separate end year. */
  @IsOptional() @IsInt() yearTo?: number | null;
  @IsOptional() @IsEnum(JunakActivityRole) role?: JunakActivityRole;
}
