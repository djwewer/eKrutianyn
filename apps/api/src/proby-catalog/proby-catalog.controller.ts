import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ProbyCatalogService } from './proby-catalog.service';

@UseGuards(JwtAuthGuard)
@Controller('proby-programs')
export class ProbyCatalogController {
  constructor(private readonly service: ProbyCatalogService) {}

  @Get('current')
  getCurrent(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getCurrentForKurin(user.kurinId);
  }
}
