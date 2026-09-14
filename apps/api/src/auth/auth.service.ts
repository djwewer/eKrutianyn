import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PositionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleTokenVerifierService } from './google-token-verifier.service';
import { MailService } from '../mail/mail.service';
import { generateToken, hashToken } from '../common/token.util';
import { isKurinniyForUser } from '../common/kurinniy.util';
import { getActiveKurinPositions } from '../common/positions.util';

export interface JwtPayload {
  sub: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
  positions: PositionType[];
  kurinNumber: string;
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

  signToken(
    userId: string,
    role: Role,
    kurinId: string,
    isKurinniy: boolean,
    positions: PositionType[],
    kurinNumber: string,
  ): { accessToken: string } {
    const payload: JwtPayload = { sub: userId, role, kurinId, isKurinniy, positions, kurinNumber };
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
    const isKurinniy = await isKurinniyForUser(this.prisma, user.id);
    const positions = await getActiveKurinPositions(this.prisma, user.id, user.kurinId);
    const kurin = await this.prisma.kurin.findUnique({ where: { id: user.kurinId } });
    return this.signToken(user.id, user.role, user.kurinId, isKurinniy, positions, kurin!.kurinNumber);
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
    const isKurinniy = await isKurinniyForUser(this.prisma, user.id);
    const positions = await getActiveKurinPositions(this.prisma, user.id, user.kurinId);
    const kurin = await this.prisma.kurin.findUnique({ where: { id: user.kurinId } });
    return this.signToken(user.id, user.role, user.kurinId, isKurinniy, positions, kurin!.kurinNumber);
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

  async confirmEmailChange(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    const changeRequest = await this.prisma.emailChangeRequest.findUnique({ where: { tokenHash } });
    if (!changeRequest || changeRequest.usedAt || changeRequest.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }
    const existing = await this.prisma.user.findUnique({ where: { email: changeRequest.newEmail } });
    if (existing) {
      throw new BadRequestException('Email already in use');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: changeRequest.userId }, data: { email: changeRequest.newEmail } }),
      this.prisma.emailChangeRequest.update({ where: { id: changeRequest.id }, data: { usedAt: new Date() } }),
    ]);
  }
}
