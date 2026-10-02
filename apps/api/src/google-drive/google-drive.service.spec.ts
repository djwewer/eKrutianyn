import { ServiceUnavailableException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

const mockOAuth2Instance = {
  generateAuthUrl: jest.fn(),
  getToken: jest.fn(),
  setCredentials: jest.fn(),
  getAccessToken: jest.fn(),
  revokeToken: jest.fn(),
};
const mockFilesCreate = jest.fn();
const mockFilesGet = jest.fn();
const mockFilesUpdate = jest.fn();
const mockPermissionsCreate = jest.fn();
const mockUserinfoGet = jest.fn();
const mockSheetsValuesGet = jest.fn();
const mockSheetsValuesAppend = jest.fn();
const mockSheetsValuesBatchUpdate = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn().mockImplementation(() => mockOAuth2Instance) },
    drive: jest.fn().mockImplementation(() => ({
      files: { create: mockFilesCreate, get: mockFilesGet, update: mockFilesUpdate },
      permissions: { create: mockPermissionsCreate },
    })),
    oauth2: jest.fn().mockImplementation(() => ({
      userinfo: { get: mockUserinfoGet },
    })),
    sheets: jest.fn().mockImplementation(() => ({
      spreadsheets: {
        values: { get: mockSheetsValuesGet, append: mockSheetsValuesAppend, batchUpdate: mockSheetsValuesBatchUpdate },
      },
    })),
  },
}));

