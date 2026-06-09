export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { messages, enableSearch = false } = await req.json();

    if (!process.env.OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenRouter API key not configured' }), { status: 500 });
    }

    // Format messages with image support
    const formattedMessages = messages.map((msg: any) => {
      if (msg.image_url) {
        // OpenAI/Gemini multimodal format
        return {
          role: msg.role,
          content: [
            { type: 'text', text: msg.content || 'Mit látsz ezen a képen? Válaszolj magyarul.' },
            { type: 'image_url', image_url: { url: msg.image_url } }
          ]
        };
      }
      return { role: msg.role, content: msg.content };
    });

    // Add system prompt for Gemini
    formattedMessages.unshift({
      role: 'system',
      content: 'You are Gemini, a helpful AI assistant. Always respond in the same language as the user. Be concise but thorough. If you see an image, analyze it carefully and describe what you see.'
    });

    const requestBody: any = {
      model: 'google/gemini-3.1-flash-lite-preview',
      messages: formattedMessages,
      stream: true,
      plugins: [{ id: 'web_search' }], // Always enable search, model decides when to use it
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://clawini.vercel.app',
        'X-Title': 'Gemini Chat',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenRouter error:', error);
      return new Response(JSON.stringify({ error: `OpenRouter API error: ${error}` }), { status: response.status });
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
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
