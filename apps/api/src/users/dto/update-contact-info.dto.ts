import { IsOptional, IsString } from 'class-validator';

export class UpdateContactInfoDto {
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() phone?: string;
}
