import { ForbiddenException } from '@nestjs/common';

export const KURIN_DEACTIVATED_CODE = 'KURIN_DEACTIVATED';
export const KURIN_DEACTIVATED_MESSAGE = 'Курінь тимчасово деактивовано. Зверніться до звʼязкового.';

export function kurinDeactivatedException(): ForbiddenException {
  return new ForbiddenException({ code: KURIN_DEACTIVATED_CODE, message: KURIN_DEACTIVATED_MESSAGE });
}
