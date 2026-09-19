import { IsNotEmpty, IsString } from 'class-validator';

export class SetGoogleDriveFolderDto {
  @IsString() @IsNotEmpty() folderId: string;
  @IsString() @IsNotEmpty() folderName: string;
}
