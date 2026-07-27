export interface NimModel {
  id: string;
  label: string;
  publisher: string;
  contextWindow: number;
  supportsVision: boolean;
  description?: string;
}

const NIM_CATALOG: NimModel[] = [
  // ── Meta ─────────────────────────────────────────────
  { id: 'meta/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B', publisher: 'Meta', contextWindow: 131072, supportsVision: true },
  { id: 'meta/llama-3.3-70b-instruct',              label: 'Llama 3.3 70B',        publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.2-90b-vision-instruct',       label: 'Llama 3.2 90B Vision', publisher: 'Meta', contextWindow: 131072, supportsVision: true },
  { id: 'meta/llama-3.2-11b-vision-instruct',       label: 'Llama 3.2 11B Vision', publisher: 'Meta', contextWindow: 131072, supportsVision: true },
  { id: 'meta/llama-3.2-3b-instruct',               label: 'Llama 3.2 3B',         publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.2-1b-instruct',               label: 'Llama 3.2 1B',         publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.1-70b-instruct',              label: 'Llama 3.1 70B',        publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.1-8b-instruct',               label: 'Llama 3.1 8B',         publisher: 'Meta', contextWindow: 131072, supportsVision: false },

  // ── NVIDIA ───────────────────────────────────────────
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1',    label: 'Nemotron Super 49B',    publisher: 'NVIDIA', contextWindow: 131072, supportsVision: false },
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',  label: 'Nemotron Super 49B v1.5', publisher: 'NVIDIA', contextWindow: 131072, supportsVision: false },
  { id: 'nvidia/llama-3.1-nemotron-nano-8b-v1',      label: 'Nemotron Nano 8B',        publisher: 'NVIDIA', contextWindow: 131072, supportsVision: false },
  { id: 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',   label: 'Nemotron Nano 8B VL',     publisher: 'NVIDIA', contextWindow: 131072, supportsVision: true },
  { id: 'nvidia/nemotron-3-nano-30b-a3b',             label: 'Nemotron 3 Nano 30B',     publisher: 'NVIDIA', contextWindow: 1048576, supportsVision: false },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', label: 'Nemotron 3 Nano Omni 30B', publisher: 'NVIDIA', contextWindow: 1048576, supportsVision: true },
  { id: 'nvidia/nemotron-3-super-120b-a12b',          label: 'Nemotron 3 Super 120B',   publisher: 'NVIDIA', contextWindow: 1048576, supportsVision: false },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b',          label: 'Nemotron 3 Ultra 550B',   publisher: 'NVIDIA', contextWindow: 1048576, supportsVision: false },
  { id: 'nvidia/nemotron-mini-4b-instruct',           label: 'Nemotron Mini 4B',        publisher: 'NVIDIA', contextWindow: 4096, supportsVision: false },
  { id: 'nvidia/nemotron-nano-12b-v2-vl',             label: 'Nemotron Nano 12B v2 VL', publisher: 'NVIDIA', contextWindow: 131072, supportsVision: true },
  { id: 'nvidia/mistral-nemotron',                    label: 'Mistral Nemotron',         publisher: 'NVIDIA', contextWindow: 131072, supportsVision: false },

  // ── GLM (Zhipu AI) ──────────────────────────────────
  { id: 'z-ai/glm-5.2', label: 'GLM 5.2', publisher: 'Zhipu AI', contextWindow: 131072, supportsVision: false },

  // ── DeepSeek ─────────────────────────────────────────
  { id: 'deepseek-ai/deepseek-v4-flash', label: 'DeepSeek V4 Flash', publisher: 'DeepSeek', contextWindow: 1048576, supportsVision: false },
  { id: 'deepseek-ai/deepseek-v4-pro',   label: 'DeepSeek V4 Pro',   publisher: 'DeepSeek', contextWindow: 1048576, supportsVision: false },

  // ── Google ───────────────────────────────────────────
  { id: 'google/gemma-4-31b-it',            label: 'Gemma 4 31B',         publisher: 'Google', contextWindow: 262144, supportsVision: true },
  { id: 'google/diffusiongemma-26b-a4b-it', label: 'DiffusionGemma 26B',  publisher: 'Google', contextWindow: 262144, supportsVision: true },
  { id: 'google/gemma-2-27b-it',            label: 'Gemma 2 27B',         publisher: 'Google', contextWindow: 8192, supportsVision: false },
  { id: 'google/gemma-2-9b-it',             label: 'Gemma 2 9B',          publisher: 'Google', contextWindow: 8192, supportsVision: false },
  { id: 'google/gemma-2-2b-it',             label: 'Gemma 2 2B',          publisher: 'Google', contextWindow: 8192, supportsVision: false },

  // ── Mistral AI ───────────────────────────────────────
  { id: 'mistralai/mistral-small-4-119b-2603',     label: 'Mistral Small 4 119B', publisher: 'Mistral AI', contextWindow: 262144, supportsVision: true },
  { id: 'mistralai/mistral-medium-3.5-128b',       label: 'Mistral Medium 3.5 128B', publisher: 'Mistral AI', contextWindow: 131072, supportsVision: false },
  { id: 'mistralai/ministral-14b-instruct-2512',   label: 'Ministral 14B',          publisher: 'Mistral AI', contextWindow: 32768, supportsVision: true },
  { id: 'mistralai/mistral-large-2407',            label: 'Mistral Large',           publisher: 'Mistral AI', contextWindow: 131072, supportsVision: false },
  { id: 'mistralai/mixtral-8x22b-instruct-v0.1',   label: 'Mixtral 8x22B',           publisher: 'Mistral AI', contextWindow: 65536, supportsVision: false },
  { id: 'mistralai/mixtral-8x7b-instruct-v0.1',    label: 'Mixtral 8x7B',            publisher: 'Mistral AI', contextWindow: 32768, supportsVision: false },
  { id: 'mistralai/mistral-7b-instruct-v0.3',      label: 'Mistral 7B v0.3',         publisher: 'Mistral AI', contextWindow: 32768, supportsVision: false },

  // ── Microsoft ────────────────────────────────────────
  { id: 'microsoft/phi-3.5-mini-instruct',  label: 'Phi 3.5 Mini',  publisher: 'Microsoft', contextWindow: 131072, supportsVision: false },
  { id: 'microsoft/phi-3-medium-4k-instruct', label: 'Phi 3 Medium', publisher: 'Microsoft', contextWindow: 4096, supportsVision: false },
  { id: 'microsoft/phi-3-mini-4k-instruct',  label: 'Phi 3 Mini',   publisher: 'Microsoft', contextWindow: 4096, supportsVision: false },

  // ── Qwen ─────────────────────────────────────────────
  { id: 'qwen/qwen3-next-80b-a3b-instruct', label: 'Qwen3-Next 80B', publisher: 'Qwen', contextWindow: 131072, supportsVision: false },
  { id: 'qwen/qwen2-72b-instruct',          label: 'Qwen 2 72B',     publisher: 'Qwen', contextWindow: 32768, supportsVision: false },
  { id: 'qwen/qwen2-7b-instruct',           label: 'Qwen 2 7B',      publisher: 'Qwen', contextWindow: 32768, supportsVision: false },
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

      // Only include chat/text-gen models
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

export const DEFAULT_NIM_MODEL_ID = 'meta/llama-3.1-70b-instruct';
export const DEFAULT_GC_MODEL_ID = 'meta/llama-3.1-8b-instruct';

export function getModelById(models: NimModel[], id: string): NimModel | undefined {
  return models.find(m => m.id === id);
}
