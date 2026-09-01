import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleTokenVerifierService } from './google-token-verifier.service';
import { MailService } from '../mail/mail.service';
import { generateToken, hashToken } from '../common/token.util';

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
    private readonly mailService: MailService,
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

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return;
    }
    const { raw, hash } = generateToken();
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${raw}`;
    await this.mailService.sendPasswordReset(user.email, resetUrl);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }
    const passwordHash = await this.hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null, id: { not: resetToken.id } },
        data: { usedAt: new Date() },
      }),
    ]);
  }
}
