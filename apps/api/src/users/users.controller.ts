import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateContactInfoDto } from './dto/update-contact-info.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Roles(Role.ZVYAZKOVYI)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user.kurinId);
  }

  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findById(user.userId);
  }

  @Patch('me/password')
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.changeOwnPassword(user.userId, dto);
  }

  @Patch('me/email')
  changeEmail(@Body() dto: ChangeEmailDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.requestEmailChange(user.userId, dto);
  }

  @Get()
  list(
    @Query('role', new ParseEnumPipe(Role, { optional: true })) role: Role | undefined,
    @Query('hurtokId') hurtokId: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.list(user, { role, hurtokId });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findScoped(id, user);
  }

  @Roles(Role.KURINNYI, Role.ZVYAZKOVYI)
  @Patch(':id/contact-info')
  updateContactInfo(
    @Param('id') id: string,
    @Body() dto: UpdateContactInfoDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateContactInfo(id, dto, user.kurinId);
  }
}
