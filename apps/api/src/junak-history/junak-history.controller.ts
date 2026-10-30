import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakHistoryService } from './junak-history.service';
import { UpdateHistoryDatesDto } from './dto/update-history-dates.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:junakId/history')
export class JunakHistoryController {
  constructor(private readonly service: JunakHistoryService) {}

  @Patch('dates')
  updateDates(@Param('junakId') junakId: string, @Body() dto: UpdateHistoryDatesDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateDates(junakId, dto, user);
  }
}
