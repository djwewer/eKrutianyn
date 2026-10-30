import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakVfvService } from './junak-vfv.service';
import { CreateVfvDto } from './dto/create-vfv.dto';
import { UpdateVfvDto } from './dto/update-vfv.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:junakId/vfv')
export class JunakVfvController {
  constructor(private readonly service: JunakVfvService) {}

  @Post()
  create(@Param('junakId') junakId: string, @Body() dto: CreateVfvDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(junakId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('junakId') junakId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVfvDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(junakId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('junakId') junakId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(junakId, id, user);
  }
}
