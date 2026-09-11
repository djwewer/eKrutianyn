import { Body, Controller, ForbiddenException, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { KurinsService } from './kurins.service';
import { ChangeProbyProgramDto } from './dto/change-proby-program.dto';
import { ChangeKurinNumberDto } from './dto/change-kurin-number.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kurins')
export class KurinsController {
  constructor(private readonly kurinsService: KurinsService) {}

  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.kurinsService.findById(user.kurinId);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Patch(':id/proby-program')
  changeProbyProgram(
    @Param('id') id: string,
    @Body() dto: ChangeProbyProgramDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (id !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    return this.kurinsService.changeProbyProgram(id, dto.newProgramId, user.userId);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Patch(':id/kurin-number')
  changeKurinNumber(
    @Param('id') id: string,
    @Body() dto: ChangeKurinNumberDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (id !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    return this.kurinsService.changeKurinNumber(id, dto.newNumber);
  }
}
