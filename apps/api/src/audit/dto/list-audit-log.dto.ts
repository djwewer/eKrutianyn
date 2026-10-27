import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { AUDIT_GROUPS, AuditGroup } from '../audit.constants';

export class ListAuditLogDto {
  @IsOptional() @IsIn(Object.keys(AUDIT_GROUPS)) group?: AuditGroup;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsUUID() subjectUserId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
