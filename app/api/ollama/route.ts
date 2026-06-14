import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url, action, model } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'Hiányzó Ollama URL' }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API kulcs nincs beállítva' }, { status: 500 });
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    if (action === 'pull') {
      if (!model) {
        return NextResponse.json({ error: 'Hiányzó modell név' }, { status: 400 });
      }

      const ollamaResponse = await fetch(`${url.replace(/\/$/, '')}/api/pull`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: model }),
      });

      if (!ollamaResponse.ok) {
        const text = await ollamaResponse.text();
        return NextResponse.json({ error: `Hiba a modell letöltésekor: ${text}` }, { status: ollamaResponse.status });
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const reader = ollamaResponse.body?.getReader();
          if (!reader) {
            controller.enqueue(encoder.encode('data: {"error":"No response body"}\n\n'));
            controller.close();
            return;
          }
          const decoder = new TextDecoder();
          let buffer = '';
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                if (buffer.trim()) {
                  controller.enqueue(encoder.encode(`data: ${buffer}\n\n`));
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                if (line.trim()) {
                  controller.enqueue(encoder.encode(`data: ${line}\n\n`));
                }
              }
            }
          } catch (e) {
            console.error('Stream error:', e);
            controller.error(e);
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
    }

    if (action === 'tags') {
      const response = await fetch(`${url.replace(/\/$/, '')}/api/tags`, { headers });

      if (!response.ok) {
        return NextResponse.json({ error: 'Nem sikerült lekérni a modelleket' }, { status: response.status });
      }

      const data = await response.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Ismeretlen művelet' }, { status: 400 });
  } catch (error) {
    console.error('Ollama API error:', error);
    return NextResponse.json({ error: 'Belső szerver hiba' }, { status: 500 });
  }
}
