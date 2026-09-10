import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGuardianContactDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() email?: string;
}
