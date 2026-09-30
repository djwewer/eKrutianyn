import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { google } from 'googleapis';
import { Readable } from 'stream';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type GoogleAuthClient = InstanceType<typeof google.auth.OAuth2>;

@Injectable()
export class GoogleDriveService {
  constructor(private readonly prisma: PrismaService) {}

  getAuthUrl(state: string): string {
    const client = this.createOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_FILE_SCOPE, EMAIL_SCOPE],
      state,
    });
  }

  async handleCallback(kurinId: string, code: string): Promise<{ email: string }> {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new ServiceUnavailableException(
        'Google не повернув довгостроковий токен доступу — спробуйте підключити ще раз',
      );
    }
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email ?? 'невідомо';
    await this.prisma.kurin.update({
      where: { id: kurinId },
      data: {
        driveRefreshToken: tokens.refresh_token,
        driveConnectedEmail: email,
        driveConnectedAt: new Date(),
      },
    });
    return { email };
  }

  async getPickerAccessToken(kurinId: string): Promise<string> {
    const client = await this.getAuthorizedClient(kurinId);
    const { token } = await client.getAccessToken();
    if (!token) {
      throw new ServiceUnavailableException('Не вдалося отримати токен доступу до Google Drive');
    }
    return token;
  }

  async uploadFile(
    kurinId: string,
    folderId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<{ fileId: string; url: string }> {
    const client = await this.getAuthorizedClient(kurinId);
    const drive = google.drive({ version: 'v3', auth: client });
    const res = await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id',
    });
    const fileId = res.data.id;
    if (!fileId) {
      throw new Error('Failed to upload file to Drive');
    }
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    return { fileId, url: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000` };
  }

  async readSheetValues(kurinId: string, spreadsheetId: string): Promise<string[][]> {
    const client = await this.getAuthorizedClient(kurinId);
    const mimeType = await this.getFileMimeType(client, spreadsheetId);
    if (mimeType === XLSX_MIME_TYPE) {
      return this.readXlsxValues(client, spreadsheetId);
    }
    const sheets = google.sheets({ version: 'v4', auth: client });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:ZZ',
    });
    return (res.data.values ?? []) as string[][];
  }

  async appendSheetRow(kurinId: string, spreadsheetId: string, values: string[]): Promise<void> {
    const client = await this.getAuthorizedClient(kurinId);
    const mimeType = await this.getFileMimeType(client, spreadsheetId);
    if (mimeType === XLSX_MIME_TYPE) {
      await this.appendXlsxRow(client, spreadsheetId, values);
      return;
    }
    const sheets = google.sheets({ version: 'v4', auth: client });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:ZZ',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    });
  }

  private async getFileMimeType(client: GoogleAuthClient, fileId: string): Promise<string> {
    const drive = google.drive({ version: 'v3', auth: client });
    const res = await drive.files.get({ fileId, fields: 'mimeType' });
    return res.data.mimeType ?? '';
  }

  private async downloadFileBuffer(client: GoogleAuthClient, fileId: string): Promise<Buffer> {
    const drive = google.drive({ version: 'v3', auth: client });
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return Buffer.from(res.data as ArrayBuffer);
  }

  private async readXlsxValues(client: GoogleAuthClient, fileId: string): Promise<string[][]> {
    const buffer = await this.downloadFileBuffer(client, fileId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const cells = (row.values as ExcelJS.CellValue[]).slice(1);
      rows.push(cells.map((cell) => this.xlsxCellToString(cell)));
    });
    return rows;
  }

  private async appendXlsxRow(client: GoogleAuthClient, fileId: string, values: string[]): Promise<void> {
    const buffer = await this.downloadFileBuffer(client, fileId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('Книга судді не містить жодного аркуша');
    }
    worksheet.addRow(values);
    const updatedBuffer = await workbook.xlsx.writeBuffer();
    const drive = google.drive({ version: 'v3', auth: client });
    await drive.files.update({
      fileId,
      media: { mimeType: XLSX_MIME_TYPE, body: Readable.from(Buffer.from(updatedBuffer)) },
    });
  }

  private xlsxCellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object') {
      if ('text' in value) return String((value as { text: unknown }).text ?? '');
      if ('result' in value) return String((value as { result: unknown }).result ?? '');
      if ('richText' in value) {
        return (value as { richText: { text: string }[] }).richText.map((part) => part.text).join('');
      }
    }
    return String(value);
  }

  private createOAuthClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI,
    );
  }

  private async getAuthorizedClient(kurinId: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin?.driveRefreshToken) {
      throw new ServiceUnavailableException('Курінь ще не підключив Google Drive');
    }
    const client = this.createOAuthClient();
    client.setCredentials({ refresh_token: kurin.driveRefreshToken });
    return client;
  }
}
