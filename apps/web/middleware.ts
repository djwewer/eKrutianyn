import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/confirm-email-change'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('accessToken');
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
