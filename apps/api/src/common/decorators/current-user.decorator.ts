import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PositionType, Role } from '@prisma/client';

export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
  positions: PositionType[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
