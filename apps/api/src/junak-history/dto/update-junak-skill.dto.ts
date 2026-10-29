import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** The level itself is not changeable — remove the record and add another one. */
export class UpdateJunakSkillDto {
  @IsOptional() @IsDateString({ strict: true }) achievedAt?: string | null;
  @IsOptional() @IsString() @MaxLength(120) examiner?: string | null;
  @IsOptional() @IsString() @MaxLength(50) certificateNumber?: string | null;
}
