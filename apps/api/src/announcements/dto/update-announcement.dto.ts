import { IsArray, IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';

export class UpdateAnnouncementDto {
  @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @IsObject() content: Record<string, unknown>;
  @IsArray() @IsString({ each: true }) imageIds: string[];
}
