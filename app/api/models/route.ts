import { NextResponse } from 'next/server';
import { fetchNimModels, NIM_FALLBACK } from '@/app/lib/nim-models';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.NVIDIA_NIM_API_KEY || process.env.OPENROUTER_API_KEY;
  let fromAPI = false;
  if (apiKey) {
    try {
      const models = await fetchNimModels(apiKey);
      if (models && models.length > 0) {
        fromAPI = true;
        return NextResponse.json({ models, fromAPI });
      }
    } catch {}
  }
  return NextResponse.json({ models: NIM_FALLBACK, fromAPI });
}
