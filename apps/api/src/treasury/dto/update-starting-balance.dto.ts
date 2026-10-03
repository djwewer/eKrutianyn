import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class UpdateStartingBalanceDto {
  @Type(() => Number) @IsInt() startingBalanceCents: number;
}
