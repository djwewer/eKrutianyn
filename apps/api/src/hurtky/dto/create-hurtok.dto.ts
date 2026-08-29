import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateHurtokDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() number?: string;
}
