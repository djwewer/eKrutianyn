import { GuardianRelation } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGuardianContactDto {
  @IsString() @IsNotEmpty() name: string;
  /** Optional: the judge often doesn't have a number yet and adds it later. */
  @IsOptional() @IsString() phone?: string;
  /** MOTHER / FATHER are the standard two; anyone else is a GUARDIAN. Defaults to GUARDIAN. */
  @IsOptional() @IsEnum(GuardianRelation) relation?: GuardianRelation;
  /** Free-text clarification for a GUARDIAN ("бабуся", "тітка"). */
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() email?: string;
}
