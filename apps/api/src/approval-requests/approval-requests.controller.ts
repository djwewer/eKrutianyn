import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
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
}
