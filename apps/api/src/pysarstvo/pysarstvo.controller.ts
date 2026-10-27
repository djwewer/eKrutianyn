import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PysarstvoService } from './pysarstvo.service';
import { CreateApdDto } from './dto/create-apd.dto';

@UseGuards(JwtAuthGuard)
@Controller('kurins/:kurinId/pysarstvo')
export class PysarstvoController {
  constructor(private readonly service: PysarstvoService) {}

  @Get('pseudos')
  listPseudos(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.listPseudoCandidates(kurinId, user);
  }

  @Post('apd')
  createApd(
    @Param('kurinId') kurinId: string,
    @Body() dto: CreateApdDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createApd(kurinId, dto, user);
  }
}
