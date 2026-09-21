import { ServiceUnavailableException } from '@nestjs/common';

const mockOAuth2Instance = {
  generateAuthUrl: jest.fn(),
  getToken: jest.fn(),
  setCredentials: jest.fn(),
  getAccessToken: jest.fn(),
};
const mockFilesCreate = jest.fn();
const mockPermissionsCreate = jest.fn();
const mockUserinfoGet = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn().mockImplementation(() => mockOAuth2Instance) },
    drive: jest.fn().mockImplementation(() => ({
      files: { create: mockFilesCreate },
      permissions: { create: mockPermissionsCreate },
    })),
    oauth2: jest.fn().mockImplementation(() => ({
      userinfo: { get: mockUserinfoGet },
    })),
  },
}));

import { GoogleDriveService } from './google-drive.service';

describe('GoogleDriveService', () => {
  let service: GoogleDriveService;
  let prisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      kurin: { findUnique: jest.fn(), update: jest.fn() },
    };
    service = new GoogleDriveService(prisma);
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://example.com/callback';
  });

  describe('getAuthUrl', () => {
    it('builds a Google consent URL with the drive.file scope and given state', () => {
      mockOAuth2Instance.generateAuthUrl.mockReturnValue('https://accounts.google.com/mock-url');

      const url = service.getAuthUrl('signed-state-123');

      expect(url).toBe('https://accounts.google.com/mock-url');
      expect(mockOAuth2Instance.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'],
        state: 'signed-state-123',
      });
    });
  });

  describe('handleCallback', () => {
    it('exchanges the code for tokens and saves refresh token + email on the kurin', async () => {
      mockOAuth2Instance.getToken.mockResolvedValue({ tokens: { refresh_token: 'refresh-abc' } });
      mockUserinfoGet.mockResolvedValue({ data: { email: 'zvyazkovyi@example.com' } });

      const result = await service.handleCallback('kurin-1', 'auth-code-xyz');

      expect(result).toEqual({ email: 'zvyazkovyi@example.com' });
      expect(mockOAuth2Instance.getToken).toHaveBeenCalledWith('auth-code-xyz');
      expect(mockOAuth2Instance.setCredentials).toHaveBeenCalledWith({ refresh_token: 'refresh-abc' });
      expect(prisma.kurin.update).toHaveBeenCalledWith({
        where: { id: 'kurin-1' },
        data: expect.objectContaining({
          driveRefreshToken: 'refresh-abc',
          driveConnectedEmail: 'zvyazkovyi@example.com',
        }),
      });
    });

    it('throws ServiceUnavailableException when Google does not return a refresh token', async () => {
      mockOAuth2Instance.getToken.mockResolvedValue({ tokens: {} });

      await expect(service.handleCallback('kurin-1', 'auth-code-xyz')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('getPickerAccessToken', () => {
    it('returns a fresh access token for a connected kurin', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: 'refresh-abc' });
      mockOAuth2Instance.getAccessToken.mockResolvedValue({ token: 'access-token-123' });

      const token = await service.getPickerAccessToken('kurin-1');

      expect(token).toBe('access-token-123');
      expect(mockOAuth2Instance.setCredentials).toHaveBeenCalledWith({ refresh_token: 'refresh-abc' });
    });

    it('throws ServiceUnavailableException when the kurin has not connected Drive', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: null });

      await expect(service.getPickerAccessToken('kurin-1')).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('uploadFile', () => {
    it('uploads the file, makes it link-viewable, and returns its id and url', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: 'refresh-abc' });
      mockFilesCreate.mockResolvedValue({ data: { id: 'file-1' } });
      mockPermissionsCreate.mockResolvedValue({});

      const result = await service.uploadFile('kurin-1', 'folder-1', Buffer.from('data'), 'photo.jpg', 'image/jpeg');

      expect(result).toEqual({ fileId: 'file-1', url: 'https://drive.google.com/thumbnail?id=file-1&sz=w1000' });
      expect(mockPermissionsCreate).toHaveBeenCalledWith({
        fileId: 'file-1',
        requestBody: { role: 'reader', type: 'anyone' },
      });
    });

    it('throws ServiceUnavailableException when the kurin has not connected Drive', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: null });

      await expect(
        service.uploadFile('kurin-1', 'folder-1', Buffer.from('data'), 'photo.jpg', 'image/jpeg'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
