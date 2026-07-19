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

export async function POST(req: NextRequest) {
  try {
    const { messages, model, systemPrompt } = await req.json();

    const systemContent = buildRichSystemPrompt(systemPrompt || SYSTEM_PROMPT_DEFAULT);

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
            { type: 'text', text: msg.content || 'Mit latsz ezeken a kepeken?' },
            ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } }))
          ]
        };
      }
      return { role: msg.role, content: msg.content };
    });

    formattedMessages.unshift({ role: 'system', content: systemContent });

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 });
    }

    // ---------- Grok (used by /compact) ----------
    if (model === 'grok') {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://clawini.vercel.app',
          'X-Title': 'Clawini - Compact',
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
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://clawini.vercel.app',
        'X-Title': 'Clawini',
      },
      body: JSON.stringify({
        model: 'cognitivecomputations/dolphin-mistral-24b-venice-edition',
        messages: formattedMessages,
        stream: true,
        plugins: [{ id: 'web' }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        error: `Gemini API error: ${response.status}`,
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
