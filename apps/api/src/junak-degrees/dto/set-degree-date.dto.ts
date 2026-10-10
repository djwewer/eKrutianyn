import { IsDateString, ValidateIf } from 'class-validator';

export class SetDegreeDateDto {
  /** YYYY-MM-DD. `null` is accepted only for SKOB (clears the date). */
  @ValidateIf((o) => o.date !== null)
  @IsDateString({ strict: true })
  date: string | null;
}
