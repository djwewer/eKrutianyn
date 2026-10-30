import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakRemarksService } from './junak-remarks.service';
import { CreateRemarkDto } from './dto/create-remark.dto';
import { UpdateRemarkDto } from './dto/update-remark.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:junakId/remarks')
export class JunakRemarksController {
  constructor(private readonly service: JunakRemarksService) {}

  @Post()
  create(@Param('junakId') junakId: string, @Body() dto: CreateRemarkDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(junakId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('junakId') junakId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRemarkDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(junakId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('junakId') junakId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(junakId, id, user);
  }
}
