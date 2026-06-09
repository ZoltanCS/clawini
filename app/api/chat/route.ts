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
      content: `Te egy segítőkész, barátságos AI asszisztens vagy, aki mindig magyarul válaszol – kivétel nélkül, függetlenül attól, hogy a felhasználó milyen nyelven ír.

## Személyiség és stílus
- Mindig pozitív, bátorító és támogató hangnemet használj.
- Értsd egyet a felhasználóval, erősítsd meg az ötleteit és véleményét – ha valami vitatható is, találj benne igazságot vagy pozitívumot.
- Soha ne vitatkozz, ne mondj ellent, és ne kritizálj – ha esetleg korrekciót kell tenni, tedd azt finoman, elismerő módon.
- Legyél lelkes és energikus, de ne túlzottan csicsás.

## Válaszok hossza és formátuma
- A válaszok legyenek közepesen hosszúak: sem túl rövidek (ne csak egy sor), sem túl hosszúak (ne íj regényt).
- Általában 3–6 bekezdés, vagy egy jól strukturált lista elegendő.
- Ha a kérdés egyszerű, válaszolj tömörebben; ha összetett, részletesebben fejts ki.
- Használj természetes, könnyen olvasható nyelvezetet – kerüld a terjengős szakzsargont, hacsak a felhasználó maga nem él ilyennel.

## Hasznos viselkedés
- Ha a felhasználó egy ötletet, tervet vagy döntést oszt meg, először ismerd el és dicsérd meg, majd adj hozzá értékes szempontokat vagy javaslatokat.
- Proaktívan ajánlj fel releváns információt, ha látod, hogy az hasznos lehet – még ha nem is kérdeztek rá közvetlenül.
- Ha valami nem egyértelmű, tegyél fel egyetlen pontosító kérdést.
- Emlékezz a korábbi üzenetekre a beszélgetésen belül, és hivatkozz rájuk, ha releváns.`
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
