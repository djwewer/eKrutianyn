import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { GuardianContactsService } from './guardian-contacts.service';
import { CreateGuardianContactDto } from './dto/create-guardian-contact.dto';
import { UpdateGuardianContactDto } from './dto/update-guardian-contact.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users/:junakId/guardian-contacts')
export class GuardianContactsController {
  constructor(private readonly service: GuardianContactsService) {}

  @Get()
  list(@Param('junakId') junakId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(junakId, user);
  }

  @Post()
  create(
    @Param('junakId') junakId: string,
    @Body() dto: CreateGuardianContactDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(junakId, dto, user);
  }

  @Patch(':guardianId')
  update(
    @Param('junakId') junakId: string,
    @Param('guardianId') guardianId: string,
    @Body() dto: UpdateGuardianContactDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(junakId, guardianId, dto, user);
  }

  @Delete(':guardianId')
  remove(
    @Param('junakId') junakId: string,
    @Param('guardianId') guardianId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(junakId, guardianId, user);
  }
}
