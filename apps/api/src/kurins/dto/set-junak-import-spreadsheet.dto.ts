import { IsNotEmpty, IsString } from 'class-validator';

export class SetJunakImportSpreadsheetDto {
  @IsString() @IsNotEmpty() spreadsheetId: string;
  @IsString() @IsNotEmpty() spreadsheetName: string;
}
