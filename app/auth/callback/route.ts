import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    // Redirect to home with code - we'll handle it client-side
    return NextResponse.redirect(new URL(`/?code=${code}`, request.url));
  }

  return NextResponse.redirect(new URL('/', request.url));
}
