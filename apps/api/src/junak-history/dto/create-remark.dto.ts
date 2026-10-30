import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { JunakRemarkKind } from '@prisma/client';

export class CreateRemarkDto {
  @IsEnum(JunakRemarkKind) kind: JunakRemarkKind;
  /** За що. Required, non-blank (checked in the service). */
  @IsString() @MaxLength(1000) text: string;
  /** Як виправити. Required for WARNING, not accepted for AWARD (checked in the service). */
  @IsOptional() @IsString() @MaxLength(1000) howToFix?: string | null;
  @IsDateString({ strict: true }) date: string;
}
