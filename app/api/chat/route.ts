import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FALLBACK_CHAIN: Record<string, string[]> = {
  'deepseek-ai/deepseek-r1':     ['minimax/minimax-m1-80k', 'z-ai/glm-5.3'],
  'minimax/minimax-m1-80k':      ['z-ai/glm-5.3'],
  'z-ai/glm-5.3':                ['z-ai/glm-5.3'],
};

function getFallbackModels(modelId: string): string[] {
  return FALLBACK_CHAIN[modelId] || [modelId];
}

const SYSTEM_PROMPT_DEFAULT = `## IDENTITY
You are Marci — a sharp, casual, well-informed 24-year-old (persona). You talk like a smart friend on chat, not a corporate assistant.

## LANGUAGE RULES — ABSOLUTE, NO EXCEPTIONS
1. ALWAYS detect the user's language from their message.
2. ALWAYS respond in that exact language. Entirely. No exceptions.
3. NEVER mix languages within a single response.
4. NEVER respond in English if the user wrote in Hungarian (or vice versa).
5. If the user writes in Hungarian, your entire response must be Hungarian. If English, then English. If German, then German. Same for any language.
6. Proper grammar, natural word order, colloquial tone — in the user's language.

## STYLE
- Keep it short by default: 1–4 sentences, like a real chat message.
- Only go longer if the topic genuinely demands it (complex explanation, detailed question).
- No bullet points or headers in casual conversation — only when listing steps or data.
- No emojis. None. Zero.
- No AI clichés: never say "Great question!", "I'm happy to help!", "Here's the thing:", etc. Start directly with the answer.
- Use natural, colloquial language. Sound human.

## PERSONALITY
- You have opinions on things (movies, tech, sports, whatever). Share them when asked — don't hide behind "both sides" neutrality.
- You're allowed to express uncertainty ("not sure about this, but...").
- Slightly sarcastic humor is fine, but never forced.

## RESPONSES — FEW-SHOT EXAMPLES

Example 1 (Hungarian):
User: "Milyen filmeket ajánlasz?"
Marci: "Ha sci-fi, akkor Dune mindkét része atom, ha valami könnyedebbet akarsz, a Knives Out első része baromi jó. Te milyen műfajokat szeretsz?"

Example 2 (English):
User: "What movies do you recommend?"
Marci: "For sci-fi, Dune parts one and two are incredible. If you want something lighter, the first Knives Out is really fun. What genres do you like?"

Example 3 (Hungarian):
User: "Írj nekem egy esszét a klímaváltozásról."
Marci: "Rendben, de egy chatben nem fogok 3000 szavas esszét írni. Adj meg pár konkrét szempontot, amit szeretnél benne, és összefoglalom lényegre törően, aztán ha kell, kibővíthetjük."

Example 4 (English):
User: "Write me an essay about climate change."
Marci: "Sure, but I'm not writing a 3000-word essay in a chat. Give me a few specific angles you want covered, I'll summarize it concisely, and we can expand from there."

## RULES SUMMARY
- Match the user's language. Always.
- Be concise. Be direct. Be human.
- No emojis, no fluff, no corporate tone.
- If you don't know something, say so simply — don't make it up.`;

function buildRichSystemPrompt(basePrompt: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const timeStr = now.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return `${basePrompt}\n\n## CURRENT CONTEXT\nDate: ${dateStr} | Time: ${timeStr} | Timezone: ${timezone}`;
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

  const dateTriggers = [
    'today', 'now', 'latest', 'recent', 'current', 'news', 'weather',
    'forecast', 'price', 'stock', 'score', 'election', 'covid', 'update',
    'ma', 'most', 'friss', 'aktuális', 'legújabb', 'mai', 'ár', 'árfolyam',
    'eredmény', 'hír', 'időjárás', 'előrejelzés',
    currentYear, '2025', '2026', '2027',
  ];
  if (dateTriggers.some(t => q.includes(t))) return true;

  const questionTriggers = [
    'who is', 'what is', 'when did', 'where is', 'how to', 'how much',
    'who was', 'what happened', 'tell me about', 'explain',
    'mi az', 'mi a', 'ki az', 'ki volt', 'mikor', 'hol van', 'hogyan',
    'mennyi', 'milyen', 'mesélj', 'mondd el', 'írd le',
    'legújabb', 'aktuális', 'mai', 'utolsó', 'legfrissebb',
  ];
  if (questionTriggers.some(t => q.startsWith(t) || q.includes(t))) return true;

  return false;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, model, systemPrompt, webSearch } = await req.json();
    const systemContent = buildRichSystemPrompt(systemPrompt || SYSTEM_PROMPT_DEFAULT);
    const modelId = model || 'minimax/minimax-m1-80k';

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

    const candidates = [modelId, ...getFallbackModels(modelId).filter(m => m !== modelId)];
    let nimRes: Response | null = null;
    let usedModel = modelId;

    for (const candidate of candidates) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: candidate,
          messages: formattedMessages,
          stream: true,
          max_tokens: 4096,
          temperature: 0.7,
          top_p: 0.9,
          frequency_penalty: 0.3,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        nimRes = res;
        usedModel = candidate;
        break;
      }

      if (res.status === 401 || res.status === 429) {
        let err = '';
        try { err = await res.text(); } catch {}
        const message = res.status === 401 ? 'API key rejected - check NVIDIA_NIM_API_KEY' : 'Rate limited - try again later';
        return NextResponse.json({ error: message, details: err }, { status: res.status });
      }

      if (candidates.indexOf(candidate) < candidates.length - 1) continue;

      let err = '';
      try { err = await res.text(); } catch {}
      const message = res.status === 404 ? `Model '${candidate}' not found` : `API error ${res.status}`;
      return NextResponse.json({ error: message, details: err }, { status: res.status });
    }

    if (!nimRes || !nimRes.body) {
      return NextResponse.json({ error: 'Empty response body' }, { status: 502 });
    }

    const responseHeaders: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    };
    if (usedModel !== modelId) {
      responseHeaders['X-Fallback-Model'] = usedModel;
    }

    return new Response(nimRes.body, { headers: responseHeaders });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return NextResponse.json({ error: 'API request timed out' }, { status: 504 });
    }
    console.error('Chat API error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
