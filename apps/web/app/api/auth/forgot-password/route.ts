import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const apiRes = await fetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return new NextResponse(await apiRes.text(), { status: apiRes.status });
}
