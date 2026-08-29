import { Body, Controller, ForbiddenException, Param, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { KurinsService } from './kurins.service';
import { ChangeProbyProgramDto } from './dto/change-proby-program.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kurins')
export class KurinsController {
  constructor(private readonly kurinsService: KurinsService) {}

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
    return this.kurinsService.changeProbyProgram(id, dto.newProgramId);
  }
}
