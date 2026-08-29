import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateProbyPointDto {
  @IsInt() @Min(1) order: number;
  @IsString() @IsNotEmpty() description: string;
}
