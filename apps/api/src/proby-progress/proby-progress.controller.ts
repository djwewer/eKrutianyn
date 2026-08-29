import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ProbyProgressService } from './proby-progress.service';

@UseGuards(JwtAuthGuard)
@Controller('junaky/:junakId/progress')
export class ProbyProgressController {
  constructor(private readonly service: ProbyProgressService) {}

  @Get()
  getProgress(@Param('junakId') junakId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getProgressFor(junakId, user);
  }
}
