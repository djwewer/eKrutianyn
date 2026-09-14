import { NotFoundException } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';

describe('GoogleDriveService', () => {
  let service: GoogleDriveService;
  let prisma: any;
  let drive: any;

  beforeEach(() => {
    prisma = {
      kurin: { findUnique: jest.fn(), update: jest.fn() },
    };
    drive = {
      files: {
        list: jest.fn(),
        create: jest.fn(),
      },
      permissions: {
        create: jest.fn(),
      },
    };
    service = new GoogleDriveService(drive, prisma);
  });

  describe('ensureKurinFolder', () => {
    it('returns the existing driveFolderId without calling Drive if already set', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'k1', name: 'Курінь 75', driveFolderId: 'existing-folder' });

      const result = await service.ensureKurinFolder('k1');

      expect(result).toBe('existing-folder');
      expect(drive.files.create).not.toHaveBeenCalled();
    });

    it('creates a new folder and saves it when driveFolderId is null', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'k1', name: 'Курінь 75', driveFolderId: null });
      drive.files.create.mockResolvedValue({ data: { id: 'new-folder-id' } });

      const result = await service.ensureKurinFolder('k1');

      expect(result).toBe('new-folder-id');
      expect(prisma.kurin.update).toHaveBeenCalledWith({
        where: { id: 'k1' },
        data: { driveFolderId: 'new-folder-id' },
      });
    });

    it('throws NotFoundException when the kurin does not exist', async () => {
      prisma.kurin.findUnique.mockResolvedValue(null);
      await expect(service.ensureKurinFolder('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('ensureSubfolder', () => {
    it('returns an existing subfolder id without creating a new one', async () => {
      drive.files.list.mockResolvedValue({ data: { files: [{ id: 'existing-sub' }] } });

      const result = await service.ensureSubfolder('parent-1', 'Реманент');

      expect(result).toBe('existing-sub');
      expect(drive.files.create).not.toHaveBeenCalled();
    });

    it('creates a new subfolder when none is found', async () => {
      drive.files.list.mockResolvedValue({ data: { files: [] } });
      drive.files.create.mockResolvedValue({ data: { id: 'new-sub' } });

      const result = await service.ensureSubfolder('parent-1', 'Реманент');

      expect(result).toBe('new-sub');
    });
  });

  describe('uploadFile', () => {
    it('uploads the file, makes it link-viewable, and returns its id and url', async () => {
      drive.files.create.mockResolvedValue({ data: { id: 'file-1' } });
      drive.permissions.create.mockResolvedValue({});

      const result = await service.uploadFile('folder-1', Buffer.from('data'), 'photo.jpg', 'image/jpeg');

      expect(result).toEqual({ fileId: 'file-1', url: 'https://drive.google.com/uc?id=file-1' });
      expect(drive.permissions.create).toHaveBeenCalledWith({
        fileId: 'file-1',
        requestBody: { role: 'reader', type: 'anyone' },
      });
    });
  });
});
