import { IsArray, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString() @IsNotEmpty() title: string;
  @IsObject() content: Record<string, unknown>;
  @IsArray() @IsString({ each: true }) imageIds: string[];
}
