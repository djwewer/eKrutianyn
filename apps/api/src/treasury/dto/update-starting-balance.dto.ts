import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

// Stored in a Postgres INT4 column — bounding it here turns an out-of-range
// value into a clean 400 instead of an uncaught Prisma connector error (500).
const INT4_MIN = -2_147_483_648;
const INT4_MAX = 2_147_483_647;

export class UpdateStartingBalanceDto {
  @Type(() => Number) @IsInt() @Min(INT4_MIN) @Max(INT4_MAX) startingBalanceCents: number;
}
