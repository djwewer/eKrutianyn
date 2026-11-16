import { NextRequest, NextResponse } from 'next/server';

// /admin has its own two factors (admin key + login/password, checked by the
// API on every /admin/* call), so it must not require an єПластун session.
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/welcome', '/confirm-email-change', '/privacy', '/terms', '/admin'];

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
  // manifest.json and sw.js must be reachable unauthenticated too — a junak
  // may try "Add to Home Screen" (required for Web Push on iOS) straight
  // from the login page, before ever signing in.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo.webp|manifest.json|sw.js).*)'],
};
