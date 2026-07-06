import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const formattedMessages = messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content || '',
    }));

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-lite-preview',
        messages: formattedMessages,
        max_tokens: 1,
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Count tokens failed: ${response.status}`, details: err }, { status: response.status });
    }

    const data = await response.json();
    const promptTokens = data.usage?.prompt_tokens;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = (promptTokens || 0) + completionTokens;

    return NextResponse.json({ tokenCount: totalTokens, promptTokens, completionTokens });
  } catch (error) {
    console.error('Count tokens error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}