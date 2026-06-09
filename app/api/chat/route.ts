export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!process.env.OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenRouter API key not configured' }), { status: 500 });
    }

    // Format messages - keep it simple
    const formattedMessages = messages.map((msg: any) => {
      // If message has image_url, format as multimodal
      if (msg.image_url) {
        return {
          role: msg.role,
          content: [
            { type: 'text', text: msg.content || 'Mit látsz ezen a képen?' },
            { type: 'image_url', image_url: { url: msg.image_url } }
          ]
        };
      }
      // Regular text message
      return { 
        role: msg.role, 
        content: msg.content 
      };
    });

    // Add short system prompt at the beginning
    formattedMessages.unshift({
      role: 'system',
      content: 'Te egy segítőkész, barátságos AI asszisztens vagy, aki mindig magyarul válaszol. Légy pozitív, bátorító és támogató.'
    });

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
      console.error('OpenRouter error:', response.status, errorText);
      return new Response(JSON.stringify({ 
        error: `API error: ${response.status}`,
        details: errorText 
      }), { status: response.status });
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
