import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateJunakSkillDto {
  @IsUUID() levelId: string;
  /** YYYY-MM-DD */
  @IsDateString({ strict: true }) achievedAt: string;
  @IsOptional() @IsString() @MaxLength(120) examiner?: string | null;
  @IsOptional() @IsString() @MaxLength(50) certificateNumber?: string | null;
}
