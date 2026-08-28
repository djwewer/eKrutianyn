import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleVerifiedIdentity {
  email: string;
  sub: string;
}

@Injectable()
export class GoogleTokenVerifierService {
  private readonly client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  async verify(idToken: string): Promise<GoogleVerifiedIdentity | null> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.sub) return null;
      return { email: payload.email, sub: payload.sub };
    } catch {
      return null;
    }
  }
}
