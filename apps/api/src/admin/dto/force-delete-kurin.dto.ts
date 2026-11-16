import { IsString, MinLength } from 'class-validator';

export class ForceDeleteKurinDto {
  @IsString()
  @MinLength(1)
  confirmName!: string;
}
