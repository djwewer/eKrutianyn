import { IsDateString, IsOptional } from 'class-validator';

/** undefined = no change, null = clear, YYYY-MM-DD = set. */
export class UpdateHistoryDatesDto {
  @IsOptional() @IsDateString({ strict: true }) upyJoinedAt?: string | null;
  @IsOptional() @IsDateString({ strict: true }) plastOathAt?: string | null;
}
