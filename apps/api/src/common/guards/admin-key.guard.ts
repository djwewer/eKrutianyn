import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key = request.headers['x-admin-key'];
    const expected = process.env.ADMIN_API_KEY;
    if (
      typeof key !== 'string' ||
      !expected ||
      key.length !== expected.length ||
      !timingSafeEqual(Buffer.from(key), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }
}
