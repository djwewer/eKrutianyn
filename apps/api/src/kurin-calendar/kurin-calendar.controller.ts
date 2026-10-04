import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { KurinCalendarService } from './kurin-calendar.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

@UseGuards(JwtAuthGuard)
@Controller('kurins/:kurinId/calendar-events')
export class KurinCalendarController {
  constructor(private readonly service: KurinCalendarService) {}

  @Get()
  list(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(kurinId, user);
  }

  @Post()
  create(@Param('kurinId') kurinId: string, @Body() dto: CreateCalendarEventDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(kurinId, dto, user);
  }

  @Patch(':eventId')
  update(
    @Param('kurinId') kurinId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateCalendarEventDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(kurinId, eventId, dto, user);
  }

  @Delete(':eventId')
  @HttpCode(204)
  async remove(
    @Param('kurinId') kurinId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.service.remove(kurinId, eventId, user);
  }
}
