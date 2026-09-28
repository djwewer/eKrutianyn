import { IsArray } from 'class-validator';

export class SaveJunakImportMappingDto {
  @IsArray() columnMapping: { column: string; header: string; field: string }[];
  @IsArray() positionValueMapping: { rawValue: string; positionType: string | null }[];
}
