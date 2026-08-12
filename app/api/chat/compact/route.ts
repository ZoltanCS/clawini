import { NextRequest, NextResponse } from 'next/server';

const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY;

const COMPACT_MODEL = 'minimaxai/minimax-m3';

const COMPACT_SYSTEM_PROMPT = `## Compact System Prompt
Készíts egy MAGYAR NYELVŰ, tömör de teljes összefoglalót az alábbi beszélgetésről.

Követelmények:
1. Minden fontos tény, név, döntés, kérés, információ és kontextus maradjon meg.
2. Használj strukturált formátumot: kulcs: érték sorok.
3. Ha kódok, linkek, fájlnevek vannak, azokat is őrizd meg pontosan.
4. Max 2500 karakter hosszú legyen az összefoglalás.
5. Csak magyarul. SEMMI más szöveg, sem magyarázat, sem bevezető. Kezdő egyből a tényszerű összefoglalával.`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!NIM_API_KEY) {
      return NextResponse.json({ error: 'NIM API key not configured' }, { status: 500 });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    const conversationText = messages
      .map((m: any) => {
        const role = m.role === 'user' ? 'Felhasználó' : 'AI';
        return `[${role}]: ${typeof m.content === 'string' ? m.content : ''}`;
      })
      .join('\n\n');

    const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NIM_API_KEY}`,
      },
      body: JSON.stringify({
        model: COMPACT_MODEL,
        messages: [
          { role: 'system', content: COMPACT_SYSTEM_PROMPT },
          { role: 'user', content: conversationText },
        ],
        stream: false,
        max_tokens: 1000,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      let err = '';
      try { err = await res.text(); } catch {}
      return NextResponse.json({ error: `Compact model error ${res.status}`, details: err }, { status: res.status });
    }

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content || '';

    if (!summary || summary.trim().length === 0) {
      return NextResponse.json({ error: 'Empty compact result' }, { status: 500 });
    }

    return NextResponse.json({
      summary: summary.trim(),
      compactedCount: messages.length,
    });
  } catch (error: any) {
    console.error('Compact API error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}