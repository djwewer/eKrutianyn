import { IsOptional, IsUUID } from 'class-validator';

export class UpdateHurtokDto {
  @IsOptional() @IsUUID() hurtokId?: string | null;
}
