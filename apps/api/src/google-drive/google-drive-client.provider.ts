import { google, drive_v3 } from 'googleapis';

export const GOOGLE_DRIVE_CLIENT = 'GOOGLE_DRIVE_CLIENT';

export function createGoogleDriveClient(): drive_v3.Drive {
  const keyJson = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? '', 'base64').toString('utf-8');
  const credentials = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}
