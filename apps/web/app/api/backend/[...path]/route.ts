import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

async function proxy(request: NextRequest, path: string[]) {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  const targetUrl = `${API_URL}/${path.join('/')}${request.nextUrl.search}`;

  const incomingContentType = request.headers.get('Content-Type');
  const headers: Record<string, string> = { 'Content-Type': incomingContentType ?? 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Forwarded explicitly (not blanket-passthrough) for the admin-guarded
  // endpoints (e.g. the proby-catalog admin area) — these are shared secrets,
  // not a user session, so they travel on their own headers rather than the
  // cookie. Two independent factors (AdminKeyGuard + AdminCredentialsGuard)
  // guard every /admin/* route, so all three headers must make it through.
  for (const name of ['x-admin-key', 'x-admin-username', 'x-admin-password']) {
    const value = request.headers.get(name);
    if (value) {
      headers[name] = value;
    }
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
  });

  // Read as ArrayBuffer, not .text() — reading binary responses (e.g. the
  // user photo endpoint) as text corrupts them via lossy UTF-8 decoding.
  // ArrayBuffer is binary-safe and works identically for JSON responses too.
  const responseBody = await response.arrayBuffer();
  const responseHeaders: Record<string, string> = {
    'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
  };
  // Forward security headers the backend sets for access-controlled binary
  // responses (e.g. GET /users/:id/photo's nosniff/CSP/Cache-Control) —
  // dropping them here would silently undo the backend's XSS defenses.
  for (const name of ['X-Content-Type-Options', 'Content-Security-Policy', 'Cache-Control']) {
    const value = response.headers.get(name);
    if (value) {
      responseHeaders[name] = value;
    }
  }
  // The Fetch spec forbids a body (even an empty one) on a null-body status —
  // passing the (zero-length) ArrayBuffer through unconditionally throws
  // "Invalid response status code 204" for every 204/205/304 the backend sends.
  const hasNullBodyStatus = [204, 205, 304].includes(response.status);
  return new NextResponse(hasNullBodyStatus ? null : responseBody, {
    status: response.status,
    headers: responseHeaders,
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  return proxy(request, (await params).path);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  return proxy(request, (await params).path);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return proxy(request, (await params).path);
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  return proxy(request, (await params).path);
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return proxy(request, (await params).path);
}
