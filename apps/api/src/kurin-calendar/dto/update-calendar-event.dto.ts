import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateCalendarEventDto {
  @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
