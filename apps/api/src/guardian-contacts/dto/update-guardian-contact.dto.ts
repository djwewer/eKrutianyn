import { GuardianRelation } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateGuardianContactDto {
  @IsOptional() @IsNotEmpty() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(GuardianRelation) relation?: GuardianRelation;
  @IsOptional() @IsString() role?: string | null;
  @IsOptional() @IsString() email?: string | null;
}
