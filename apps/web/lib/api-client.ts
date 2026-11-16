export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

export const KURIN_DEACTIVATED_MESSAGE = 'Курінь тимчасово деактивовано. Зверніться до звʼязкового.';

export function isKurinDeactivated(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === 'KURIN_DEACTIVATED';
}

// A deactivated kurin blocks every authed request: drop the session and show the login notice.
async function handleKurinDeactivated(status: number, body: unknown) {
  if (status !== 403 || !isKurinDeactivated(body) || typeof window === 'undefined') return;
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.assign('/login?reason=kurin-deactivated');
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/backend${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // no JSON body
    }
    await handleKurinDeactivated(res.status, body);
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, formData: FormData, method: string = 'POST'): Promise<T> {
  const res = await fetch(`/api/backend${path}`, { method, body: formData });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // no JSON body
    }
    await handleKurinDeactivated(res.status, body);
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
