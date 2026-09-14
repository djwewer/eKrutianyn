import { Logger } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';

export const GOOGLE_DRIVE_CLIENT = 'GOOGLE_DRIVE_CLIENT';

const logger = new Logger('GoogleDriveClient');

export function createGoogleDriveClient(): drive_v3.Drive | null {
  try {
    const keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? '', 'base64').toString('utf-8');
    const credentials = JSON.parse(keyJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
  } catch (error) {
    logger.warn(
      `GOOGLE_SERVICE_ACCOUNT_KEY відсутній або невалідний — Google Drive вимкнено: ${(error as Error).message}`,
    );
    return null;
  }
}
