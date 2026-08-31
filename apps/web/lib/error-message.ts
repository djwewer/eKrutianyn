import { ApiError } from '@/lib/api-client';

export function accessErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 403) return 'Немає доступу.';
  if (error.status === 404) return 'Не знайдено.';
  return 'Сталася помилка. Спробуйте пізніше.';
}
