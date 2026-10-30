import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakCampsService } from './junak-camps.service';
import { CreateCampDto } from './dto/create-camp.dto';
import { UpdateCampDto } from './dto/update-camp.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:junakId/camps')
export class JunakCampsController {
  constructor(private readonly service: JunakCampsService) {}

  @Post()
  create(@Param('junakId') junakId: string, @Body() dto: CreateCampDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(junakId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('junakId') junakId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCampDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(junakId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('junakId') junakId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(junakId, id, user);
  }
}
