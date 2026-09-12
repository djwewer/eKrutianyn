import { IsEnum } from 'class-validator';
import { ProbyProgramVersion } from '@prisma/client';

export class ChangeProbyProgramDto {
  @IsEnum(ProbyProgramVersion)
  version: ProbyProgramVersion;
}
