import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

@UseGuards(JwtAuthGuard)
@Controller('kurins/:kurinId/inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  list(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(kurinId, user);
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('photos', undefined, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 10 },
      fileFilter: (req, file, callback) => {
        callback(file.mimetype.startsWith('image/') ? null : new BadRequestException('Дозволені лише зображення'), file.mimetype.startsWith('image/'));
      },
    }),
  )
  create(
    @Param('kurinId') kurinId: string,
    @Body() dto: CreateInventoryItemDto,
    @UploadedFiles() photos: Express.Multer.File[] | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(kurinId, dto, photos ?? [], user);
  }

  @Patch(':itemId')
  update(
    @Param('kurinId') kurinId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(kurinId, itemId, dto, user);
  }

  @Delete(':itemId')
  remove(
    @Param('kurinId') kurinId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(kurinId, itemId, user);
  }

  @Post(':itemId/photos')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, callback) => {
        callback(file.mimetype.startsWith('image/') ? null : new BadRequestException('Дозволені лише зображення'), file.mimetype.startsWith('image/'));
      },
    }),
  )
  addPhoto(
    @Param('kurinId') kurinId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() photo: Express.Multer.File | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.addPhoto(kurinId, itemId, photo, user);
  }

  @Delete(':itemId/photos/:photoId')
  removePhoto(
    @Param('kurinId') kurinId: string,
    @Param('itemId') itemId: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removePhoto(kurinId, itemId, photoId, user);
  }
}
