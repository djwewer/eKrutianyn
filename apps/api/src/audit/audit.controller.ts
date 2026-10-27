import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AuditService } from './audit.service';
import { ListAuditLogDto } from './dto/list-audit-log.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ZVYAZKOVYI)
@Controller('kurins/:kurinId/audit-log')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  list(@Param('kurinId') kurinId: string, @Query() dto: ListAuditLogDto, @CurrentUser() user: CurrentUserPayload) {
    if (kurinId !== user.kurinId) {
      throw new NotFoundException('Kurin not found');
    }
    return this.service.list(kurinId, dto);
  }
}
