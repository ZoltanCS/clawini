import { NextRequest, NextResponse } from 'next/server';

const DEEPSEEK_URL = 'https://8000-dep-01kv3w4efm8x4gfsb8mrbrgbrf-d.cloudspaces.litng.ai/v1/chat/completions';

export async function POST(req: NextRequest) {
  try {
    const { messages, model, ollamaUrl } = await req.json();

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
      return {
        role: msg.role,
        content: msg.content
      };
    });

    // Add system prompt
    formattedMessages.unshift({
      role: 'system',
      content: 'Te egy segítőkész, barátságos AI asszisztens vagy, aki mindig magyarul válaszol. Légy pozitív, bátorító és támogató.'
    });

    // Handle Ollama models
    if (model?.startsWith('ollama:')) {
      const modelName = model.replace('ollama:', '');

      if (!ollamaUrl) {
        return NextResponse.json({ error: 'Ollama URL nincs beállítva' }, { status: 400 });
      }

      // Use plain text messages for Ollama (no image support)
      const ollamaMessages = messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content || ''
      }));
      ollamaMessages.unshift(formattedMessages[0]); // system prompt

      const ollamaResponse = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: ollamaMessages,
          stream: true,
        }),
      });

      if (!ollamaResponse.ok) {
        const text = await ollamaResponse.text();
        return NextResponse.json({
          error: `Ollama error: ${ollamaResponse.status}`,
          details: text
        }, { status: ollamaResponse.status });
      }

      const reader = ollamaResponse.body?.getReader();
      if (!reader) {
        return NextResponse.json({ error: 'No response body' }, { status: 500 });
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                if (buffer.trim()) {
                  try {
                    const json = JSON.parse(buffer);
                    if (!json.done && json.message?.content) {
                      const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: json.message.content } }] })}\n\n`;
                      controller.enqueue(encoder.encode(sse));
                    }
                  } catch {}
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const json = JSON.parse(line);
                  if (json.done) {
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  } else if (json.message?.content) {
                    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: json.message.content } }] })}\n\n`;
                    controller.enqueue(encoder.encode(sse));
                  }
                } catch (e) {
                  // Ignore parse errors
                }
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

    // Handle DeepSeek
    if (model === 'deepseek') {
      if (!process.env.DEEPSEEK_API_KEY) {
        return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 });
      }

      const response = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: '',
          messages: formattedMessages,
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

      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Default: OpenRouter Gemini
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
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        error: `OpenRouter error: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }

    return new Response(response.body, {
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
