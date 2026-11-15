import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PositionType, Role, TokenPurpose } from '@prisma/client';
import { hashToken } from '../common/token.util';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let googleVerifier: { verify: jest.Mock };
  let mailService: { sendPasswordReset: jest.Mock };
  const jwtService = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      passwordResetToken: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
      kurinPosition: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      kurin: { findUnique: jest.fn().mockResolvedValue({ kurinNumber: '75' }) },
    };
    googleVerifier = { verify: jest.fn() };
    mailService = { sendPasswordReset: jest.fn() };
    service = new AuthService(prisma, jwtService, googleVerifier as any, mailService as any);
  });

  describe('hashPassword / validatePassword', () => {
    it('hashes a password and validates it against the hash', async () => {
      const hash = await service.hashPassword('correct-horse-battery-staple');
      await expect(service.validatePassword('correct-horse-battery-staple', hash)).resolves.toBe(true);
      await expect(service.validatePassword('wrong-password', hash)).resolves.toBe(false);
    });
  });

  describe('signToken', () => {
    it('signs a JWT carrying sub/role/kurinId/isKurinniy/positions/kurinNumber and it decodes back', () => {
      const { accessToken } = service.signToken('user-1', Role.ZVYAZKOVYI, 'kurin-1', false, [], '75');
      const decoded: any = jwtService.verify(accessToken);
      expect(decoded).toMatchObject({
        sub: 'user-1',
        role: Role.ZVYAZKOVYI,
        kurinId: 'kurin-1',
        isKurinniy: false,
        positions: [],
        kurinNumber: '75',
      });
    });

    it('carries a non-empty positions array through into the signed JWT', () => {
      const { accessToken } = service.signToken(
        'user-1',
        Role.ZVYAZKOVYI,
        'kurin-1',
        false,
        [PositionType.INTENDANT],
        '75',
      );
      const decoded: any = jwtService.verify(accessToken);
      expect(decoded.positions).toEqual([PositionType.INTENDANT]);
    });
  });

  describe('loginWithPassword', () => {
    it('returns a token when email and password match', async () => {
      const hash = await argon2.hash('secret123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        passwordHash: hash,
        role: Role.JUNAK,
        kurinId: 'kurin-1',
      });

      const result = await service.loginWithPassword('a@example.com', 'secret123');
      expect(result.accessToken).toEqual(expect.any(String));
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.loginWithPassword('nobody@example.com', 'x')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the password is wrong', async () => {
      const hash = await argon2.hash('secret123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        passwordHash: hash,
        role: Role.JUNAK,
        kurinId: 'kurin-1',
      });
      await expect(service.loginWithPassword('a@example.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('loginWithGoogle', () => {
    it('returns a token and links googleId when the verified email matches an existing user', async () => {
      googleVerifier.verify.mockResolvedValue({ email: 'a@example.com', sub: 'google-sub-1' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@example.com',
        googleId: null,
        role: Role.JUNAK,
        kurinId: 'kurin-1',
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.loginWithGoogle('fake-id-token');
      expect(result.accessToken).toEqual(expect.any(String));
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { googleId: 'google-sub-1' },
      });
    });

    it('throws UnauthorizedException when no account matches the verified email', async () => {
      googleVerifier.verify.mockResolvedValue({ email: 'nobody@example.com', sub: 'google-sub-2' });
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.loginWithGoogle('fake-id-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the Google token is invalid', async () => {
      googleVerifier.verify.mockResolvedValue(null);
      await expect(service.loginWithGoogle('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });
  describe('invite tokens', () => {
    const MSG = 'Посилання недійсне або вже використане';
    const baseUser = {
      id: 'u1',
      firstName: 'Олена',
      role: Role.JUNAK,
      kurinId: 'k1',
      archivedAt: null,
      kurin: { name: 'Лісові Мавки', kurinNumber: '75' },
    };
    const tok = (over: any = {}) => ({
      id: 't1',
      userId: 'u1',
      purpose: TokenPurpose.INVITE,
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
      user: baseUser,
      ...over,
    });

    it('acceptInvite sets password, clears mustChangePassword, marks token used and returns accessToken', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(tok());
      const result = await service.acceptInvite('raw-token', 'newpassword1');
      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashToken('raw-token') } }),
      );
      const userUpdate = prisma.user.update.mock.calls[0][0];
      expect(userUpdate.where).toEqual({ id: 'u1' });
      expect(userUpdate.data.mustChangePassword).toBe(false);
      await expect(argon2.verify(userUpdate.data.passwordHash, 'newpassword1')).resolves.toBe(true);
      expect(prisma.passwordResetToken.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 't1', purpose: TokenPurpose.INVITE, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(jwtService.verify(result.accessToken)).toMatchObject({ sub: 'u1', kurinId: 'k1', kurinNumber: '75' });
    });

    it.each([
      ['unknown', null],
      ['expired', tok({ expiresAt: new Date(Date.now() - 1000) })],
      ['used', tok({ usedAt: new Date() })],
      ['RESET purpose', tok({ purpose: TokenPurpose.RESET })],
    ])('acceptInvite rejects %s tokens with NotFoundException', async (_n, value) => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(value);
      const p = service.acceptInvite('x', 'newpassword1');
      await expect(p).rejects.toThrow(NotFoundException);
      await expect(p).rejects.toThrow(MSG);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('acceptInvite rejects archived users', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        tok({ user: { ...baseUser, archivedAt: new Date() } }),
      );
      await expect(service.acceptInvite('x', 'newpassword1')).rejects.toThrow(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('acceptInvite loses the claim race: count 0 gives NotFound and the user is not updated', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(tok());
      prisma.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.acceptInvite('x', 'newpassword1')).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('resetPassword rejects INVITE tokens', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(tok());
      await expect(service.resetPassword('x', 'newpassword1')).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('getInviteInfo returns firstName and kurinLabel without consuming the token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(tok());
      await expect(service.getInviteInfo('x')).resolves.toEqual({ firstName: 'Олена', kurinLabel: '№75 Лісові Мавки' });
      expect(prisma.passwordResetToken.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('getInviteInfo throws NotFoundException for an invalid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(service.getInviteInfo('x')).rejects.toThrow(MSG);
    });

    it('requestPasswordReset creates a RESET-purpose token', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
      await service.requestPasswordReset('a@b.c');
      expect(prisma.passwordResetToken.create.mock.calls[0][0].data.purpose).toBe(TokenPurpose.RESET);
    });
  });
});
