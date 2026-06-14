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

      const response = await fetch(`${url.replace(/\/$/, '')}/api/pull`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: model }),
      });

      if (!response.ok) {
        const text = await response.text();
        return NextResponse.json({ error: `Hiba a modell letöltésekor: ${text}` }, { status: response.status });
      }

      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
        }
      }

      return NextResponse.json({ success: true });
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
