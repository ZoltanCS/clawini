import { NextRequest, NextResponse } from 'next/server';

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

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

async function tavilySearch(query: string): Promise<TavilyResult[] | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        include_answer: false,
        max_results: 5,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.results || null;
  } catch {
    return null;
  }
}

function shouldAutoSearch(query: string): boolean {
  const now = new Date();
  const q = query.toLowerCase();
  const currentYear = now.getFullYear().toString();

  const dateTriggers = ['today', 'now', 'latest', 'recent', 'current', 'news', 'weather',
    'forecast', 'price', 'stock', 'score', 'election', 'covid', 'update',
    currentYear, '2025', '2026', '2027'];
  if (dateTriggers.some(t => q.includes(t))) return true;

  const questionTriggers = ['who is', 'what is', 'when did', 'where is', 'how to',
    'mi az', 'mi a', 'ki az', 'mikor', 'hol van', 'hogyan',
    'legújabb', 'aktuális', 'mai'];
  if (questionTriggers.some(t => q.startsWith(t) || q.includes(t))) return true;

  return false;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, model, systemPrompt, webSearch } = await req.json();
    const systemContent = buildRichSystemPrompt(systemPrompt || SYSTEM_PROMPT_DEFAULT);
    const modelId = model || 'meta/llama-3.1-70b-instruct';

    // Tavily web search
    let webContext = '';
    if (webSearch && webSearch !== 'off') {
      const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop();
      if (lastUserMsg && lastUserMsg.content) {
        const shouldSearch = webSearch === 'on' || shouldAutoSearch(lastUserMsg.content);
        if (shouldSearch) {
          const results = await tavilySearch(lastUserMsg.content);
          if (results && results.length > 0) {
            webContext = '\n\nWeb keresési eredmények:\n' + results.map((r, i) =>
              `[${i + 1}] ${r.title}\n${r.content}\nForrás: ${r.url}`
            ).join('\n\n');
          }
        }
      }
    }

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
    formattedMessages.unshift({ role: 'system', content: systemContent + webContext });

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
