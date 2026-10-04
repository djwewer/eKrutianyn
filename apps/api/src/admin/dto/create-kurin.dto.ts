import { IsDefined, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { KurinGender } from '@prisma/client';

class CreateKurinZvyazkovyiDto {
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsNotEmpty() lastName: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

export class CreateKurinDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() @IsNotEmpty() @Matches(/^[\p{L}\p{N}][\p{L}\p{N} \-]{0,23}$/u) kurinNumber?: string;
  @IsEnum(KurinGender) gender: KurinGender;
  @IsString() @IsNotEmpty() stanytsia: string;
  @IsUUID() probyProgramId: string;
  @IsOptional() @IsString() driveFolderId?: string;
  @IsOptional() @IsString() driveRefreshToken?: string;
  @IsOptional() @IsString() driveConnectedEmail?: string;
  // Every kurin needs a Зв'язковий to be usable, so the first one is created
  // atomically with the kurin itself rather than as a separate admin step
  // that's easy to forget (see POST /admin/kurins/zvyazkovyi for replacing
  // or adding one to a kurin that already exists).
  @IsDefined() @ValidateNested() @Type(() => CreateKurinZvyazkovyiDto) zvyazkovyi: CreateKurinZvyazkovyiDto;
}
