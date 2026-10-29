import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { SkillGroup } from '@prisma/client';
import { SkillLevelInputDto } from './create-skill.dto';

export class UpdateSkillDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsEnum(SkillGroup) group?: SkillGroup;
  /** When present, replaces the whole set of levels (missing levels are removed unless achieved). */
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => SkillLevelInputDto)
  levels?: SkillLevelInputDto[];
}
