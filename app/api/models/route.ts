import { NextResponse } from 'next/server';
import { fetchNimModels, NIM_FALLBACK } from '@/app/lib/nim-models';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.NVIDIA_NIM_API_KEY || process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    const models = await fetchNimModels(apiKey);
    if (models && models.length > 0) {
      return NextResponse.json({ models });
    }
  }
  return NextResponse.json({ models: NIM_FALLBACK });
}
