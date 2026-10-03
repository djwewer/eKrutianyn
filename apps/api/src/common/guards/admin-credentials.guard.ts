import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

// Second, independent factor alongside AdminKeyGuard: a separate
// username+password pair, also compared timing-safe against plaintext env
// vars (the same model ADMIN_API_KEY already uses). Both guards must pass —
// a leaked admin key alone, or a guessed password alone, is not enough.
function safeEqual(actual: unknown, expected: string | undefined): boolean {
  return (
    typeof actual === 'string' &&
    !!expected &&
    actual.length === expected.length &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  );
}

@Injectable()
export class AdminCredentialsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const username = request.headers['x-admin-username'];
    const password = request.headers['x-admin-password'];
    if (
      !safeEqual(username, process.env.ADMIN_USERNAME) ||
      !safeEqual(password, process.env.ADMIN_PASSWORD)
    ) {
      throw new UnauthorizedException('Invalid admin credentials');
    }
    return true;
  }
}
