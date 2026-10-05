import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCalendarEventDto {
  @IsString() @IsNotEmpty() @MaxLength(50) title: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsDateString() startDate: string;
  @IsOptional() @IsDateString() endDate?: string;
}
