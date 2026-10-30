import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVfvDto {
  /** YYYY-MM-DD, optional (the date of a VFV is not always known). */
  @IsOptional() @IsDateString({ strict: true }) achievedAt?: string | null;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}
