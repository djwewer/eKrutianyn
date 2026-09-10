import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateGuardianContactDto {
  @IsOptional() @IsNotEmpty() @IsString() name?: string;
  @IsOptional() @IsNotEmpty() @IsString() phone?: string;
  @IsOptional() @IsString() role?: string | null;
  @IsOptional() @IsString() email?: string | null;
}
