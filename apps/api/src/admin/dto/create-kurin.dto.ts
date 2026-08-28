import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { KurinGender } from '@prisma/client';

export class CreateKurinDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() kurinNumber: string;
  @IsEnum(KurinGender) gender: KurinGender;
  @IsString() @IsNotEmpty() stanytsia: string;
  @IsUUID() probyProgramId: string;
}
