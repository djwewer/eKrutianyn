import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HurtkyService } from './hurtky.service';
import { CreateHurtokDto } from './dto/create-hurtok.dto';
import { UpdateHurtokDto } from './dto/update-hurtok.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hurtky')
export class HurtkyController {
  constructor(private readonly service: HurtkyService) {}

  @Roles(Role.ZVYAZKOVYI)
  @Post()
  create(@Body() dto: CreateHurtokDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user.kurinId);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHurtokDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(id, dto, user);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Patch(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.archiveHurtok(id, user);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listForKurin(user.kurinId);
  }

  @Roles(Role.VYKHOVNYK, Role.ZVYAZKOVYI)
  @Get('by-slug/:slug')
  membersBySlug(@Param('slug') slug: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getMembersBySlug(slug, user);
  }
}
