import { IsArray } from 'class-validator';

export class ImportJunakRowsDto {
  @IsArray() rows: unknown[];
}
