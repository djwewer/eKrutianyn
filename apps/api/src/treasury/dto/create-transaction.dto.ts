import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { TreasuryTransactionType } from '@prisma/client';

// amountCents is stored in a Postgres INT4 column — bounding it here turns an
// out-of-range value into a clean 400 instead of an uncaught Prisma connector
// error (500) when the driver tries to fit it into a 32-bit integer.
const INT4_MAX = 2_147_483_647;

export class CreateTransactionDto {
  @IsEnum(TreasuryTransactionType) type: TreasuryTransactionType;
  @Type(() => Number) @IsInt() @Min(1) @Max(INT4_MAX) amountCents: number;
  @IsString() @IsNotEmpty() description: string;
  @IsDateString() occurredAt: string;
}
