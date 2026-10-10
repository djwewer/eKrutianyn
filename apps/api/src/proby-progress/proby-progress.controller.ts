import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ProbyProgressService } from './proby-progress.service';
import { CloseStageDto } from './dto/close-stage.dto';
import { parseNotFutureDate } from '../common/date.util';

@UseGuards(JwtAuthGuard)
@Controller('junaky/:junakId/progress')
export class ProbyProgressController {
  constructor(private readonly service: ProbyProgressService) {}

  @Get()
  getProgress(@Param('junakId') junakId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getProgressFor(junakId, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)
  @Post(':pointId/confirm')
  confirm(
    @Param('junakId') junakId: string,
    @Param('pointId') pointId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.confirm(junakId, pointId, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)
  @Post(':pointId/unconfirm')
  unconfirm(
    @Param('junakId') junakId: string,
    @Param('pointId') pointId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.unconfirm(junakId, pointId, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)
  @Post('stages/:stageId/close')
  closeStage(
    @Param('junakId') junakId: string,
    @Param('stageId') stageId: string,
    @Body() dto: CloseStageDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.closeStage(junakId, stageId, user, dto.date ? parseNotFutureDate(dto.date) : undefined);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)
  @Post('stages/:stageId/reopen')
  reopenStage(
    @Param('junakId') junakId: string,
    @Param('stageId') stageId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.reopenStage(junakId, stageId, user);
  }
}
