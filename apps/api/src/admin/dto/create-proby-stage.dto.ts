import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateProbyStageDto {
  @IsInt() @Min(1) order: number;
  @IsString() @IsNotEmpty() name: string;
}
