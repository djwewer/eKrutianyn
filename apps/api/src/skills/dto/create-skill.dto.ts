import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SkillGroup } from '@prisma/client';

export class SkillLevelInputDto {
  @IsIn([1, 2, 3]) level: number;
  /** One requirement per entry; blank entries are dropped by the service. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(1000, { each: true })
  requirements: string[];
  @IsOptional() @IsString() @MaxLength(200) note?: string | null;
}

export class CreateSkillDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsEnum(SkillGroup) group: SkillGroup;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => SkillLevelInputDto)
  levels: SkillLevelInputDto[];
}
