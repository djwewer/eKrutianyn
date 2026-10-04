import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCalendarEventDto {
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() description?: string;
  @IsDateString() startDate: string;
  @IsOptional() @IsDateString() endDate?: string;
}
