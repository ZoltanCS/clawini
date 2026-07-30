export interface NimModel {
  id: string;
  label: string;
  publisher: string;
  contextWindow: number;
  supportsVision: boolean;
  description?: string;
  tier?: 'fast' | 'normal' | 'smart';
}

const NIM_CATALOG: NimModel[] = [
  { id: 'z-ai/glm-5.3',              label: 'GLM 5.3',          publisher: 'Zhipu AI',  contextWindow: 131072, supportsVision: false, tier: 'fast',   description: 'Gyors és hatékony' },
  { id: 'minimax/minimax-m1-80k',     label: 'MiniMax M3',       publisher: 'MiniMax',   contextWindow: 131072, supportsVision: false, tier: 'normal', description: 'Kiegyensúlyozott' },
  { id: 'deepseek-ai/deepseek-r1',    label: 'DeepSeek V4 Pro',  publisher: 'DeepSeek',  contextWindow: 131072, supportsVision: false, tier: 'smart',  description: 'Legokosabb, mély gondolkodás' },
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
      apiModels.push(known || {
        id,
        label: id.includes('/') ? id.split('/').pop() || id : id,
        publisher: id.includes('/') ? id.split('/')[0] : 'Egyéb',
        contextWindow: 131072,
        supportsVision: id.toLowerCase().includes('vision') || id.toLowerCase().includes('vl'),
      });
    }
    return apiModels.length > 0 ? apiModels : null;
  } catch {
    return null;
  }
}

export const TIER_FALLBACK: Record<string, string> = {
  smart: 'minimax/minimax-m1-80k',
  normal: 'z-ai/glm-5.3',
  fast: 'z-ai/glm-5.3',
};

export const TIER_ORDER: Record<string, string[]> = {
  smart:  ['minimax/minimax-m1-80k', 'z-ai/glm-5.3'],
  normal: ['z-ai/glm-5.3'],
  fast:   ['z-ai/glm-5.3'],
};

export const DEFAULT_NIM_MODEL_ID = 'minimax/minimax-m1-80k';
export const DEFAULT_GC_MODEL_ID = 'z-ai/glm-5.3';

export function getModelById(models: NimModel[], id: string): NimModel | undefined {
  return models.find(m => m.id === id);
}
