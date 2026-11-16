import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { kurinDeactivatedException } from '../../common/kurin-deactivated';
import { PositionScope, PositionType, Role } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }
    // One query instead of three (this runs on every authenticated request).
    // Select only what is used: an unselected findUnique would load photoData
    // (up to 5MB). Active positions are filtered in memory: a user holds few.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        archivedAt: true,
        role: true,
        kurin: { select: { deactivatedAt: true } },
        positionsHeld: {
          where: { removedAt: null },
          select: { positionType: true, scope: true, kurinId: true },
        },
      },
    });
    if (!user || user.archivedAt) {
      throw new UnauthorizedException('Account not found or archived');
    }
    // DB role, not payload.role: a stale token must not bypass the check.
    if (user.kurin.deactivatedAt && user.role !== Role.ZVYAZKOVYI) {
      throw kurinDeactivatedException();
    }
    const isKurinniy = user.positionsHeld.some((p) => p.positionType === PositionType.KURINNYI);
    const positions = user.positionsHeld
      .filter((p) => p.scope === PositionScope.KURIN && p.kurinId === payload.kurinId)
      .map((p) => p.positionType);
    return { userId: payload.sub, role: payload.role, kurinId: payload.kurinId, isKurinniy, positions };
  }
}
