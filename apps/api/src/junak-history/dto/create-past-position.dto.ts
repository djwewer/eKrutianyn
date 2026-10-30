import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PositionScope } from '@prisma/client';

export class CreatePastPositionDto {
  @IsString() @MaxLength(100) title: string;
  @IsEnum(PositionScope) scope: PositionScope;
  @IsInt() yearFrom: number;
  @IsOptional() @IsInt() yearTo?: number | null;
}
