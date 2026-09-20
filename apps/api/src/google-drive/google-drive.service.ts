import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

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
    return { fileId, url: `https://drive.google.com/uc?id=${fileId}` };
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
