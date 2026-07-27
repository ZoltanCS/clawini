import { NextRequest, NextResponse } from 'next/server';
import { NIM_FALLBACK } from '@/app/lib/nim-models';

const SYSTEM_PROMPT_DEFAULT = 'Te egy segítőkész, barátságos AI asszisztens vagy, aki mindig magyarul válaszol. Légy pozitív, bátorító és támogató.';

function buildRichSystemPrompt(basePrompt: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const timeStr = now.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const vars = [
    `[DATUM]: ${dateStr}`,
    `[IDO]: ${timeStr}`,
    `[IDOZONA]: ${timezone}`,
    `[NAP]: ${now.toLocaleDateString('hu-HU', { weekday: 'long' })}`,
    `[HONAP]: ${now.toLocaleDateString('hu-HU', { month: 'long' })}`,
    `[EV]: ${now.getFullYear()}`,
    `[HET NAPJA]: ${now.getDay() === 0 || now.getDay() === 6 ? 'hetvege' : 'hetkoznap'}`,
  ].join('\n');

  return `${vars}\n\n${basePrompt}`;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, model, systemPrompt } = await req.json();
    const systemContent = buildRichSystemPrompt(systemPrompt || SYSTEM_PROMPT_DEFAULT);
    const modelId = model || 'meta/llama-3.1-70b-instruct';

    const formattedMessages = messages.map((msg: any) => {
      if (msg.image_url) {
        let imageUrls: string[];
        try {
          const parsed = JSON.parse(msg.image_url);
          imageUrls = Array.isArray(parsed) ? parsed : [msg.image_url];
        } catch {
          imageUrls = [msg.image_url];
        }
        return {
          role: msg.role,
          content: [
            { type: 'text', text: msg.content || 'Mit látsz ezeken a képeken?' },
            ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } }))
          ]
        };
      }
      return { role: msg.role, content: msg.content };
    });
    formattedMessages.unshift({ role: 'system', content: systemContent });

    const apiKey = process.env.NVIDIA_NIM_API_KEY || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const nimRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: formattedMessages,
        stream: true,
        max_tokens: 4096,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!nimRes.ok) {
      let err = '';
      try { err = await nimRes.text(); } catch {}
      const status = nimRes.status;
      let message = `API error ${status}`;
      if (status === 404) message = `Model '${modelId}' not found on NVIDIA NIM`;
      else if (status === 401) message = 'API key rejected - check NVIDIA_NIM_API_KEY';
      else if (status === 429) message = 'Rate limited - try again later';
      return NextResponse.json({ error: message, details: err }, { status });
    }

    if (!nimRes.body) {
      return NextResponse.json({ error: 'Empty response body' }, { status: 502 });
    }

    return new Response(nimRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return NextResponse.json({ error: 'API request timed out' }, { status: 504 });
    }
    console.error('Chat API error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
