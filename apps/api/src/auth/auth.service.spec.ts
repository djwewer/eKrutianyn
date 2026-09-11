import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
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
      kurinPosition: { findFirst: jest.fn().mockResolvedValue(null) },
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
    it('signs a JWT carrying sub/role/kurinId/isKurinniy/kurinNumber and it decodes back', () => {
      const { accessToken } = service.signToken('user-1', Role.ZVYAZKOVYI, 'kurin-1', false, '75');
      const decoded: any = jwtService.verify(accessToken);
      expect(decoded).toMatchObject({
        sub: 'user-1',
        role: Role.ZVYAZKOVYI,
        kurinId: 'kurin-1',
        isKurinniy: false,
        kurinNumber: '75',
      });
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
});
