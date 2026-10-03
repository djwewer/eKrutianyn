import { ApiError } from '@/lib/api-client';

export function accessErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 403) return 'Немає доступу.';
  if (error.status === 404) return 'Не знайдено.';
  if (error.status === 429) {
    const body = error.body as { message?: string } | null;
    return body?.message ?? 'Досягнуто ліміту запитів. Спробуйте пізніше.';
  }
  return 'Сталася помилка. Спробуйте пізніше.';
}
