import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateInventoryItemDto {
  @IsString() @IsNotEmpty() @MaxLength(50) name: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @Type(() => Number) @IsInt() @Min(0) quantity: number;
}
