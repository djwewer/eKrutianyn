import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { GOOGLE_DRIVE_CLIENT } from './google-drive-client.provider';

@Injectable()
export class GoogleDriveService {
  constructor(
    @Inject(GOOGLE_DRIVE_CLIENT) private readonly drive: drive_v3.Drive,
    private readonly prisma: PrismaService,
  ) {}

  async ensureKurinFolder(kurinId: string): Promise<string> {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    if (kurin.driveFolderId) {
      return kurin.driveFolderId;
    }
    const folderId = await this.createFolder(kurin.name, process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID as string);
    await this.prisma.kurin.update({ where: { id: kurinId }, data: { driveFolderId: folderId } });
    return folderId;
  }

  async ensureSubfolder(parentFolderId: string, name: string): Promise<string> {
    const existing = await this.drive.files.list({
      q: `'${parentFolderId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
    });
    const found = existing.data.files?.[0];
    if (found?.id) {
      return found.id;
    }
    return this.createFolder(name, parentFolderId);
  }

  async uploadFile(
    folderId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<{ fileId: string; url: string }> {
    const res = await this.drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id',
    });
    const fileId = res.data.id;
    if (!fileId) {
      throw new Error('Failed to upload file to Drive');
    }
    await this.drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    return { fileId, url: `https://drive.google.com/uc?id=${fileId}` };
  }

  private async createFolder(name: string, parentId: string): Promise<string> {
    const res = await this.drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    });
    const id = res.data.id;
    if (!id) {
      throw new Error('Failed to create Drive folder');
    }
    return id;
  }
}
