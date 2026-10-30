import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** undefined = no change, null = clear. */
export class UpdateVfvDto {
  @IsOptional() @IsDateString({ strict: true }) achievedAt?: string | null;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}
