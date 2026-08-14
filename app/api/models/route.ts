import { NextResponse } from 'next/server';
import { NIM_FALLBACK, GEMINI_CATALOG, OPENCODE_CATALOG } from '@/app/lib/nim-models';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Include Gemini + OpenCode models so the client catalog matches what's actually selectable
  return NextResponse.json({ models: [...NIM_FALLBACK, ...GEMINI_CATALOG, ...OPENCODE_CATALOG], fromAPI: false });
}
