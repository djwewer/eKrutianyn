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
    const isKurinniy = await isKurinniyForUser(this.prisma, payload.sub);
    const positions = await getActiveKurinPositions(this.prisma, payload.sub, payload.kurinId);
    return { userId: payload.sub, role: payload.role, kurinId: payload.kurinId, isKurinniy, positions };
  }
}
