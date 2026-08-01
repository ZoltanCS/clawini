import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const BEDROCK_REGION = process.env.AWS_BEDROCK_REGION || 'us-east-1';
const BEDROCK_BASE_URL = `https://bedrock-mantle.${BEDROCK_REGION}.api.aws/v1`;
const MEMORY_MODEL = 'moonshotai.kimi-k2.5';

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
    const { messages, userId } = await req.json();
    if (!userId || !messages || messages.length < 2) {
      return NextResponse.json({ ok: true, memories: [] });
    }

    const apiKey = process.env.AWS_BEDROCK_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: true, memories: [] });

    // Format last few messages for extraction
    const recent = messages.slice(-6);
    const convo = recent.map((m: any) => `[${m.role}]: ${(m.content || '').slice(0, 300)}`).join('\n');

    const res = await fetch(`${BEDROCK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MEMORY_MODEL,
        messages: [
          { role: 'system', content: EXTRACT_PROMPT },
          { role: 'user', content: convo },
        ],
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

    // Save to Supabase using service key to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
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
