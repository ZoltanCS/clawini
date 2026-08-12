import { NextResponse } from 'next/server';
import { NIM_FALLBACK, GEMINI_CATALOG } from '@/app/lib/nim-models';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Include Gemini models so the client catalog matches what's actually selectable
  return NextResponse.json({ models: [...NIM_FALLBACK, ...GEMINI_CATALOG], fromAPI: false });
}
