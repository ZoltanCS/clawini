// Token estimation based on model type
// Gemini uses SentencePiece, DeepSeek/Ollama use various tokenizers

const CHARS_PER_TOKEN: Record<string, number> = {
  gemini: 3.8,
  deepseek: 3.5,
  ollama: 3.5,
};
const DEFAULT_CHARS_PER_TOKEN = 3.5;

const TOKENS_PER_IMAGE = 258;

function getModelKey(model?: string): string | undefined {
  if (!model) return undefined;
  if (model.startsWith('ollama:')) return 'ollama';
  return model;
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

    // Count image tokens
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
