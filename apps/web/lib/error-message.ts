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

/** Server message for a failed change (400/409 carry a readable reason), else the generic access text, else the fallback. */
export function mutationErrorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status !== 403) {
    const message = (error.body as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return accessErrorMessage(error) ?? fallback;
}
