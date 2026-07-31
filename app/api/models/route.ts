import { NextResponse } from 'next/server';
import { NIM_FALLBACK } from '@/app/lib/nim-models';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ models: NIM_FALLBACK, fromAPI: false });
}
