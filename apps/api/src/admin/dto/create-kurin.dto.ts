import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { KurinGender } from '@prisma/client';

export class CreateKurinDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() @IsNotEmpty() @Matches(/^[\p{L}\p{N}][\p{L}\p{N} \-]{0,23}$/u) kurinNumber?: string;
  @IsEnum(KurinGender) gender: KurinGender;
  @IsString() @IsNotEmpty() stanytsia: string;
  @IsUUID() probyProgramId: string;
  @IsOptional() @IsString() driveFolderId?: string;
}
