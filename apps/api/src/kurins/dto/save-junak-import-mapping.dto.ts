import { IsArray, IsEnum, IsIn, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PositionType } from '@prisma/client';

const JUNAK_IMPORT_FIELDS = [
  'FIRST_LAST_NAME',
  'NICKNAME',
  'BIRTH_DATE',
  'HURTOK',
  'EMAIL',
  'PHONE',
  'DEGREE_PRYHYLNYK_DATE',
  'DEGREE_UCHASNYK_DATE',
  'DEGREE_ROZVIDUVACH_DATE',
  'HURTOK_POSITION',
  'KURIN_POSITION',
  'GUARDIAN_1_NAME',
  'GUARDIAN_1_PHONE',
  'GUARDIAN_1_EMAIL',
  'GUARDIAN_2_NAME',
  'GUARDIAN_2_PHONE',
  'GUARDIAN_2_EMAIL',
] as const;

class ColumnMappingEntryDto {
  @Matches(/^[A-Z]{1,3}$/) column: string;
  @IsString() header: string;
  @IsIn(JUNAK_IMPORT_FIELDS) field: string;
}

class PositionValueMappingEntryDto {
  @IsString() rawValue: string;
  @IsOptional() @IsEnum(PositionType) positionType: PositionType | null;
}

export class SaveJunakImportMappingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnMappingEntryDto)
  columnMapping: ColumnMappingEntryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PositionValueMappingEntryDto)
  positionValueMapping: PositionValueMappingEntryDto[];
}
