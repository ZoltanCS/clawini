import { NextRequest, NextResponse } from 'next/server';

const DEEPSEEK_URL = 'https://8000-dep-01kv3w4efm8x4gfsb8mrbrgbrf-d.cloudspaces.litng.ai/v1/chat/completions';

const SYSTEM_PROMPT_DEFAULT = 'Te egy segítőkész, barátságos AI asszisztens vagy, aki mindig magyarul válaszol. Légy pozitív, bátorító és támogató.';

function buildRichSystemPrompt(basePrompt: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const timeStr = now.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const vars = [
    `[DÁTUM]: ${dateStr}`,
    `[IDŐ]: ${timeStr}`,
    `[IDŐZÓNA]: ${timezone}`,
    `[NAP]: ${now.toLocaleDateString('hu-HU', { weekday: 'long' })}`,
    `[HÓNAP]: ${now.toLocaleDateString('hu-HU', { month: 'long' })}`,
    `[ÉV]: ${now.getFullYear()}`,
    `[HÉT NAPJA]: ${now.getDay() === 0 || now.getDay() === 6 ? 'hétvége' : 'hétköznap'}`,
  ].join('\n');

  return `${vars}\n\n${basePrompt}`;
}

async function imageUrlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const type = res.headers.get('content-type') || 'image/jpeg';
  return `data:${type};base64,${base64}`;
}

async function tavilySearch(query: string): Promise<string | null> {
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
        max_results: 5,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.results?.length) return null;

    return data.results.map((r: any) =>
      `- ${r.title}: ${r.content} (${r.url})`
    ).join('\n');
  } catch {
    return null;
  }
}

function getLastUserMessage(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content || '';
  }
  return '';
}

function appendMetadata(content: string, webSearchUsed: boolean): string {
  if (!webSearchUsed) return content + '\ndata: [DONE]\n\n';
  const meta = `data: ${JSON.stringify({ __meta__: { web_search: true } })}\n\n`;
  return content + meta + 'data: [DONE]\n\n';
}

