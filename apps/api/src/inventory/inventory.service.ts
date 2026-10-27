import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AuditAction, PositionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

const PHOTOS_ORDER = { photos: { orderBy: { createdAt: 'asc' as const } } };

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleDrive: GoogleDriveService,
    private readonly audit: AuditService,
  ) {}

  private recordItem(
    action: AuditAction,
    kurinId: string,
    actor: CurrentUserPayload,
    itemId: string,
    details: Record<string, string | number>,
  ) {
    return this.audit.record({ kurinId, actorId: actor.userId, action, entityId: itemId, details });
  }

  private assertKurinMatches(kurinId: string, actor: CurrentUserPayload) {
    if (kurinId !== actor.kurinId) {
      throw new NotFoundException('Kurin not found');
    }
  }

  private assertCanWrite(actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.INTENDANT)) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private assertCanRead(actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.INTENDANT) && !actor.isKurinniy) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  async list(kurinId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanRead(actor);
    return this.prisma.inventoryItem.findMany({
      where: { kurinId },
      include: PHOTOS_ORDER,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    kurinId: string,
    dto: CreateInventoryItemDto,
    files: Express.Multer.File[],
    actor: CurrentUserPayload,
  ) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    const item = await this.prisma.inventoryItem.create({
      data: {
        kurinId,
        name: dto.name,
        description: dto.description,
        quantity: dto.quantity,
        createdById: actor.userId,
      },
    });
    for (const file of files) {
      await this.uploadAndAttachPhoto(kurinId, item.id, file);
    }
    await this.recordItem(AuditAction.INVENTORY_ITEM_CREATED, kurinId, actor, item.id, {
      itemName: item.name,
      quantity: item.quantity,
    });
    return this.prisma.inventoryItem.findUnique({ where: { id: item.id }, include: PHOTOS_ORDER });
  }

  async update(kurinId: string, itemId: string, dto: UpdateInventoryItemDto, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    await this.findItemOrThrow(kurinId, itemId);
    const updated = await this.prisma.inventoryItem.update({
      where: { id: itemId },
      data: { name: dto.name, description: dto.description, quantity: dto.quantity },
      include: PHOTOS_ORDER,
    });
    await this.recordItem(AuditAction.INVENTORY_ITEM_UPDATED, kurinId, actor, itemId, {
      itemName: updated.name,
      quantity: updated.quantity,
    });
    return updated;
  }

  async remove(kurinId: string, itemId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    const item = await this.findItemOrThrow(kurinId, itemId);
    await this.prisma.inventoryItem.delete({ where: { id: itemId } });
    await this.recordItem(AuditAction.INVENTORY_ITEM_DELETED, kurinId, actor, itemId, {
      itemName: item.name,
      quantity: item.quantity,
    });
    return { success: true };
  }

  async addPhoto(kurinId: string, itemId: string, file: Express.Multer.File | undefined, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    const item = await this.findItemOrThrow(kurinId, itemId);
    if (!file) {
      throw new BadRequestException('Photo file is required');
    }
    const photo = await this.uploadAndAttachPhoto(kurinId, itemId, file);
    await this.recordItem(AuditAction.INVENTORY_PHOTO_ADDED, kurinId, actor, itemId, { itemName: item.name });
    return photo;
  }

  async removePhoto(kurinId: string, itemId: string, photoId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    const item = await this.findItemOrThrow(kurinId, itemId);
    const photo = await this.prisma.inventoryItemPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.itemId !== itemId) {
      throw new NotFoundException('Photo not found');
    }
    await this.prisma.inventoryItemPhoto.delete({ where: { id: photoId } });
    await this.recordItem(AuditAction.INVENTORY_PHOTO_REMOVED, kurinId, actor, itemId, { itemName: item.name });
    return { success: true };
  }

  private async findItemOrThrow(kurinId: string, itemId: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item || item.kurinId !== kurinId) {
      throw new NotFoundException('Item not found');
    }
    return item;
  }

  private async uploadAndAttachPhoto(kurinId: string, itemId: string, file: Express.Multer.File) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin?.driveFolderId) {
      throw new ServiceUnavailableException(
        'Курінь ще не підключив Google Drive або не обрав папку для реманенту',
      );
    }
    const { fileId, url } = await this.googleDrive.uploadFile(
      kurinId,
      kurin.driveFolderId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    return this.prisma.inventoryItemPhoto.create({ data: { itemId, driveFileId: fileId, url } });
  }
}
