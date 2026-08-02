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
  { id: 'minimaxai/minimax-m3',            label: 'MiniMax M3',      publisher: 'MiniMax',     contextWindow: 1000000, supportsVision: true, supportsThinking: true, tier: 'normal', description: 'Gyors, multimodális' },
  { id: 'zai.glm-5',                       label: 'GLM-5',           publisher: 'Zhipu AI',    contextWindow: 131072,  supportsVision: true, supportsThinking: true, tier: 'smart', description: 'Okos, gyors Zhipu' },
  { id: 'deepseek-ai/deepseek-v4-pro',     label: 'DeepSeek V4 Pro', publisher: 'DeepSeek',    contextWindow: 131072,  supportsVision: false, supportsThinking: true, tier: 'ultra', description: 'Ultra intelligens DeepSeek' },
  { id: 'moonshotai.kimi-k2.5',            label: 'Kimi K2.5',       publisher: 'Moonshot',    contextWindow: 262143, supportsVision: true, supportsThinking: true, tier: 'normal', description: 'Kiegyensúlyozott, gyors' },
];

const DEV_CATALOG: NimModel[] = [
  { id: 'mistralai/mistral-medium-3.5-128b',  label: 'Mistral Medium 3.5',  publisher: 'Mistral',   contextWindow: 131072, supportsVision: false, supportsThinking: true },
  { id: 'thinkingmachines/inkling',           label: 'Inkling',             publisher: 'Thinking Machines', contextWindow: 131072, supportsVision: false, supportsThinking: true },
  { id: 'deepseek-ai/deepseek-v4-flash',      label: 'DeepSeek V4 Flash',   publisher: 'DeepSeek', contextWindow: 131072, supportsVision: false, supportsThinking: true },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b',  label: 'Nemotron 3 Ultra',    publisher: 'NVIDIA',   contextWindow: 131072, supportsVision: false, supportsThinking: true },
];

export const GEMINI_CATALOG: NimModel[] = [
  { id: 'gemini-3.5-flash',        label: 'Gemini 3.5 Flash',      publisher: 'Google', contextWindow: 1048576, supportsVision: true, supportsThinking: true, tier: 'normal', description: 'Ingyenes, frontier-class Google' },
  { id: 'gemini-3.1-flash-lite',   label: 'Gemini 3.1 Flash-Lite', publisher: 'Google', contextWindow: 1048576, supportsVision: true, supportsThinking: true, tier: 'smart', description: 'Ingyenes, gyors, olcsó' },
  { id: 'gemini-3-flash-preview',  label: 'Gemini 3 Flash (prev)', publisher: 'Google', contextWindow: 1048576, supportsVision: true, supportsThinking: true, tier: 'ultra', description: 'Ingyenes preview' },
];

export const NIM_FALLBACK = [...NIM_CATALOG, ...DEV_CATALOG];

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

export const DEFAULT_NIM_MODEL_ID = 'minimaxai/minimax-m3';
export const DEFAULT_GC_MODEL_ID = 'zai.glm-5';

export function getModelById(models: NimModel[], id: string): NimModel | undefined {
  return models.find(m => m.id === id);
}
