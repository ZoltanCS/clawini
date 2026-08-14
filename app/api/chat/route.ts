import { NextRequest, NextResponse } from 'next/server';
import { signAwsRequest } from '@/app/lib/aws-sigv4';

export const dynamic = 'force-dynamic';

const BEDROCK_REGION = process.env.AWS_BEDROCK_REGION || 'us-east-1';
const CLAUDE_REGION = process.env.AWS_CLAUDE_REGION || 'eu-central-1';

// NVIDIA NIM (OpenAI-compatible endpoint)
const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY;

// Google Gemini (OpenAI-compatible endpoint)
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// OpenCode Zen (OpenAI-compatible endpoint)
const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1';
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY;

const OPENCODE_MODELS = new Set([
  'gpt-5.6-luna',
  'grok-4.5',
  'qwen3.7-max',
  'kimi-k2.6',
]);

const GEMINI_MODELS = new Set([
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
]);

const FALLBACK_CHAIN: Record<string, string[]> = {
  'minimaxai/minimax-m3':          ['moonshotai/kimi-k2.6'],
  'z-ai/glm5':                     ['moonshotai/kimi-k2.6'],
  'deepseek-ai/deepseek-v4-pro':   ['z-ai/glm5'],
  'moonshotai/kimi-k2.6':          ['minimaxai/minimax-m3'],
  'mistralai/mistral-medium-3.5-128b': ['moonshotai/kimi-k2.6'],
  'thinkingmachines/inkling':          ['z-ai/glm5'],
  'deepseek-ai/deepseek-v4-flash':     ['moonshotai/kimi-k2.6'],
  'nvidia/nemotron-3-ultra-550b-a55b': ['z-ai/glm5'],
};

function isClaudeModel(id: string): boolean {
  return id.startsWith('global.anthropic.') || id.startsWith('eu.anthropic.') || id.startsWith('anthropic.claude');
}

function isNovaModel(id: string): boolean {
  return id.includes('amazon.nova');
}

function useBedrockRuntime(id: string): boolean {
  return isClaudeModel(id) || isNovaModel(id);
}

const VISION_MODELS = new Set(['minimaxai/minimax-m3', 'moonshotai/kimi-k2.6']);
const VISION_PROXY_MODEL = 'minimaxai/minimax-m3';

function isGeminiModel(id: string): boolean {
  return GEMINI_MODELS.has(id) || id.startsWith('gemini-');
}

function isOpenCodeModel(id: string): boolean {
  return OPENCODE_MODELS.has(id);
}

const VISION_DESCRIBE_PROMPT = `Describe every single image in ABSOLUTE EXTREME DETAIL. Be relentlessly thorough — leave NOTHING out.

RULES:
- Mention every visible object, person, animal, and item — including position, size, color, texture, orientation.
- Describe spatial relationships precisely ("to the left of X, above Y, overlapping Z in the bottom-right corner").
- Transcribe ALL visible text character-by-character if any exists.
- Note lighting conditions, shadows, reflections, gradients, camera angle, depth of field.
- Describe people: approximate age, gender, clothing, expression, pose, gaze direction.
- Mention typography, logos, icons, UI elements, and their exact placement.
- For scenes: describe the background, foreground, weather, time of day, architecture, vegetation.
- For diagrams/charts: describe every data point, axis label, legend entry, trend line, color coding.
- Estimate proportions and distances when relevant.

Do NOT summarize. Do NOT interpret. Just describe. Every pixel matters.`;


function getFallbackModels(modelId: string): string[] {
  return FALLBACK_CHAIN[modelId] || [modelId];
}

// Compact summary: one cheap NIM model (Kimi) condenses older messages.
const COMPACT_MODEL = 'moonshotai/kimi-k2.6';
const COMPACT_MAX_CHARS = 200000;
const COMPACT_MAX_MESSAGES = 100;
// Keep in sync with COMPACT_KEEP_RECENT in ChatInterface.tsx
const COMPACT_KEEP_RECENT = 15;

function msgText(m: any): string {
  if (typeof m.content === 'string') return m.content;
  if (Array.isArray(m.content)) return m.content.map((c: any) => c.text || '').join(' ');
  return '';
}

