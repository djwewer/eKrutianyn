import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** The kind is fixed at creation; an unknown `kind` field is stripped by the whitelist. */
export class UpdateRemarkDto {
  @IsOptional() @IsString() @MaxLength(1000) text?: string;
  @IsOptional() @IsString() @MaxLength(1000) howToFix?: string | null;
  @IsOptional() @IsDateString({ strict: true }) date?: string;
}
