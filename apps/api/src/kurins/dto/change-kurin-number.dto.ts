import { IsNotEmpty, IsString } from 'class-validator';

export class ChangeKurinNumberDto {
  @IsString() @IsNotEmpty() newNumber: string;
}
