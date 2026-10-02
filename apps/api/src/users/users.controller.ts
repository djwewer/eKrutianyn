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
        // A client-supplied mimetype is just a request header — never trust
        // it alone. image/svg+xml in particular can carry a <script> tag,
        // which would run on this app's own origin once served back from
        // GET /users/:id/photo. This is a first, cheap rejection; the real
        // check is the magic-byte sniff in UsersService.updateOwnPhoto.
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        callback(
          allowed.includes(file.mimetype) ? null : new BadRequestException('Дозволені лише зображення (JPEG, PNG, WebP, GIF)'),
          allowed.includes(file.mimetype),
        );
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
    // Defense in depth even though mimetype is now sniffed server-side, not
    // trusted from the upload: nosniff stops the browser from reinterpreting
    // the response as something else, and the CSP stops any script from
    // running if a hostile byte sequence ever did slip through, since the
    // photo is served from this app's own origin.
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    // private, not public: this endpoint is access-controlled (findScoped),
    // so a shared cache must not serve one viewer's response to another.
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
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
