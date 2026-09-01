import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ChangeEmailDto {
  @IsEmail() newEmail: string;
  @IsString() @IsNotEmpty() currentPassword: string;
}
