import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { AuditGroup } from '../audit.constants';

export class ListAuditLogDto {
  @IsOptional() @IsIn(['PROBY', 'PEOPLE', 'MONEY', 'SETTINGS']) group?: AuditGroup;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsUUID() subjectUserId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
