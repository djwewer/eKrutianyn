import { IsDateString, IsOptional } from 'class-validator';

export class CloseStageDto {
  /** YYYY-MM-DD the degree was actually earned. Defaults to today. */
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}
