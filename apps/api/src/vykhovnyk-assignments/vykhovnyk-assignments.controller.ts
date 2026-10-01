import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { VykhovnykAssignmentsService } from './vykhovnyk-assignments.service';
import { AssignVykhovnykDto } from './dto/assign-vykhovnyk.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vykhovnyk-assignments')
export class VykhovnykAssignmentsController {
  constructor(private readonly service: VykhovnykAssignmentsService) {}

  @Post()
  assign(@Body() dto: AssignVykhovnykDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.assign(dto, user);
  }

  @Delete(':id')
  unassign(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.unassign(id, user);
  }

  @Get()
  list(@Query('hurtokId') hurtokId: string | undefined, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user, hurtokId);
  }
}
