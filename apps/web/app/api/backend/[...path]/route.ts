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
  return new NextResponse(responseBody, {
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
