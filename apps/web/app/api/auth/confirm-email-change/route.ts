import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const { token } = await request.json();
  const apiRes = await fetch(`${API_URL}/auth/confirm-email-change?token=${encodeURIComponent(token)}`);
  return new NextResponse(await apiRes.text(), { status: apiRes.status });
}
