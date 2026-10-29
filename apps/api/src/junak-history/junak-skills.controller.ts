import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JunakSkillsService } from './junak-skills.service';
import { CreateJunakSkillDto } from './dto/create-junak-skill.dto';
import { UpdateJunakSkillDto } from './dto/update-junak-skill.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:junakId/skills')
export class JunakSkillsController {
  constructor(private readonly service: JunakSkillsService) {}

  @Get()
  list(@Param('junakId') junakId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(junakId, user);
  }

  @Post()
  create(@Param('junakId') junakId: string, @Body() dto: CreateJunakSkillDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(junakId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('junakId') junakId: string,
    @Param('id') id: string,
    @Body() dto: UpdateJunakSkillDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(junakId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('junakId') junakId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(junakId, id, user);
  }
}
