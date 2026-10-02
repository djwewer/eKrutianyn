import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateContactInfoDto } from './dto/update-contact-info.dto';
import { UpdateHurtokDto } from './dto/update-hurtok.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';

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

  @Patch('me')
  updateOwnProfile(@Body() dto: UpdateOwnProfileDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateOwnProfile(user.userId, dto);
  }

  @Patch('me/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, callback) => {
        callback(file.mimetype.startsWith('image/') ? null : new BadRequestException('Дозволені лише зображення'), file.mimetype.startsWith('image/'));
      },
    }),
  )
  updatePhoto(@UploadedFile() photo: Express.Multer.File | undefined, @CurrentUser() user: CurrentUserPayload) {
    if (!photo) {
      throw new BadRequestException('Файл фото обов\'язковий');
    }
    return this.service.updateOwnPhoto(user.userId, photo);
  }

  @Delete('me/photo')
  removePhoto(@CurrentUser() user: CurrentUserPayload) {
    return this.service.removeOwnPhoto(user.userId);
  }

  @Get(':id/photo')
  async getPhoto(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Res() res: Response) {
    const photo = await this.service.getPhoto(id, user);
    if (!photo) {
      throw new NotFoundException('Photo not found');
    }
    res.set('Content-Type', photo.mimeType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(photo.data);
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

  @Patch(':id/contact-info')
  updateContactInfo(
    @Param('id') id: string,
    @Body() dto: UpdateContactInfoDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateContactInfo(id, dto, user);
  }

  @Patch(':id/hurtok')
  updateHurtok(
    @Param('id') id: string,
    @Body() dto: UpdateHurtokDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateHurtok(id, dto, user);
  }

  @Roles(Role.ZVYAZKOVYI)
  @Patch(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.archiveUser(id, user);
  }
}
