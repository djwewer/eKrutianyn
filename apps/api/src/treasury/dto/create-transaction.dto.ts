import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { TreasuryTransactionType } from '@prisma/client';

export class CreateTransactionDto {
  @IsEnum(TreasuryTransactionType) type: TreasuryTransactionType;
  @Type(() => Number) @IsInt() @Min(1) amountCents: number;
  @IsString() @IsNotEmpty() description: string;
  @IsDateString() occurredAt: string;
}
