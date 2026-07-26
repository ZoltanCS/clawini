import { NIM_FALLBACK, NimModel } from './nim-models';

export const DEFAULT_CONTEXT_WINDOW = 131072;
const GC_THRESHOLD = 800000;

const CHARS_PER_TOKEN_DEFAULT = 3.8;
const TOKENS_PER_IMAGE = 258;

export function getModelContextWindow(modelId: string): number {
  const model = NIM_FALLBACK.find(m => m.id === modelId);
  return model?.contextWindow || DEFAULT_CONTEXT_WINDOW;
}

export function getModelTokensPerChar(modelId: string): number {
  const model = NIM_FALLBACK.find(m => m.id === modelId);
  return model?.contextWindow ? 3.8 : CHARS_PER_TOKEN_DEFAULT;
}

export function countTokensHeuristic(text: string, modelId: string): number {
  if (!text) return 0;
  const ratio = getModelTokensPerChar(modelId);
  return Math.ceil(text.length / ratio);
}

export function countMessageTokensHeuristic(
  messages: Array<{ role: string; content: string; image_url?: string | null }>,
  modelId: string
): number {
  let total = 0;
  for (const msg of messages) {
    total += 5;
    total += countTokensHeuristic(msg.content, modelId);
    if (msg.image_url) {
      let imageCount = 1;
      try {
        const parsed = JSON.parse(msg.image_url);
        if (Array.isArray(parsed)) imageCount = parsed.length;
      } catch {}
      total += imageCount * TOKENS_PER_IMAGE;
    }
  }
  total += 3;
  return total;
}

export async function countTokensApi(messages: Array<{ role: string; content: string; image_url?: string | null }>): Promise<number> {
  try {
    const cleanMessages = messages.map(m => ({
      role: m.role,
      content: m.content || '',
    }));

    const response = await fetch('/api/count-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: cleanMessages }),
    });

    if (!response.ok) return 0;

    const data = await response.json();
    return data.tokenCount || 0;
  } catch {
    return 0;
  }
}

export function formatTokenCount(count: number): string {
  if (count >= 1000000) return (count / 1000000).toFixed(2) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
  return count.toString();
}

export function getTokenUsagePercent(tokenCount: number, contextWindow: number): number {
  if (contextWindow <= 0) return 0;
  return Math.min(100, Math.round((tokenCount / contextWindow) * 100));
}

export function getTokenUsageColor(percent: number): string {
  if (percent > 90) return '#ef4444';
  if (percent > 70) return '#f59e0b';
  if (percent > 50) return '#eab308';
  return '#22c55e';
}

export function isOverGCThreshold(tokenCount: number): boolean {
  return tokenCount > GC_THRESHOLD;
}

export function getAvailableModels(): NimModel[] {
  return NIM_FALLBACK;
}