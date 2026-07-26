import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
    }

    const apiKey = process.env.NVIDIA_NIM_API_KEY || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const baseUrl = process.env.NVIDIA_NIM_API_KEY
      ? 'https://integrate.api.nvidia.com/v1'
      : 'https://openrouter.ai/api/v1';

    const model = process.env.NVIDIA_NIM_API_KEY
      ? 'meta/llama-3.1-8b-instruct'
      : 'meta/llama-3.1-8b-instruct';

    const formattedMessages = messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content || '',
    }));

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
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
