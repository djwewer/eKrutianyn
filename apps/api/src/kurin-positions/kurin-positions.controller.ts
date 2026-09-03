import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { KurinPositionsService } from './kurin-positions.service';
import { AssignPositionDto } from './dto/assign-position.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kurin-positions')
export class KurinPositionsController {
  constructor(private readonly service: KurinPositionsService) {}

  @Roles(Role.ZVYAZKOVYI)
  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.kurinId);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Post()
  assign(@Body() dto: AssignPositionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.assign(dto, user);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }
}
