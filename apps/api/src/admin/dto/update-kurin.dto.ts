import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateKurinDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() @IsNotEmpty() @Matches(/^[\p{L}\p{N}][\p{L}\p{N} \-]{0,23}$/u) kurinNumber?: string;
}
