import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SetPysarstvoFolderDto {
  @IsString() @IsNotEmpty() @MaxLength(200) folderId: string;
  @IsString() @IsNotEmpty() @MaxLength(300) folderName: string;
}
