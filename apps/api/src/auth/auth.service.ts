import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleTokenVerifierService } from './google-token-verifier.service';

export interface JwtPayload {
  sub: string;
  role: Role;
  kurinId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly googleVerifier: GoogleTokenVerifierService,
  ) {}

  hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  validatePassword(plain: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  signToken(userId: string, role: Role, kurinId: string): { accessToken: string } {
    const payload: JwtPayload = { sub: userId, role, kurinId };
    return { accessToken: this.jwtService.sign(payload) };
  }

  async loginWithPassword(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await this.validatePassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.signToken(user.id, user.role, user.kurinId);
  }

  async loginWithGoogle(idToken: string): Promise<{ accessToken: string }> {
    const verified = await this.googleVerifier.verify(idToken);
    if (!verified) {
      throw new UnauthorizedException('Invalid Google token');
    }
    const user = await this.prisma.user.findUnique({ where: { email: verified.email } });
    if (!user) {
      throw new UnauthorizedException('No account found for this email');
    }
    if (!user.googleId) {
      await this.prisma.user.update({ where: { id: user.id }, data: { googleId: verified.sub } });
    }
    return this.signToken(user.id, user.role, user.kurinId);
  }
}
