import { NextRequest, NextResponse } from 'next/server';
import { NIM_FALLBACK, getModelById } from '@/app/lib/nim-models';

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

function findModelContextWindow(modelId: string): number {
  const model = NIM_FALLBACK.find(m => m.id === modelId);
  return model?.contextWindow || 131072;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, model, systemPrompt } = await req.json();

    const systemContent = buildRichSystemPrompt(systemPrompt || SYSTEM_PROMPT_DEFAULT);
    const modelId = model || 'meta/llama-3.1-70b-instruct';
    const contextWindow = findModelContextWindow(modelId);

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
      return NextResponse.json({ error: 'NVIDIA NIM API key not configured' }, { status: 500 });
    }

    const isVisionModel = getModelById(NIM_FALLBACK, modelId)?.supportsVision;

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        model: modelId,
        messages: formattedMessages,
        stream: true,
        max_tokens: Math.min(4096, Math.floor(contextWindow * 0.8)),
        temperature: 0.7,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        error: `NIM API error: ${response.status}`,
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
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
