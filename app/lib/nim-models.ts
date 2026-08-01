export interface NimModel {
  id: string;
  label: string;
  publisher: string;
  contextWindow: number;
  supportsVision: boolean;
  supportsThinking: boolean;
  description?: string;
  tier?: 'normal' | 'smart' | 'ultra';
}

const NIM_CATALOG: NimModel[] = [
  { id: 'global.amazon.nova-2-lite-v1:0', label: 'Nova 2 Lite',      publisher: 'Amazon',      contextWindow: 300000, supportsVision: true, supportsThinking: true, tier: 'normal', description: 'Multimodális, gyors, olcsó' },
  { id: 'moonshotai.kimi-k2.5',        label: 'Kimi K2.5',        publisher: 'Moonshot',    contextWindow: 262143, supportsVision: true, supportsThinking: true, tier: 'normal', description: 'Kiegyensúlyozott, gyors' },
  { id: 'eu.anthropic.claude-sonnet-4-6', label: 'Claude Sonnet 4.6', publisher: 'Anthropic', contextWindow: 200000, supportsVision: true, supportsThinking: true, tier: 'smart', description: 'Okos, gyors Anthropic' },
  { id: 'global.anthropic.claude-opus-4-6-v1', label: 'Claude Opus 4.6', publisher: 'Anthropic', contextWindow: 200000, supportsVision: true, supportsThinking: true, tier: 'ultra', description: 'Ultra intelligens, Anthropic' },
  { id: 'minimax.minimax-m2.5',        label: 'MiniMax M2.5',     publisher: 'MiniMax',     contextWindow: 1000000, supportsVision: true, supportsThinking: true, description: 'Kép leírás proxy' },
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
        supportsThinking: true,
      });
    }
    return apiModels.length > 0 ? apiModels : null;
  } catch {
    return null;
  }
}

export const DEFAULT_NIM_MODEL_ID = 'global.amazon.nova-2-lite-v1:0';
export const DEFAULT_GC_MODEL_ID = 'zai.glm-5';

export function getModelById(models: NimModel[], id: string): NimModel | undefined {
  return models.find(m => m.id === id);
}
