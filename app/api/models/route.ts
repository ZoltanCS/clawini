import { NextResponse } from 'next/server';
import { fetchNimModels, NIM_FALLBACK, GEMINI_CATALOG, OPENCODE_CATALOG, NimModel } from '@/app/lib/nim-models';

export const dynamic = 'force-dynamic';

type ApiModel = { id?: string; name?: string; displayName?: string; inputTokenLimit?: number; context_length?: number; context_window?: number; supportedGenerationMethods?: string[]; modalities?: { input?: string[] } };

async function fetchCompatibleModels(url: string, key: string, provider: NimModel['provider']): Promise<NimModel[] | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(6000), cache: 'no-store' });
    if (!res.ok) return null;
    const payload = await res.json();
    const entries: ApiModel[] = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
    const models = entries.flatMap((entry) => {
      const id = (entry.id || entry.name || '').replace(/^models\//, '');
      if (!id || /embedding|embed|tts|audio|image-generation|rerank|moderation/i.test(id)) return [];
      // The Go gateway exposes Messages and model-specific endpoints too; this app currently supports chat/completions and Responses.
      if (provider === 'opencode' && /^(gemini-|minimax-|qwen|claude-)/i.test(id)) return [];
      if (entry.supportedGenerationMethods && !entry.supportedGenerationMethods.includes('generateContent')) return [];
      const known = [...NIM_FALLBACK, ...GEMINI_CATALOG, ...OPENCODE_CATALOG].find((model) => model.id === id);
      const label = entry.displayName || entry.name || known?.label || id.split('/').pop() || id;
      return [{
        ...(known || {}), id, label, publisher: known?.publisher || provider || 'Egyéb',
        contextWindow: entry.inputTokenLimit || entry.context_length || entry.context_window || known?.contextWindow || 131072,
        supportsVision: entry.modalities?.input?.includes('image') ?? known?.supportsVision ?? false,
        supportsThinking: known?.supportsThinking ?? true,
        provider,
      } as NimModel];
    });
    return models.length ? models : null;
  } catch {
    return null;
  }
}

async function fetchGeminiModels(key: string): Promise<NimModel[] | null> {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const payload = await res.json();
    const models: ApiModel[] = Array.isArray(payload.models) ? payload.models : [];
    const usable = models.flatMap((entry: ApiModel & { baseModelId?: string; thinking?: boolean }) => {
      const id = entry.baseModelId || entry.id || entry.name?.replace(/^models\//, '');
      if (!id || !id.startsWith('gemini-') || /embedding|tts|audio|live/i.test(id)) return [];
      if (entry.supportedGenerationMethods && !entry.supportedGenerationMethods.includes('generateContent')) return [];
      const known = GEMINI_CATALOG.find(model => model.id === id);
      return [{
        ...(known || {}), id,
        label: entry.displayName || known?.label || id,
        publisher: 'Google',
        contextWindow: entry.inputTokenLimit || known?.contextWindow || 131072,
        supportsVision: known?.supportsVision ?? true,
        supportsThinking: entry.thinking ?? known?.supportsThinking ?? false,
        provider: 'google' as const,
      } as NimModel];
    });
    return usable.length ? usable : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const nimKey = process.env.NVIDIA_NIM_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openCodeKey = process.env.OPENCODE_API_KEY;

  const [nimLive, googleLive, openCodeLive] = await Promise.all([
    nimKey ? fetchNimModels(nimKey) : null,
    geminiKey ? fetchGeminiModels(geminiKey) : null,
    openCodeKey ? fetchCompatibleModels(`${(process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1').replace(/\/+$/, '')}/models`, openCodeKey, 'opencode') : null,
  ]);

  const models = [
    ...(nimKey ? (nimLive || NIM_FALLBACK).map((model) => ({ ...model, provider: 'nvidia' as const })) : []),
    ...(geminiKey ? (googleLive || GEMINI_CATALOG).map((model) => ({ ...model, provider: 'google' as const })) : []),
    ...(openCodeKey ? (openCodeLive || OPENCODE_CATALOG).map((model) => ({ ...model, provider: 'opencode' as const })) : []),
  ];
  const unique = Array.from(new Map(models.map((model) => [`${model.provider}:${model.id}`, model])).values());
  return NextResponse.json({ models: unique, refreshedAt: new Date().toISOString(), live: { nvidia: Boolean(nimLive), google: Boolean(googleLive), opencode: Boolean(openCodeLive) } });
}
