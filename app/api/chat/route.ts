import { NextRequest, NextResponse } from 'next/server';

const DEEPSEEK_URL = 'https://8000-dep-01kv3w4efm8x4gfsb8mrbrgbrf-d.cloudspaces.litng.ai/v1/chat/completions';

export async function POST(req: NextRequest) {
  try {
    const { messages, model, ollamaUrl, systemPrompt, contextLength } = await req.json();

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

    const systemContent = systemPrompt || 'Te egy segítőkész, barátságos AI asszisztens vagy, aki mindig magyarul válaszol. Légy pozitív, bátorító és támogató.';

    // Add system prompt
    formattedMessages.unshift({
      role: 'system',
      content: systemContent,
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

      const ollamaApiKey = process.env.DEEPSEEK_API_KEY;
      if (!ollamaApiKey) {
        return NextResponse.json({ error: 'API kulcs nincs beállítva' }, { status: 500 });
      }

      // Non-streaming request to Ollama for reliability
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

      // Return as SSE so client still gets streaming experience
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
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
