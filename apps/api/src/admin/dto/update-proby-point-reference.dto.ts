import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProbyPointReferenceDto {
  @IsOptional() @IsString() @MaxLength(4000) referenceText: string | null;
}
