import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateOwnProfileDto {
  @IsOptional() @IsString() nickname?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsDateString() birthDate?: string;
}
