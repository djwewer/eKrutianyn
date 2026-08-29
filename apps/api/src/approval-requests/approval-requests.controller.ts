import { Body, Controller, Get, Param, ParseEnumPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApprovalStatus, Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ApprovalRequestsService } from './approval-requests.service';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('approval-requests')
export class ApprovalRequestsController {
  constructor(private readonly service: ApprovalRequestsService) {}

  @Roles(Role.KURINNYI)
  @Post()
  create(@Body() dto: CreateApprovalRequestDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Get()
  list(
    @Query('status', new ParseEnumPipe(ApprovalStatus, { optional: true })) status: ApprovalStatus | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.list(user.kurinId, status);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.approve(id, user);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.reject(id, user);
  }
}
