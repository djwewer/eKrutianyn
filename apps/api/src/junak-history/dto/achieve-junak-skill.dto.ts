import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class AchieveJunakSkillDto {
  /** YYYY-MM-DD */
  @IsDateString({ strict: true }) achievedAt: string;
  @IsOptional() @IsString() @MaxLength(120) examiner?: string | null;
  @IsOptional() @IsString() @MaxLength(50) certificateNumber?: string | null;
}
