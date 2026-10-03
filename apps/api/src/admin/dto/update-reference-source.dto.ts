import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateReferenceSourceDto {
  @IsOptional() @IsUrl() url?: string;
  @IsOptional() @IsString() @IsNotEmpty() label?: string;
  @IsOptional() @IsString() probyPointId?: string | null;
}
