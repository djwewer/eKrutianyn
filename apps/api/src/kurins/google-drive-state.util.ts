import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

const STATE_PURPOSE = 'google-drive-connect';

export function signGoogleDriveState(jwtService: JwtService, kurinId: string): string {
  return jwtService.sign({ kurinId, purpose: STATE_PURPOSE }, { expiresIn: '10m' });
}

export function verifyGoogleDriveState(jwtService: JwtService, state: string): string {
  let payload: { kurinId?: string; purpose?: string };
  try {
    payload = jwtService.verify(state);
  } catch {
    throw new BadRequestException('Недійсний або прострочений запит на підключення Google Drive');
  }
  if (payload.purpose !== STATE_PURPOSE || !payload.kurinId) {
    throw new BadRequestException('Недійсний запит на підключення Google Drive');
  }
  return payload.kurinId;
}
