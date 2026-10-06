import { NextRequest, NextResponse } from 'next/server';

const PROVIDER_CONFIG = {
  nvidia: { url: 'https://integrate.api.nvidia.com/v1/chat/completions', key: process.env.NVIDIA_NIM_API_KEY, model: 'minimaxai/minimax-m3' },
  google: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: process.env.GEMINI_API_KEY, model: 'gemini-3.5-flash-lite' },
  opencode: { url: `${(process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1').replace(/\/+$/, '')}/chat/completions`, key: process.env.OPENCODE_API_KEY, model: 'kimi-k2.6' },
} as const;

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
    const { messages, previousSummary, provider = 'nvidia' } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    const config = PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG];
    if (!config) return NextResponse.json({ error: 'Unsupported model provider' }, { status: 400 });
    if (!config.key) return NextResponse.json({ error: `Missing API key for ${provider}` }, { status: 503 });

    const conversationText = messages
      .map((m: any) => {
        const role = m.role === 'user' ? 'Felhasználó' : 'AI';
        return `[${role}]: ${typeof m.content === 'string' ? m.content : ''}`;
      })
      .join('\n\n');

    const context = [previousSummary ? `Korábbi beszélgetés összefoglalója:\n${previousSummary}` : '', `Újabb üzenetek:\n${conversationText}`].filter(Boolean).join('\n\n');
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: COMPACT_SYSTEM_PROMPT },
          { role: 'user', content: context },
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
