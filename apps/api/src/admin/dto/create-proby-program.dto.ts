import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ProbyProgramVersion } from '@prisma/client';

export class CreateProbyProgramDto {
  @IsEnum(ProbyProgramVersion) version: ProbyProgramVersion;
  @IsString() @IsNotEmpty() name: string;
}
