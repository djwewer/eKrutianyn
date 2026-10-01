import { IsDateString, IsOptional, ValidateIf } from 'class-validator';

export class UpdateHurtokDto {
  @IsOptional()
  @ValidateIf((o) => o.foundedAt !== null)
  @IsDateString()
  foundedAt?: string | null;
}
