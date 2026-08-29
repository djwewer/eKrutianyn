import { IsNotEmpty, IsString } from 'class-validator';

export class CreateProbyCategoryDto {
  @IsString() @IsNotEmpty() name: string;
}
