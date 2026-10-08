import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@UseGuards(JwtAuthGuard)
@Controller('kurins/:kurinId/announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  list(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(kurinId, user);
  }

  @Post()
  create(@Param('kurinId') kurinId: string, @Body() dto: CreateAnnouncementDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(kurinId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('kurinId') kurinId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(kurinId, id, dto, user);
  }

  @Delete(':id')
  remove(@Param('kurinId') kurinId: string, @Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(kurinId, id, user);
  }

  @Post('images')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, callback) => {
        callback(
          file.mimetype.startsWith('image/') ? null : new BadRequestException('Дозволені лише зображення'),
          file.mimetype.startsWith('image/'),
        );
      },
    }),
  )
  uploadImage(
    @Param('kurinId') kurinId: string,
    @UploadedFile() image: Express.Multer.File | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!image) {
      throw new BadRequestException('Файл зображення обов\'язковий');
    }
    return this.service.uploadImage(kurinId, image, user);
  }

  @Get('images/:imageId')
  async getImage(
    @Param('kurinId') kurinId: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ) {
    const image = await this.service.getImage(kurinId, imageId, user);
    if (!image) {
      throw new NotFoundException('Image not found');
    }
    res.set('Content-Type', image.mimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(image.data);
  }
}
