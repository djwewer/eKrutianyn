import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { isKurinniyForUser } from '../../common/kurinniy.util';
import { getActiveKurinPositions } from '../../common/positions.util';

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
    // select only what's actually used below — an unselected findUnique
    // would load photoData (up to 5MB) on every single authenticated
    // request in the app, since this runs on every request.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { archivedAt: true },
    });
    if (!user || user.archivedAt) {
      throw new UnauthorizedException('Account not found or archived');
    }
    const isKurinniy = await isKurinniyForUser(this.prisma, payload.sub);
    const positions = await getActiveKurinPositions(this.prisma, payload.sub, payload.kurinId);
    return { userId: payload.sub, role: payload.role, kurinId: payload.kurinId, isKurinniy, positions };
  }
}
