import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ChangeKurinNumberDto {
  @IsString() @IsNotEmpty() @Matches(/^[\p{L}\p{N}][\p{L}\p{N} \-]{0,23}$/u) newNumber: string;
}
