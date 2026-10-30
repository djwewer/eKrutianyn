import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PositionScope } from '@prisma/client';

export class UpdatePastPositionDto {
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsEnum(PositionScope) scope?: PositionScope;
  @IsOptional() @IsInt() yearFrom?: number;
  @IsOptional() @IsInt() yearTo?: number | null;
}
