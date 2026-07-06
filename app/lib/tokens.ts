// Token estimation based on model type
// Gemini uses SentencePiece, DeepSeek/Ollama use various tokenizers

const CHARS_PER_TOKEN: Record<string, number> = {
  gemini: 3.8,
  deepseek: 3.5,
  ollama: 3.5,
  grok: 3.6,
};
const DEFAULT_CHARS_PER_TOKEN = 3.5;

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  gemini: 1048576,
  deepseek: 131072,
  grok: 1048576,
};
export const DEFAULT_CONTEXT_WINDOW = 4096;

const TOKENS_PER_IMAGE = 258;
const GC_THRESHOLD = 800000;

function getModelKey(model?: string): string | undefined {
  if (!model) return undefined;
  if (model.startsWith('ollama:')) return 'ollama';
  return model;
}

export function getContextWindow(model?: string, ollamaContextLength?: number): number {
  if (model?.startsWith('ollama:')) {
    return ollamaContextLength || DEFAULT_CONTEXT_WINDOW;
  }
  const key = getModelKey(model);
  if (key && MODEL_CONTEXT_WINDOWS[key]) return MODEL_CONTEXT_WINDOWS[key];
  return DEFAULT_CONTEXT_WINDOW;
}

export function countTokens(text: string, model?: string): number {
  if (!text) return 0;
  const key = getModelKey(model);
  const ratio = key ? (CHARS_PER_TOKEN[key] || DEFAULT_CHARS_PER_TOKEN) : DEFAULT_CHARS_PER_TOKEN;
  return Math.ceil(text.length / ratio);
}

export function countMessageTokens(
  messages: Array<{ role: string; content: string; image_url?: string | null }>,
  model?: string
): number {
  let total = 0;

  for (const msg of messages) {
    total += 4; // formatting tokens
    total += 1; // role token
    total += countTokens(msg.content, model);

    if (msg.image_url) {
      let imageCount = 1;
      try {
        const parsed = JSON.parse(msg.image_url);
        if (Array.isArray(parsed)) imageCount = parsed.length;
      } catch {}
      total += imageCount * TOKENS_PER_IMAGE;
    }
  }

  total += 3; // response prefix
  return total;
}

export function formatTokenCount(count: number): string {
  if (count >= 1000000) return (count / 1000000).toFixed(2) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
  return count.toString();
}

export function isNearContextLimit(tokenCount: number): boolean {
  return tokenCount > GC_THRESHOLD;
}

export function getTokenUsagePercent(tokenCount: number, contextWindow: number): number {
  return Math.min(100, Math.round((tokenCount / contextWindow) * 100));
}

export function getTokenUsageColor(percent: number): string {
  if (percent > 90) return '#ef4444';
  if (percent > 70) return '#f59e0b';
  if (percent > 50) return '#eab308';
  return '#22c55e';
}