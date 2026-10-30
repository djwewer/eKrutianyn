import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakPastPositionsService } from './junak-past-positions.service';
import { CreatePastPositionDto } from './dto/create-past-position.dto';
import { UpdatePastPositionDto } from './dto/update-past-position.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:junakId/past-positions')
export class JunakPastPositionsController {
  constructor(private readonly service: JunakPastPositionsService) {}

  @Post()
  create(@Param('junakId') junakId: string, @Body() dto: CreatePastPositionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(junakId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('junakId') junakId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePastPositionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(junakId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('junakId') junakId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(junakId, id, user);
  }
}
