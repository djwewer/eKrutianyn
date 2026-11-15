import { IsEmail, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateAdminUserDto {
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsNotEmpty() lastName: string;
  @IsEmail() email: string;
  @IsUUID() kurinId: string;
}
