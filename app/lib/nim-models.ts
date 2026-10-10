export interface NimModel {
  id: string;
  label: string;
  publisher: string;
  contextWindow: number;
  supportsVision: boolean;
  supportsThinking: boolean;
  description?: string;
  tier?: 'normal' | 'smart' | 'ultra';
  provider?: 'nvidia' | 'google' | 'opencode' | 'unlid' | 'ablitai';
  uncensored?: boolean;
  inputPriceUsdPerMillion?: number;
  outputPriceUsdPerMillion?: number;
}

const NIM_CATALOG: NimModel[] = [
  { id: 'minimaxai/minimax-m3',            label: 'MiniMax M3',      publisher: 'MiniMax',     contextWindow: 1000000, supportsVision: true, supportsThinking: true, tier: 'normal', description: 'Gyors, multimodális' },
  { id: 'z-ai/glm5',                       label: 'GLM-5',           publisher: 'Zhipu AI',    contextWindow: 131072,  supportsVision: true, supportsThinking: true, tier: 'smart', description: 'Okos, gyors Zhipu' },
  { id: 'moonshotai/kimi-k2.6',            label: 'Kimi K2.6',       publisher: 'Moonshot',    contextWindow: 262143, supportsVision: true, supportsThinking: true, tier: 'normal', description: 'Kiegyensúlyozott, gyors' },
];

export const GEMINI_CATALOG: NimModel[] = [
  { id: 'gemini-3.8-flash',        label: 'Gemini 3.8 Flash',      publisher: 'Google', contextWindow: 1048576, supportsVision: true, supportsThinking: true, tier: 'normal', description: 'Gyors, multimodális' },
  { id: 'gemini-3.5-flash-lite',   label: 'Gemini 3.5 Flash-Lite', publisher: 'Google', contextWindow: 1048576, supportsVision: true, supportsThinking: true, tier: 'ultra', description: 'Gyors, takarékos' },
];

export const OPENCODE_CATALOG: NimModel[] = [
  { id: 'gpt-5.6-luna', label: 'GPT 5.6 Luna', publisher: 'OpenCode', contextWindow: 131072, supportsVision: true, supportsThinking: true, tier: 'ultra' },
  { id: 'grok-4.7', label: 'Grok 4.7', publisher: 'OpenCode', contextWindow: 131072, supportsVision: true, supportsThinking: true, tier: 'ultra' },
  { id: 'grok-4.6', label: 'Grok 4.6', publisher: 'OpenCode', contextWindow: 131072, supportsVision: true, supportsThinking: true, tier: 'ultra' },
  { id: 'grok-4.5', label: 'Grok 4.5', publisher: 'OpenCode', contextWindow: 131072, supportsVision: true, supportsThinking: true, tier: 'ultra' },
  { id: 'glm-5.3', label: 'GLM 5.3', publisher: 'OpenCode', contextWindow: 131072, supportsVision: false, supportsThinking: true, tier: 'smart' },
  { id: 'glm-5.3-flash', label: 'GLM 5.3 Flash', publisher: 'OpenCode', contextWindow: 131072, supportsVision: false, supportsThinking: true, tier: 'normal' },
  { id: 'glm-5.2', label: 'GLM 5.2', publisher: 'OpenCode', contextWindow: 131072, supportsVision: false, supportsThinking: true, tier: 'smart' },
  { id: 'kimi-k3', label: 'Kimi K3', publisher: 'OpenCode', contextWindow: 262143, supportsVision: true, supportsThinking: true, tier: 'ultra' },
  { id: 'kimi-k2.7-code', label: 'Kimi K2.7 Code', publisher: 'OpenCode', contextWindow: 262143, supportsVision: true, supportsThinking: true, tier: 'smart' },
  { id: 'kimi-k2.6', label: 'Kimi K2.6', publisher: 'OpenCode', contextWindow: 262143, supportsVision: true, supportsThinking: true, tier: 'normal' },
  { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', publisher: 'OpenCode', contextWindow: 131072, supportsVision: false, supportsThinking: true, tier: 'normal' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', publisher: 'OpenCode', contextWindow: 131072, supportsVision: false, supportsThinking: true, tier: 'ultra' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', publisher: 'OpenCode', contextWindow: 131072, supportsVision: false, supportsThinking: true, tier: 'normal' },
  { id: 'deepseek-v4-flash-vision-exp', label: 'DeepSeek V4 Flash Vision', publisher: 'OpenCode', contextWindow: 131072, supportsVision: true, supportsThinking: true, tier: 'smart' },
  { id: 'longcat-2.0', label: 'LongCat 2.0', publisher: 'OpenCode', contextWindow: 131072, supportsVision: false, supportsThinking: true },
  { id: 'hy4-preview', label: 'Hy4 Preview', publisher: 'OpenCode', contextWindow: 131072, supportsVision: false, supportsThinking: true },
  { id: 'hy3', label: 'Hy3', publisher: 'OpenCode', contextWindow: 131072, supportsVision: false, supportsThinking: true },
];

export const ABLITAI_CATALOG: NimModel[] = [
  { id: 'ablitai', label: 'Ablitai', publisher: 'Ablitai', contextWindow: 262144, supportsVision: false, supportsThinking: false, provider: 'ablitai' },
];

export const NIM_FALLBACK = NIM_CATALOG;

export async function fetchNimModels(apiKey: string): Promise<NimModel[] | null> {
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.data || !Array.isArray(data.data)) return null;

    const apiModels: NimModel[] = [];
    const seen = new Set<string>();
    for (const m of data.data) {
      const id = m.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);

      if (id.endsWith('-embed') || id.includes('embed') ||
          id.includes('rerank') || id.includes('guard') ||
          id.includes('safety') || id.includes('asr') ||
          id.includes('tts') || id.includes('ocr') ||
          id.includes('nmt') || id.includes('translate') ||
          id.includes('yolox') || id.includes('detect') ||
          id.includes('diffdock') || id.includes('esm') ||
          id.includes('protein'))
        continue;

      const known = NIM_CATALOG.find(f => f.id === id);
      const apiContextWindow = m.context_length || m.context_window || m.inputTokenLimit;
      const apiSupportsVision = m.modalities?.input?.includes('image');
      apiModels.push(known ? {
        ...known,
        contextWindow: apiContextWindow || known.contextWindow,
        supportsVision: apiSupportsVision ?? known.supportsVision,
        provider: 'nvidia',
      } : {
        id,
        label: id.includes('/') ? id.split('/').pop() || id : id,
        publisher: id.includes('/') ? id.split('/')[0] : 'Egyéb',
        contextWindow: apiContextWindow || 131072,
        supportsVision: apiSupportsVision ?? (id.toLowerCase().includes('vision') || id.toLowerCase().includes('vl')),
        supportsThinking: true,
        provider: 'nvidia',
      });
    }
    return apiModels.length > 0 ? apiModels : null;
  } catch {
    return null;
  }
}

export const DEFAULT_NIM_MODEL_ID = 'minimaxai/minimax-m3';
export const DEFAULT_GC_MODEL_ID = 'z-ai/glm5';

export function getModelById(models: NimModel[], id: string): NimModel | undefined {
  return models.find(m => m.id === id);
}
