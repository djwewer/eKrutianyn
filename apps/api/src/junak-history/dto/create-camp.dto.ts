import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { JunakActivityRole } from '@prisma/client';

export class CreateCampDto {
  @IsString() @MaxLength(120) name: string;
  @IsInt() yearFrom: number;
  @IsOptional() @IsInt() yearTo?: number | null;
  @IsEnum(JunakActivityRole) role: JunakActivityRole;
}
