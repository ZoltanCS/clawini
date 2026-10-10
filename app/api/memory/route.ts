import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const MEMORY_PROVIDERS = {
  nvidia: { url: 'https://integrate.api.nvidia.com/v1/chat/completions', key: process.env.NVIDIA_NIM_API_KEY, model: 'moonshotai/kimi-k2.6' },
  google: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: process.env.GEMINI_API_KEY, model: 'gemini-3.5-flash-lite' },
  opencode: { url: `${(process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1').replace(/\/+$/, '')}/chat/completions`, key: process.env.OPENCODE_API_KEY, model: 'kimi-k2.6' },
  unlid: { url: 'https://api.unlid.ai/v1/chat/completions', key: process.env.UNLID_API_KEY, model: 'glm-5.3-flash-uncensored' },
  ablitai: { url: 'https://csalazoltantamas--ep-ablitai-server.us-west.modal.direct/v1/chat/completions', key: undefined, model: 'ablitai' },
} as const;

const EXTRACT_PROMPT = `A felhasználó és AI közötti beszélgetésből azonosítsd a fontos tényeket, preferenciákat, érdeklődési köröket amiket érdemes megjegyezni a felhasználóról.

Szabályok:
- Csak TÉNYEKET és PREFERENCIÁKAT adj vissza (nem véleményeket az AI-tól)
- Minden tényt új sorba, röviden (max 10 szó)
- Ha nincs semmi érdekes megjegyezni, válaszolj: NINCS
- Max 3 tényt adj vissza
- Magyarul válaszolj

Példa kimenet:
Szeret futni reggel
Programozó, TypeScript-et használ
Van egy kutyája, Morzsa`;

export async function POST(req: NextRequest) {
  try {
    const { messages, userId, provider = 'nvidia' } = await req.json();
    if (!userId || !messages || messages.length < 2) {
      return NextResponse.json({ ok: true, memories: [] });
    }

    const config = MEMORY_PROVIDERS[provider as keyof typeof MEMORY_PROVIDERS];
    if (!config || (provider !== 'ablitai' && !config.key)) return NextResponse.json({ ok: true, memories: [] });

    // Format last few messages for extraction
    const recent = messages.slice(-6);
    const convo = recent.map((m: any) => `[${m.role}]: ${(m.content || '').slice(0, 300)}`).join('\n');

    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.key ? { 'Authorization': `Bearer ${config.key}` } : {}) },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: EXTRACT_PROMPT },
          { role: 'user', content: convo },
        ],
        ...(provider === 'ablitai' ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        max_tokens: 200,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return NextResponse.json({ ok: true, memories: [] });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';

    if (text.trim() === 'NINCS' || !text.trim()) {
      return NextResponse.json({ ok: true, memories: [] });
    }

    const facts = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 3 && l.length < 100);
    if (facts.length === 0) return NextResponse.json({ ok: true, memories: [] });

    // Save to Supabase using service key to bypass RLS (no user session server-side)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
    if (!supabaseUrl || !supabaseKey) return NextResponse.json({ ok: true, memories: [] });
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    // Check for duplicates
    const { data: existing } = await supabase
      .from('memories')
      .select('content')
      .eq('user_id', userId);

    const existingSet = new Set((existing || []).map((m: any) => m.content.toLowerCase()));
    const newFacts = facts.filter((f: string) => !existingSet.has(f.toLowerCase()));

    if (newFacts.length > 0) {
      const { error } = await supabase.from('memories').insert(
        newFacts.map((content: string) => ({ user_id: userId, content, source: 'auto' }))
      );
      if (error) console.error('Memory insert error:', error);
    }

    return NextResponse.json({ ok: true, memories: newFacts });
  } catch (e: any) {
    console.error('Memory route error:', e?.message);
    return NextResponse.json({ ok: true, memories: [] });
  }
}
