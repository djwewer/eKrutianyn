import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { CurrentUserPayload } from '@/lib/types';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) {
    return NextResponse.json(null);
  }

  try {
    const payloadBase64 = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));
    const session: CurrentUserPayload = {
      userId: decoded.sub,
      role: decoded.role,
      kurinId: decoded.kurinId,
    };
    return NextResponse.json(session);
  } catch {
    return NextResponse.json(null);
  }
}