import { GoogleDriveService } from './google-drive.service';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function buildXlsxBuffer(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

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
    // Default: a native Google Sheet, so existing tests exercise the Sheets API path
    // unchanged. Tests for the xlsx path override this with mockImplementation.
    mockFilesGet.mockResolvedValue({ data: { mimeType: 'application/vnd.google-apps.spreadsheet' } });
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

  describe('disconnect', () => {
    it('revokes the refresh token and clears all stored drive state', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ driveRefreshToken: 'refresh-abc' });
      mockOAuth2Instance.revokeToken.mockResolvedValue({});

      await service.disconnect('kurin-1');

      expect(mockOAuth2Instance.revokeToken).toHaveBeenCalledWith('refresh-abc');
      expect(prisma.kurin.update).toHaveBeenCalledWith({
        where: { id: 'kurin-1' },
        data: {
          driveRefreshToken: null,
          driveConnectedEmail: null,
          driveConnectedAt: null,
          driveFolderId: null,
          driveFolderName: null,
        },
      });
    });

    it('still clears stored state when revoking with Google fails', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ driveRefreshToken: 'refresh-abc' });
      mockOAuth2Instance.revokeToken.mockRejectedValue(new Error('token already invalid'));

      await service.disconnect('kurin-1');

      expect(prisma.kurin.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ driveRefreshToken: null }) }),
      );
    });

    it('skips the revoke call for a kurin that was never connected', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ driveRefreshToken: null });

      await service.disconnect('kurin-1');

      expect(mockOAuth2Instance.revokeToken).not.toHaveBeenCalled();
      expect(prisma.kurin.update).toHaveBeenCalled();
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

  describe('readSheetValues', () => {
    it('returns the sheet grid for a connected kurin', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: 'refresh-abc' });
      mockSheetsValuesGet.mockResolvedValue({ data: { values: [['A', 'B'], ['1', '2']] } });

      const result = await service.readSheetValues('kurin-1', 'sheet-id-1');

      expect(result).toEqual([['A', 'B'], ['1', '2']]);
    });

    it('throws ServiceUnavailableException when the kurin has not connected Drive', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: null });

      await expect(service.readSheetValues('kurin-1', 'sheet-id-1')).rejects.toThrow(ServiceUnavailableException);
    });

    it('reads values from an uploaded .xlsx file instead of calling the Sheets API', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: 'refresh-abc' });
      const buffer = await buildXlsxBuffer([
        ['ПІБ', 'Псевдо'],
        ['Іван Петренко', 'Сокіл'],
      ]);
      mockFilesGet.mockImplementation((params: { fields?: string; alt?: string }) => {
        if (params.fields === 'mimeType') return Promise.resolve({ data: { mimeType: XLSX_MIME_TYPE } });
        if (params.alt === 'media') return Promise.resolve({ data: buffer });
        throw new Error(`unexpected files.get call: ${JSON.stringify(params)}`);
      });

      const result = await service.readSheetValues('kurin-1', 'file-id-1');

      expect(result).toEqual([
        ['ПІБ', 'Псевдо'],
        ['Іван Петренко', 'Сокіл'],
      ]);
      expect(mockSheetsValuesGet).not.toHaveBeenCalled();
    });
  });

  describe('appendSheetRow', () => {
    it('appends a row to the connected sheet', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: 'refresh-abc' });
      mockSheetsValuesAppend.mockResolvedValue({});

      await service.appendSheetRow('kurin-1', 'sheet-id-1', ['Іван', 'Петренко']);

      expect(mockSheetsValuesAppend).toHaveBeenCalledWith({
        spreadsheetId: 'sheet-id-1',
        range: 'A:ZZ',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [['Іван', 'Петренко']] },
      });
    });

    it('appends a row to an uploaded .xlsx file by re-uploading the modified workbook', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: 'refresh-abc' });
      const buffer = await buildXlsxBuffer([['ПІБ', 'Псевдо']]);
      mockFilesGet.mockImplementation((params: { fields?: string; alt?: string }) => {
        if (params.fields === 'mimeType') return Promise.resolve({ data: { mimeType: XLSX_MIME_TYPE } });
        if (params.alt === 'media') return Promise.resolve({ data: buffer });
        throw new Error(`unexpected files.get call: ${JSON.stringify(params)}`);
      });
      mockFilesUpdate.mockResolvedValue({});

      await service.appendSheetRow('kurin-1', 'file-id-1', ['Іван Петренко', 'Сокіл']);

      expect(mockSheetsValuesAppend).not.toHaveBeenCalled();
      expect(mockFilesUpdate).toHaveBeenCalledTimes(1);
      const updateCall = mockFilesUpdate.mock.calls[0][0];
      expect(updateCall.fileId).toBe('file-id-1');
      expect(updateCall.media.mimeType).toBe(XLSX_MIME_TYPE);

      // Confirm the re-uploaded workbook actually contains the appended row.
      const chunks: Buffer[] = [];
      for await (const chunk of updateCall.media.body) {
        chunks.push(chunk as Buffer);
      }
      const uploadedWorkbook = new ExcelJS.Workbook();
      await uploadedWorkbook.xlsx.load(Buffer.concat(chunks) as any);
      const rows: string[][] = [];
      uploadedWorkbook.worksheets[0].eachRow((row) => rows.push((row.values as unknown[]).slice(1).map(String)));
      expect(rows).toEqual([
        ['ПІБ', 'Псевдо'],
        ['Іван Петренко', 'Сокіл'],
      ]);
    });
  });

  describe('updateCellValues', () => {
    it('does nothing when there are no updates', async () => {
      await service.updateCellValues('kurin-1', 'sheet-id-1', []);

      expect(prisma.kurin.findUnique).not.toHaveBeenCalled();
      expect(mockFilesGet).not.toHaveBeenCalled();
      expect(mockSheetsValuesBatchUpdate).not.toHaveBeenCalled();
      expect(mockFilesUpdate).not.toHaveBeenCalled();
    });

    it('batches a single batchUpdate call for a native Google Sheet', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: 'refresh-abc' });
      mockSheetsValuesBatchUpdate.mockResolvedValue({});

      await service.updateCellValues('kurin-1', 'sheet-id-1', [
        { row: 5, column: 'C', value: '2024-01-15' },
        { row: 6, column: 'D', value: 'ivan@example.com' },
      ]);

      expect(mockSheetsValuesBatchUpdate).toHaveBeenCalledTimes(1);
      expect(mockSheetsValuesBatchUpdate).toHaveBeenCalledWith({
        spreadsheetId: 'sheet-id-1',
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: 'C5', values: [['2024-01-15']] },
            { range: 'D6', values: [['ivan@example.com']] },
          ],
        },
      });
    });

    it('updates cells in an uploaded .xlsx file by downloading once and re-uploading once', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', driveRefreshToken: 'refresh-abc' });
      const buffer = await buildXlsxBuffer([
        ['ПІБ', 'Псевдо', 'Дата проби', 'Email'],
        ['Іван Петренко', 'Сокіл', '', ''],
      ]);
      mockFilesGet.mockImplementation((params: { fields?: string; alt?: string }) => {
        if (params.fields === 'mimeType') return Promise.resolve({ data: { mimeType: XLSX_MIME_TYPE } });
        if (params.alt === 'media') return Promise.resolve({ data: buffer });
        throw new Error(`unexpected files.get call: ${JSON.stringify(params)}`);
      });
      mockFilesUpdate.mockResolvedValue({});

      await service.updateCellValues('kurin-1', 'file-id-1', [
        { row: 2, column: 'C', value: '2024-01-15' },
        { row: 2, column: 'D', value: 'ivan@example.com' },
      ]);

      expect(mockSheetsValuesBatchUpdate).not.toHaveBeenCalled();
      expect(mockFilesGet).toHaveBeenCalledTimes(2); // mimeType check + download
      expect(mockFilesUpdate).toHaveBeenCalledTimes(1);
      const updateCall = mockFilesUpdate.mock.calls[0][0];
      expect(updateCall.fileId).toBe('file-id-1');
      expect(updateCall.media.mimeType).toBe(XLSX_MIME_TYPE);

      const chunks: Buffer[] = [];
      for await (const chunk of updateCall.media.body) {
        chunks.push(chunk as Buffer);
      }
      const uploadedWorkbook = new ExcelJS.Workbook();
      await uploadedWorkbook.xlsx.load(Buffer.concat(chunks) as any);
      const rows: string[][] = [];
      uploadedWorkbook.worksheets[0].eachRow((row) => rows.push((row.values as unknown[]).slice(1).map(String)));
      expect(rows).toEqual([
        ['ПІБ', 'Псевдо', 'Дата проби', 'Email'],
        ['Іван Петренко', 'Сокіл', '2024-01-15', 'ivan@example.com'],
      ]);
    });
  });
});