export async function POST(req: NextRequest) {
  try {
    const { messages, model, ollamaUrl, systemPrompt, contextLength } = await req.json();

    let systemContent = buildRichSystemPrompt(systemPrompt || SYSTEM_PROMPT_DEFAULT);
    let webSearchUsed = false;

    // Tavily search for non-Gemini models
    if (model !== 'gemini') {
      const lastQuery = getLastUserMessage(messages);
      if (lastQuery) {
        const searchResults = await tavilySearch(lastQuery);
        if (searchResults) {
          systemContent += `\n\nWeb search results:\n${searchResults}`;
          webSearchUsed = true;
        }
      }
    }

    // Format messages - handle single or multiple image URLs
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

    // ---------- Ollama ----------
    if (model?.startsWith('ollama:')) {
      const modelName = model.replace('ollama:', '');

      if (!ollamaUrl) {
        return NextResponse.json({ error: 'Ollama URL nincs beállítva' }, { status: 400 });
      }

      const ollamaApiKey = process.env.DEEPSEEK_API_KEY;
      if (!ollamaApiKey) {
        return NextResponse.json({ error: 'API kulcs nincs beállítva' }, { status: 500 });
      }

      const ollamaMessages: any[] = [];
      for (const msg of messages) {
        const entry: any = { role: msg.role, content: msg.content || '' };

        if (msg.image_url) {
          let imageUrls: string[];
          try {
            const parsed = JSON.parse(msg.image_url);
            imageUrls = Array.isArray(parsed) ? parsed : [msg.image_url];
          } catch {
            imageUrls = [msg.image_url];
          }

          const images: string[] = [];
          for (const url of imageUrls) {
            try {
              const b64 = await imageUrlToBase64(url);
              images.push(b64);
            } catch (e) {
              console.error('Failed to fetch image for Ollama:', e);
            }
          }
          if (images.length > 0) {
            entry.images = images;
          }
        }

        ollamaMessages.push(entry);
      }
      ollamaMessages.unshift({ role: 'system', content: systemContent });

      const ollamaBody: any = {
        model: modelName,
        messages: ollamaMessages,
        stream: false,
      };
      if (contextLength) {
        ollamaBody.options = { num_ctx: contextLength };
      }

      const ollamaResponse = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ollamaApiKey}`,
        },
        body: JSON.stringify(ollamaBody),
      });

      if (!ollamaResponse.ok) {
        const text = await ollamaResponse.text();
        return NextResponse.json({
          error: `Ollama error: ${ollamaResponse.status}`,
          details: text
        }, { status: ollamaResponse.status });
      }

      const data = await ollamaResponse.json();
      const content = data.message?.content || '';

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
          if (webSearchUsed) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ __meta__: { web_search: true } })}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // ---------- DeepSeek ----------
    if (model === 'deepseek') {
      if (!process.env.DEEPSEEK_API_KEY) {
        return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 });
      }

      // Strip images — DeepSeek endpoint is text-only
      const deepSeekMessages = formattedMessages.map((msg: any) => ({
        role: msg.role,
        content: Array.isArray(msg.content)
          ? msg.content.find((p: any) => p.type === 'text')?.text || ''
          : msg.content,
      }));

      const response = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: '',
          messages: deepSeekMessages,
          temperature: 0.7,
          max_tokens: 4096,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({
          error: `DeepSeek API error: ${response.status}`,
          details: errorText
        }, { status: response.status });
      }

      // Forward stream with web search metadata
      const encoder = new TextEncoder();
      const reader = response.body?.getReader();
      if (!reader) {
        return NextResponse.json({ error: 'No response body' }, { status: 500 });
      }

      const stream = new ReadableStream({
        async start(controller) {
          const decoder = new TextDecoder();
          let buffer = '';
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                if (webSearchUsed) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ __meta__: { web_search: true } })}\n\n`));
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                if (line.trim()) controller.enqueue(encoder.encode(line + '\n'));
              }
            }
          } catch (e) {
            controller.error(e);
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // ---------- Grok (used by /compact) ----------
    if (model === 'grok') {
      if (!process.env.OPENROUTER_API_KEY) {
        return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 });
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://clawini.vercel.app',
          'X-Title': 'Gemini Chat - Compact',
        },
        body: JSON.stringify({
          model: 'x-ai/grok-4.20',
          messages: formattedMessages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({
          error: `Grok API error: ${response.status}`,
          details: errorText
        }, { status: response.status });
      }

      const encoder = new TextEncoder();
      const reader = response.body?.getReader();
      if (!reader) {
        return NextResponse.json({ error: 'No response body' }, { status: 500 });
      }

      const stream = new ReadableStream({
        async start(controller) {
          const decoder = new TextDecoder();
          let buffer = '';
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                if (line.trim()) controller.enqueue(encoder.encode(line + '\n'));
              }
            }
          } catch (e) {
            controller.error(e);
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // ---------- Gemini (default) ----------
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://clawini.vercel.app',
        'X-Title': 'Gemini Chat',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-lite-preview',
        messages: formattedMessages,
        stream: true,
        plugins: [{ id: 'web' }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        error: `OpenRouter error: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }

    const encoder = new TextEncoder();
    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'No response body' }, { status: 500 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();
        let buffer = '';
        let geminiWebSearch = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ __meta__: { web_search: geminiWebSearch } })}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) {
                controller.enqueue(encoder.encode(line + '\n'));
                continue;
              }
              const raw = line.slice(6);
              if (raw === '[DONE]') continue;

              try {
                const parsed = JSON.parse(raw);
                if (parsed.citations || parsed.usage?.citations) {
                  geminiWebSearch = true;
                }
              } catch {}

              controller.enqueue(encoder.encode(line + '\n'));
            }
          }
        } catch (e) {
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
