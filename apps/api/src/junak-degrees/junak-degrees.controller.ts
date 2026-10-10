import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { DEGREE_ORDER, DegreeKey } from '../common/degrees.util';
import { JunakDegreesService } from './junak-degrees.service';
import { SetDegreeDateDto } from './dto/set-degree-date.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/:id/degrees')
export class JunakDegreesController {
  constructor(private readonly service: JunakDegreesService) {}

  @Get()
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.get(id, user);
  }

  @Put(':key')
  setDate(
    @Param('id') id: string,
    @Param('key') key: string,
    @Body() dto: SetDegreeDateDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!DEGREE_ORDER.includes(key as DegreeKey)) {
      throw new BadRequestException('Невідомий ступінь');
    }
    return this.service.setDate(id, key as DegreeKey, dto.date, user);
  }
}
