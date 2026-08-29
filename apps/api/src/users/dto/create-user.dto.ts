import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsNotEmpty() lastName: string;
  @IsEmail() email: string;
  @IsEnum(Role) role: Role;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsUUID() hurtokId?: string;
}
