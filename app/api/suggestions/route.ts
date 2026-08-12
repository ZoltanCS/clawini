import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Use the same NIM endpoint as chat so no extra API key is needed
const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const SUGGESTION_MODEL = 'moonshotai/kimi-k2.6';

const SUGGEST_PROMPT = `A felhasználó memóriái és érdeklődési körei alapján generálj 6 rövid, egyedi "quick kártya" javaslatot amit megkérdezhetne egy AI-tól.

Szabályok:
- Minden javaslat max 6 szó
- Legyenek személyre szabottak a memóriák alapján
- Ha vannak megadott témák, azok köré is generálj
- Változatos: kérdés, kérés, ötlet mix
- Soronként 1 javaslat, semmi más (nincs számozás, nincs kötőjel)

Példa kimenet:
Új futóútvonal a parkban
TypeScript design pattern tippek
Morzsa etetési ütemterv
Hétvégi kirándulás ötletek
Gyors vacsora recept
Reggeli motiváció`;

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ suggestions: [] });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    // Service key required: reads happen server-side without a user session (RLS)
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
    if (!supabaseUrl || !supabaseKey) return NextResponse.json({ suggestions: [] });
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    // Get memories
    const { data: memories } = await supabase
      .from('memories')
      .select('content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Get custom topics
    const { data: topics } = await supabase
      .from('quick_topics')
      .select('topic')
      .eq('user_id', userId);

    const memoryText = (memories || []).map((m: any) => m.content).join('\n');
    const topicText = (topics || []).map((t: any) => t.topic).join('\n');

    if (!memoryText && !topicText) {
      return NextResponse.json({ suggestions: [] });
    }

    const apiKey = process.env.NVIDIA_NIM_API_KEY;
    if (!apiKey) return NextResponse.json({ suggestions: [] });

    let context = '';
    if (memoryText) context += `Memóriák:\n${memoryText}\n\n`;
    if (topicText) context += `Megadott témák:\n${topicText}`;

    const res = await fetch(`${NIM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: SUGGESTION_MODEL,
        messages: [
          { role: 'system', content: SUGGEST_PROMPT },
          { role: 'user', content: context },
        ],
        max_tokens: 150,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return NextResponse.json({ suggestions: [] });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const suggestions = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 3 && l.length < 60).slice(0, 6);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
