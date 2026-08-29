import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HurtkyService } from './hurtky.service';
import { CreateHurtokDto } from './dto/create-hurtok.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hurtky')
export class HurtkyController {
  constructor(private readonly service: HurtkyService) {}

  @Roles(Role.ZVYAZKOVYI)
  @Post()
  create(@Body() dto: CreateHurtokDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user.kurinId);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listForKurin(user.kurinId);
  }

  @Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)
  @Get(':id/board')
  board(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getBoard(id, user);
  }
}
