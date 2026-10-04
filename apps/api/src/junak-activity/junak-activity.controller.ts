import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakActivityService } from './junak-activity.service';
import { CreateActivityEntryDto } from './dto/create-activity-entry.dto';
import { UpdateActivityEntryDto } from './dto/update-activity-entry.dto';

// A junak's own personal activity log — not yet visible to vykhovnyk/
// zvyazkovyi (see Global Constraints: still in production, free-form only).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.JUNAK)
@Controller('users/me/activity')
export class JunakActivityController {
  constructor(private readonly service: JunakActivityService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.list(user.userId);
  }

  @Post()
  create(@Body() dto: CreateActivityEntryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(user.userId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateActivityEntryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    await this.service.remove(user.userId, id);
  }
}
