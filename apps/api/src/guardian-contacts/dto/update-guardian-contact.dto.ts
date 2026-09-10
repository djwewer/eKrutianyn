import { IsOptional, IsString } from 'class-validator';

export class UpdateGuardianContactDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() email?: string;
}
