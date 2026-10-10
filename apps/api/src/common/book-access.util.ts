import { PositionType, Role } from '@prisma/client';
import { CurrentUserPayload } from './decorators/current-user.decorator';

/** Who keeps the Книга судді data in the app: zvyazkovyi, kurinniy, and the kurin's суддя. */
export function canEditBookData(actor: CurrentUserPayload): boolean {
  return actor.role === Role.ZVYAZKOVYI || actor.isKurinniy || actor.positions.includes(PositionType.SUDDIA);
}
