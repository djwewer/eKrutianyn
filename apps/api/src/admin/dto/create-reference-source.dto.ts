import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateReferenceSourceDto {
  @IsUrl() url: string;
  @IsString() @IsNotEmpty() label: string;
  @IsOptional() @IsString() probyPointId?: string;
}