function countMsg(m: any): number {
  return msgText(m).length;
}

async function summarizeCompact(messages: any[], apiKey: string): Promise<{ messages: any[]; compactedMessages: number; compactedTokens: number }> {
  const systemMsgs: any[] = [];
  const rest: any[] = [];
  for (const m of messages) {
    if (m.role === 'system') systemMsgs.push(m);
    else rest.push(m);
  }
  const totalChars = [...systemMsgs, ...rest].reduce((s, m) => s + countMsg(m), 0);
  const overMessages = rest.length > COMPACT_MAX_MESSAGES;
  const overChars = totalChars > COMPACT_MAX_CHARS;
  if (!overMessages && !overChars) return { messages, compactedMessages: 0, compactedTokens: 0 };

  const keep = rest.slice(-COMPACT_KEEP_RECENT);
  const drop = rest.slice(0, Math.max(0, rest.length - COMPACT_KEEP_RECENT));
  if (drop.length === 0) return { messages, compactedMessages: 0, compactedTokens: 0 };

  let summary = '';
  const dropText = drop.map((m: any) => m.role + ': ' + msgText(m)).join('\n\n');
  try {
    const res = await fetch(NIM_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: COMPACT_MODEL,
        messages: [
          { role: 'system', content: 'Foglald ossze a beszelgetest tomor, hasznos szovegkent. Orizd meg a fontos tenyletek, keresetek, donteseket, kontextust. Irj magyarul, max ~3000 karakter.' },
          { role: 'user', content: dropText },
        ],
        stream: false,
        max_tokens: 800,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (res.ok) {
      const data = await res.json();
      summary = data.choices?.[0]?.message?.content || '';
    }
  } catch {}

  const compactedTokens = Math.round(drop.reduce((s, m) => s + countMsg(m), 0) / 4);

  if (summary) {
    return {
      messages: [...systemMsgs, { role: 'system', content: '[Korabbi beszergetes osszefoglalja]\n' + summary.trim() }, ...keep],
      compactedMessages: drop.length,
      compactedTokens,
    };
  }

  // If the summary fails, keep only the most recent messages (character budget).
  const budget = COMPACT_MAX_CHARS - systemMsgs.reduce((s, m) => s + countMsg(m), 0);
  let used = 0;
  const fallbackKeep: any[] = [];
  for (let i = rest.length - 1; i >= 0; i--) {
    const c = countMsg(rest[i]);
    if (used + c <= budget || fallbackKeep.length < 2) {
      fallbackKeep.unshift(rest[i]);
      used += c;
    } else break;
  }
  return { messages: [...systemMsgs, ...fallbackKeep], compactedMessages: 0, compactedTokens: 0 };
}

const GEMINI_FALLBACK_CHAIN: Record<string, string[]> = {
  'gemini-3.5-flash':        ['gemini-3.1-flash-lite', 'gemini-3-flash-preview'],
  'gemini-3.1-flash-lite':   ['gemini-3-flash-preview'],
  'gemini-3-flash-preview':  ['gemini-3.1-flash-lite'],
  'gemini-flash-latest':     ['gemini-3.1-flash-lite', 'gemini-3-flash-preview'],
};

function getGeminiFallbacks(modelId: string): string[] {
  return GEMINI_FALLBACK_CHAIN[modelId] || [];
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
- If you don't know something, say so simply — don't make it up.

## ENVIRONMENT — CLAWINI CHAT APP
You are running inside "Clawini" — a custom chat app with the following capabilities:
- **HTML Preview**: If you write HTML code in a \`\`\`html code block, the user can instantly preview it in a fullscreen iframe WITHOUT downloading. So when generating HTML/CSS/JS, just put it in a single html code block and tell the user to tap "Preview" (Előnézet). No need to suggest saving files or opening in a browser.
- **Code blocks**: All code blocks are collapsible. They have copy, download, and (for HTML) preview buttons built in.
- **Images**: The user can send you images and you can see them natively.
- **Memory**: The app automatically remembers facts about the user across sessions. You don't need to ask them to repeat info they've shared before.
- **Models**: The user can switch between Normal (fast), Smart (Sonnet), and Ultra (Opus) models mid-conversation.

When generating visual content (landing pages, UI mockups, games, animations), prefer a SINGLE self-contained HTML file with inline CSS/JS that works in the preview iframe. Don't split into multiple files.`;

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
    const { messages, model, systemPrompt, webSearch, thinking, temperature, maxTokens, topP, frequencyPenalty, reasoningEffort, compactSummary } = await req.json();
    const systemContent = buildRichSystemPrompt(systemPrompt || SYSTEM_PROMPT_DEFAULT);
    const modelId = model || 'moonshotai/kimi-k2.6';

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

    // Compact summary injection: az AI számára a régi üzeneteket kiváltjuk a compact összefoglalóval
    let wasCompacted = false;
    let compactedMessageCount = 0;
    if (compactSummary && typeof compactSummary === 'string' && compactSummary.trim().length > 0) {
      // Kihagyjuk az utolsó 15 nem-system üzenetet, a korábbiakat összefoglalóval helyettesítjük
      const nonSystem = formattedMessages.filter((m: any) => m.role !== 'system');
      const KEEP_RECENT = 15;
      if (nonSystem.length > KEEP_RECENT) {
        const toRemove = nonSystem.slice(0, nonSystem.length - KEEP_RECENT);
        compactedMessageCount = toRemove.length;

        const compactSystemMsg = { role: 'system' as const, content: `[Korábbi beszélgetés összefoglalója]\n\n${compactSummary}\n\n---\nA fenti a korábbi beszélgetés összefoglalója. Az alábbiak a legutóbbi üzenetek. A felhasználó továbbra is látja az összes üzenetet, de te csak az összefoglalból és az új üzenetekből dolgozz.` };

        const result: any[] = [];
        let systemInserted = false;
        for (const msg of formattedMessages) {
          if (msg.role === 'system') {
            result.push(msg);
            if (!systemInserted) {
              result.push(compactSystemMsg);
              systemInserted = true;
            }
          } else if (toRemove.includes(msg)) {
            continue;
          } else {
            result.push(msg);
          }
        }
        formattedMessages.length = 0;
        formattedMessages.push(...result);
        wasCompacted = true;
      }
    }

    if (!NIM_API_KEY) {
      return NextResponse.json({ error: 'API key not configured (set NVIDIA_NIM_API_KEY)' }, { status: 500 });
    }

    // Vision proxy: if model doesn't support vision but user sent images
    if (!VISION_MODELS.has(modelId)) {
      const imageMessages = formattedMessages.filter((m: any) =>
        Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image_url')
      );
      if (imageMessages.length > 0) {
        const visionMessages = [
          { role: 'system', content: VISION_DESCRIBE_PROMPT },
          ...imageMessages.map((m: any) => ({
            role: m.role,
            content: m.content,
          })),
        ];

        try {
          const visionRes = await fetch(`${NIM_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${NIM_API_KEY}`,
            },
            body: JSON.stringify({
              model: VISION_PROXY_MODEL,
              messages: visionMessages,
              stream: false,
              max_tokens: 4096,
              temperature: 0.2,
            }),
            signal: AbortSignal.timeout(60000),
          });

          if (visionRes.ok) {
            const visionData = await visionRes.json();
            const description = visionData.choices?.[0]?.message?.content || '';

            if (description) {
              for (const msg of formattedMessages) {
                if (Array.isArray(msg.content)) {
                  const textParts = msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ');
                  msg.content = `[Képek leírása: ${description}]\n\n${textParts}`;
                }
              }
              const proxyInstruction = '\n\nA felhasználó képe(ke)t töltött fel. A [Képek leírása: ...] blokkokban találod a képek részletes leírását, amit egy külön képelemző modell készített. Válaszolj úgy a felhasználónak, mintha te magad látnád a képeket — soha ne utalj rá, hogy leírásból dolgozol. Ne használd a "kép alapján", "a leírás szerint", "az elemzés szerint" vagy ehhez hasonló kifejezéseket. Viselkedj úgy, mintha beépített vision képességed lenne.';
              if (formattedMessages[0]?.role === 'system') {
                formattedMessages[0].content += proxyInstruction;
              }
            }
          }
        } catch {
          for (const msg of formattedMessages) {
            if (Array.isArray(msg.content)) {
              const textParts = msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ');
              msg.content = textParts || '(kép - nem sikerült leírni)';
            }
          }
        }
      }
    }

    // Compact: régi üzenetek összefoglalása egy olcsó NIM modellel (TTFT csökkentés)
    const compacted = await summarizeCompact(formattedMessages, NIM_API_KEY);
    const chatMessages = compacted.messages;
    const compactInfo = wasCompacted
      ? { messages: compactedMessageCount, tokens: 0 }
      : compacted.compactedMessages > 0
        ? { messages: compacted.compactedMessages, tokens: compacted.compactedTokens }
        : null;

    // --- BEDROCK-RUNTIME PATH: Claude + Nova models use Converse Stream API ---
    if (useBedrockRuntime(modelId)) {
      const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
      if (!accessKeyId || !secretAccessKey) {
        return NextResponse.json({ error: 'AWS IAM credentials not configured for Claude' }, { status: 500 });
      }

      // Convert messages to Converse format (use the compacted message list, like the other paths)
      const systemBlocks: { text: string }[] = [];
      const converseMessages: any[] = [];
      for (const msg of chatMessages) {
        if (msg.role === 'system') {
          systemBlocks.push({ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
          continue;
        }
        if (typeof msg.content === 'string') {
          converseMessages.push({ role: msg.role, content: [{ text: msg.content }] });
        } else if (Array.isArray(msg.content)) {
          const blocks: any[] = [];
          for (const part of msg.content) {
            if (part.type === 'text') blocks.push({ text: part.text });
            else if (part.type === 'image_url') {
              const url: string = part.image_url?.url || '';
              const dataMatch = url.match(/^data:(image\/[\w+]+);base64,(.+)$/);
              if (dataMatch) {
                const fmt = dataMatch[1].split('/')[1].replace('jpeg', 'jpeg');
                blocks.push({ image: { format: fmt, source: { bytes: dataMatch[2] } } });
              } else if (url.startsWith('http')) {
                try {
                  const imgRes = await fetch(url, { signal: AbortSignal.timeout(15000) });
                  if (imgRes.ok) {
                    const contentType = imgRes.headers.get('content-type') || 'image/png';
                    const fmt = contentType.split('/')[1]?.split(';')[0] || 'png';
                    const arrBuf = await imgRes.arrayBuffer();
                    const b64 = Buffer.from(arrBuf).toString('base64');
                    blocks.push({ image: { format: fmt, source: { bytes: b64 } } });
                  } else {
                    blocks.push({ text: `[kép nem elérhető: ${url.slice(0, 80)}]` });
                  }
                } catch {
                  blocks.push({ text: `[kép letöltési hiba]` });
                }
              }
            }
          }
          if (blocks.length) converseMessages.push({ role: msg.role, content: blocks });
        }
      }

      const converseBody: any = {
        modelId: modelId,
        messages: converseMessages,
        system: systemBlocks.length ? systemBlocks : undefined,
        inferenceConfig: { maxTokens: thinking ? 8192 : 4096, temperature: 1 },
      };
      
      // Thinking config: Claude uses additionalModelRequestFields, Nova 2 uses reasoningConfig
      if (thinking) {
        if (isNovaModel(modelId)) {
          converseBody.additionalModelRequestFields = {
            reasoningConfig: { type: 'enabled', maxReasoningEffort: 'low' }
          };
          converseBody.performanceConfig = { latency: 'standard' };
        } else {
          converseBody.additionalModelRequestFields = {
            thinking: { type: 'enabled', budget_tokens: 4096 }
          };
        }
      }

      // Region selection: Nova uses us-east-1, Claude uses eu-central-1
      const region = isNovaModel(modelId) ? 'us-east-1' : CLAUDE_REGION;
      
      // Manually encode the model ID for the path - AWS requires encoded colons
      const encodedModelId = encodeURIComponent(modelId);
      const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodedModelId}/converse-stream`;
      const bodyStr = JSON.stringify(converseBody);
      
      const headers = signAwsRequest('POST', endpoint, bodyStr, region, 'bedrock', accessKeyId, secretAccessKey, process.env.AWS_SESSION_TOKEN);

      const converseRes = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: AbortSignal.timeout(180000),
      });

      if (!converseRes.ok) {
        let err = '';
        try { err = await converseRes.text(); } catch {}
        return NextResponse.json({ error: `Bedrock API error ${converseRes.status}`, details: err }, { status: converseRes.status });
      }

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          let sentDone = false;
          const sendDone = () => {
            if (!sentDone) {
              sentDone = true;
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            }
          };
          try {
            const reader = converseRes.body!.getReader();
            let buffer = Buffer.alloc(0);

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer = Buffer.concat([buffer, Buffer.from(value)]);

              // Parse binary event stream frames (AWS event stream encoding)
              while (buffer.length >= 12) {
                const totalLen = buffer.readUInt32BE(0);
                if (buffer.length < totalLen) break;

                const headerLen = buffer.readUInt32BE(4);
                // prelude CRC at bytes 8-11
                const payloadStart = 12 + headerLen;
                const payloadEnd = totalLen - 4; // minus message CRC
                const payload = buffer.slice(payloadStart, payloadEnd);
                buffer = buffer.slice(totalLen);

                try {
                  const text = payload.toString('utf8');
                  const event = JSON.parse(text);

                  if (event.delta?.text) {
                    const chunk = JSON.stringify({ choices: [{ delta: { content: event.delta.text } }] });
                    controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                  } else if (event.delta?.reasoningContent?.text) {
                    const chunk = JSON.stringify({ choices: [{ delta: { reasoning_content: event.delta.reasoningContent.text } }] });
                    controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                  } else if (event.contentBlockDelta?.delta?.text) {
                    // Nova format
                    const chunk = JSON.stringify({ choices: [{ delta: { content: event.contentBlockDelta.delta.text } }] });
                    controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                  } else if (event.contentBlockDelta?.delta?.reasoningContent?.text) {
                    // Nova reasoning format
                    const chunk = JSON.stringify({ choices: [{ delta: { reasoning_content: event.contentBlockDelta.delta.reasoningContent.text } }] });
                    controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
                  } else if (event.stopReason || event.messageStop) {
                    sendDone();
                  } else if (event.internalServerException || event.modelStreamErrorException || event.validationException) {
                    const errMsg = event.internalServerException?.message || event.modelStreamErrorException?.message || event.validationException?.message || 'Unknown stream error';
                    const errChunk = JSON.stringify({ choices: [{ delta: { content: `\n\n[Hiba: ${errMsg}]` } }] });
                    controller.enqueue(encoder.encode(`data: ${errChunk}\n\n`));
                  }
                } catch (parseErr) {
                  // skip unparseable
                }
              }
            }

            sendDone();
          } catch (e: any) {
            const errChunk = JSON.stringify({ choices: [{ delta: { content: `\n\n[Error: ${e.message}]` } }] });
            controller.enqueue(encoder.encode(`data: ${errChunk}\n\n`));
            sendDone();
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // --- GOOGLE GEMINI: OpenAI-compatible chat/completions ---
    if (isGeminiModel(modelId)) {
      if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'API key not configured (set GEMINI_API_KEY)' }, { status: 500 });
      }

      const candidates = [modelId, ...getGeminiFallbacks(modelId).filter(m => m !== modelId)];
      let geminiRes: Response | null = null;
      let usedGemini = modelId;

      for (const candidate of candidates) {
        const body: Record<string, any> = {
          model: candidate,
          messages: chatMessages,
          stream: true,
          max_tokens: Math.min(maxTokens || 4096, 8192),
          temperature: temperature ?? 0.7,
          top_p: topP ?? 0.9,
        };
        if (thinking) body.reasoning_effort = reasoningEffort || 'high';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        const res = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GEMINI_API_KEY}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          geminiRes = res;
          usedGemini = candidate;
          break;
        }

        let err = '';
        try { err = await res.text(); } catch {}

        if (res.status === 401 || res.status === 429) {
          const message = res.status === 401 ? 'API key rejected - check GEMINI_API_KEY' : 'Rate limited - try again later';
          return NextResponse.json({ error: message, details: err }, { status: res.status });
        }

        if (candidates.indexOf(candidate) < candidates.length - 1) continue;

        const message = res.status === 404 ? `Model '${candidate}' not found` : `API error ${res.status}`;
        return NextResponse.json({ error: message, details: err }, { status: res.status });
      }

      if (!geminiRes || !geminiRes.body) {
        return NextResponse.json({ error: 'Empty response body' }, { status: 502 });
      }

      const geminiHeaders: Record<string, string> = {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      };
      if (usedGemini !== modelId) {
        geminiHeaders['X-Fallback-Model'] = usedGemini;
      }
      if (compactInfo) {
        geminiHeaders['X-Compact-Info'] = `${compactInfo.messages};${compactInfo.tokens}`;
      }

      return new Response(geminiRes.body, { headers: geminiHeaders });
    }

    // --- OPENCODE ZEN: OpenAI-compatible chat/completions ---
    if (isOpenCodeModel(modelId)) {
      if (!OPENCODE_API_KEY) {
        return NextResponse.json({ error: 'API key not configured (set OPENCODE_API_KEY)' }, { status: 500 });
      }

      // Some OpenCode Zen upstream models (e.g. Qwen) reject array content or extra options;
      // keep the body minimal and ensure every message content is a plain string.
      const opencodeMessages = chatMessages.map((m: any) => ({
        role: m.role,
        content: Array.isArray(m.content) ? m.content.map((c: any) => c.text || '').join(' ') : String(m.content ?? ''),
      }));

      const body: Record<string, any> = {
        model: modelId,
        messages: opencodeMessages,
        stream: true,
        max_tokens: Math.min(maxTokens || 4096, 8192),
        temperature: temperature ?? 0.7,
        top_p: topP ?? 0.9,
      };
      if (thinking) body.reasoning_effort = reasoningEffort || 'high';

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const opencodeRes = await fetch(`${OPENCODE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENCODE_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!opencodeRes.ok) {
        let err = '';
        try { err = await opencodeRes.text(); } catch {}

        const message = opencodeRes.status === 401
          ? 'API key rejected - check OPENCODE_API_KEY'
          : opencodeRes.status === 404
            ? `Model '${modelId}' not found`
            : opencodeRes.status === 429
              ? 'Rate limited - try again later'
              : `API error ${opencodeRes.status}`;
        return NextResponse.json({ error: message, details: err }, { status: opencodeRes.status });
      }

      if (!opencodeRes.body) {
        return NextResponse.json({ error: 'Empty response body' }, { status: 502 });
      }

      const opencodeHeaders: Record<string, string> = {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      };
      if (compactInfo) {
        opencodeHeaders['X-Compact-Info'] = `${compactInfo.messages};${compactInfo.tokens}`;
      }

      return new Response(opencodeRes.body, { headers: opencodeHeaders });
    }

    // --- OPEN-WEIGHT MODELS: NVIDIA NIM chat/completions ---
    const candidates = [modelId, ...getFallbackModels(modelId).filter(m => m !== modelId)];
    let nimRes: Response | null = null;
    let usedModel = modelId;

    for (const candidate of candidates) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const body: Record<string, any> = {
        model: candidate,
        messages: chatMessages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: Math.min(maxTokens || 4096, 8192),
        temperature: temperature ?? 0.7,
        top_p: topP ?? 0.9,
        frequency_penalty: frequencyPenalty ?? 0.3,
      };
      if (thinking) body.reasoning_effort = reasoningEffort || 'high';
      const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${NIM_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        nimRes = res;
        usedModel = candidate;
        break;
      }

      let err = '';
      try { err = await res.text(); } catch {}

      if (res.status === 401 || res.status === 429) {
        const message = res.status === 401 ? 'API key rejected - check NVIDIA_NIM_API_KEY' : 'Rate limited - try again later';
        return NextResponse.json({ error: message, details: err }, { status: res.status });
      }

      if (candidates.indexOf(candidate) < candidates.length - 1) continue;

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
    if (compactInfo) {
      responseHeaders['X-Compact-Info'] = `${compactInfo.messages};${compactInfo.tokens}`;
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
