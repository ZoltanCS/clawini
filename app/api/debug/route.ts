import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const envStatus = {
    NVIDIA_NIM_API_KEY: !!process.env.NVIDIA_NIM_API_KEY,
    AWS_BEDROCK_API_KEY: !!process.env.AWS_BEDROCK_API_KEY,
    TAVILY_API_KEY: !!process.env.TAVILY_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  let nimModels: string[] = [];
  let nimError: string | null = null;
  if (process.env.NVIDIA_NIM_API_KEY) {
    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.NVIDIA_NIM_API_KEY}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        nimModels = (data.data || []).map((m: any) => m.id).filter(Boolean);
      } else {
        nimError = `NIM /models: ${res.status} ${(await res.text()).slice(0, 300)}`;
      }
    } catch (e: any) {
      nimError = `NIM /models: ${e?.message || 'ismeretlen hiba'}`;
    }
  } else {
    nimError = 'NVIDIA_NIM_API_KEY nincs beállítva';
  }

  return NextResponse.json({
    envStatus,
    nimModels,
    nimModelCount: nimModels.length,
    nimError,
  });
}
