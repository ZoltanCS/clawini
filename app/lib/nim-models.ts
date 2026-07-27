export interface NimModel {
  id: string;
  label: string;
  publisher: string;
  contextWindow: number;
  supportsVision: boolean;
  description?: string;
}

const NIM_CATALOG: NimModel[] = [
  // Meta
  { id: 'meta/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B', publisher: 'Meta', contextWindow: 131072, supportsVision: true },
  { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.2-90b-vision-instruct', label: 'Llama 3.2 90B Vision', publisher: 'Meta', contextWindow: 131072, supportsVision: true },
  { id: 'meta/llama-3.2-11b-vision-instruct', label: 'Llama 3.2 11B Vision', publisher: 'Meta', contextWindow: 131072, supportsVision: true },
  { id: 'meta/llama-3.2-3b-instruct', label: 'Llama 3.2 3B', publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.2-1b-instruct', label: 'Llama 3.2 1B', publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.1-70b-instruct', label: 'Llama 3.1 70B', publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B', publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-guard-4-12b', label: 'Llama Guard 4 12B', publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/codellama-70b', label: 'CodeLlama 70B', publisher: 'Meta', contextWindow: 16384, supportsVision: false },

  // NVIDIA
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1', label: 'Nemotron Super 49B', publisher: 'NVIDIA', contextWindow: 131072, supportsVision: false },
  { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', label: 'Nemotron Ultra 253B', publisher: 'NVIDIA', contextWindow: 131072, supportsVision: false },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'Nemotron 70B', publisher: 'NVIDIA', contextWindow: 131072, supportsVision: false },
  { id: 'nvidia/llama-3.1-nemotron-nano-8b-v1', label: 'Nemotron Nano 8B', publisher: 'NVIDIA', contextWindow: 131072, supportsVision: false },

  // DeepSeek
  { id: 'deepseek-ai/deepseek-v4-flash', label: 'DeepSeek V4 Flash', publisher: 'DeepSeek', contextWindow: 131072, supportsVision: false },
  { id: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro', publisher: 'DeepSeek', contextWindow: 131072, supportsVision: false },

  // Google
  { id: 'google/gemma-2-27b-it', label: 'Gemma 2 27B', publisher: 'Google', contextWindow: 8192, supportsVision: false },
  { id: 'google/gemma-2-9b-it', label: 'Gemma 2 9B', publisher: 'Google', contextWindow: 8192, supportsVision: false },
  { id: 'google/gemma-7b', label: 'Gemma 7B', publisher: 'Google', contextWindow: 8192, supportsVision: false },

  // Mistral
  { id: 'mistralai/mistral-large-2407', label: 'Mistral Large', publisher: 'Mistral AI', contextWindow: 131072, supportsVision: false },
  { id: 'mistralai/mixtral-8x22b-instruct-v0.1', label: 'Mixtral 8x22B', publisher: 'Mistral AI', contextWindow: 65536, supportsVision: false },
  { id: 'mistralai/mixtral-8x7b-instruct-v0.1', label: 'Mixtral 8x7B', publisher: 'Mistral AI', contextWindow: 32768, supportsVision: false },
  { id: 'mistralai/mistral-7b-instruct-v0.3', label: 'Mistral 7B v0.3', publisher: 'Mistral AI', contextWindow: 32768, supportsVision: false },

  // Microsoft
  { id: 'microsoft/phi-3.5-mini-instruct', label: 'Phi 3.5 Mini', publisher: 'Microsoft', contextWindow: 131072, supportsVision: false },
  { id: 'microsoft/phi-3-medium-4k-instruct', label: 'Phi 3 Medium', publisher: 'Microsoft', contextWindow: 4096, supportsVision: false },
  { id: 'microsoft/phi-3-mini-4k-instruct', label: 'Phi 3 Mini', publisher: 'Microsoft', contextWindow: 4096, supportsVision: false },

  // Qwen
  { id: 'qwen/qwen2-72b-instruct', label: 'Qwen 2 72B', publisher: 'Qwen', contextWindow: 32768, supportsVision: false },
  { id: 'qwen/qwen2-7b-instruct', label: 'Qwen 2 7B', publisher: 'Qwen', contextWindow: 32768, supportsVision: false },
];

export const NIM_FALLBACK = NIM_CATALOG;

export async function fetchNimModels(apiKey: string): Promise<NimModel[] | null> {
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.data || !Array.isArray(data.data)) return null;

    const models: NimModel[] = [];
    for (const m of data.data) {
      const id = m.id;
      if (!id) continue;
      const known = NIM_CATALOG.find(f => f.id === id);
      models.push(known || {
        id,
        label: id.includes('/') ? id.split('/').pop() || id : id,
        publisher: id.includes('/') ? id.split('/')[0] : 'NVIDIA',
        contextWindow: 131072,
        supportsVision: id.toLowerCase().includes('vision'),
      });
    }
    return models.length > 0 ? models : null;
  } catch {
    return null;
  }
}

export const DEFAULT_NIM_MODEL_ID = 'meta/llama-3.1-70b-instruct';
export const DEFAULT_GC_MODEL_ID = 'meta/llama-3.1-8b-instruct';

export function getModelById(models: NimModel[], id: string): NimModel | undefined {
  return models.find(m => m.id === id);
}
