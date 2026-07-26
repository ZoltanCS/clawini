export interface NimModel {
  id: string;
  label: string;
  publisher: string;
  contextWindow: number;
  supportsVision: boolean;
  description?: string;
}

const NIM_FALLBACK_MODELS: NimModel[] = [
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1', label: 'Llama 3.3 Nemotron Super 49B', publisher: 'NVIDIA', contextWindow: 131072, supportsVision: false, description: 'Nemotron Super 49B instrukciós modell' },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'Llama 3.1 Nemotron 70B', publisher: 'NVIDIA', contextWindow: 131072, supportsVision: false, description: 'Nemotron 70B instrukciós modell' },
  { id: 'nvidia/llama-3.1-nemotron-nano-8b-v1', label: 'Llama 3.1 Nemotron Nano 8B', publisher: 'NVIDIA', contextWindow: 131072, supportsVision: false, description: 'Nemotron Nano 8B modell' },
  { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', label: 'Llama 3.1 Nemotron Ultra 253B', publisher: 'NVIDIA', contextWindow: 131072, supportsVision: false, description: 'Nemotron Ultra 253B modell' },
  { id: 'deepseek-ai/deepseek-r1', label: 'DeepSeek R1', publisher: 'DeepSeek', contextWindow: 131072, supportsVision: false, description: 'DeepSeek R1 érvelő modell' },
  { id: 'deepseek-ai/deepseek-r1-distill-llama-8b', label: 'DeepSeek R1 Distill Llama 8B', publisher: 'DeepSeek', contextWindow: 131072, supportsVision: false },
  { id: 'deepseek-ai/deepseek-r1-distill-qwen-32b', label: 'DeepSeek R1 Distill Qwen 32B', publisher: 'DeepSeek', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.1-405b-instruct', label: 'Llama 3.1 405B Instruct', publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.1-70b-instruct', label: 'Llama 3.1 70B Instruct', publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B Instruct', publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.2-1b-instruct', label: 'Llama 3.2 1B Instruct', publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.2-3b-instruct', label: 'Llama 3.2 3B Instruct', publisher: 'Meta', contextWindow: 131072, supportsVision: false },
  { id: 'meta/llama-3.2-11b-vision-instruct', label: 'Llama 3.2 11B Vision', publisher: 'Meta', contextWindow: 131072, supportsVision: true, description: 'Többmodalitású (képek)' },
  { id: 'meta/llama-3.2-90b-vision-instruct', label: 'Llama 3.2 90B Vision', publisher: 'Meta', contextWindow: 131072, supportsVision: true, description: 'Többmodalitású (képek)' },
  { id: 'qwen/qwen2.5-7b-instruct', label: 'Qwen 2.5 7B Instruct', publisher: 'Qwen', contextWindow: 32768, supportsVision: false },
  { id: 'qwen/qwen2.5-14b-instruct', label: 'Qwen 2.5 14B Instruct', publisher: 'Qwen', contextWindow: 32768, supportsVision: false },
  { id: 'qwen/qwen2.5-32b-instruct', label: 'Qwen 2.5 32B Instruct', publisher: 'Qwen', contextWindow: 32768, supportsVision: false },
  { id: 'qwen/qwen2.5-coder-32b-instruct', label: 'Qwen 2.5 Coder 32B', publisher: 'Qwen', contextWindow: 32768, supportsVision: false, description: 'Kódolás specializált' },
  { id: 'qwen/qwq-32b-preview', label: 'QwQ 32B Preview', publisher: 'Qwen', contextWindow: 32768, supportsVision: false, description: 'Érvelő modell' },
  { id: 'mistralai/mistral-small-24b-instruct', label: 'Mistral Small 24B Instruct', publisher: 'Mistral AI', contextWindow: 32768, supportsVision: false },
  { id: 'mistralai/mixtral-8x7b-instruct-v0.1', label: 'Mixtral 8x7B Instruct', publisher: 'Mistral AI', contextWindow: 32768, supportsVision: false },
  { id: 'mistralai/mixtral-8x22b-instruct-v0.1', label: 'Mixtral 8x22B Instruct', publisher: 'Mistral AI', contextWindow: 65536, supportsVision: false },
  { id: 'google/gemma-2-27b-it', label: 'Gemma 2 27B IT', publisher: 'Google', contextWindow: 8192, supportsVision: false },
  { id: 'google/gemma-2-9b-it', label: 'Gemma 2 9B IT', publisher: 'Google', contextWindow: 8192, supportsVision: false },
  { id: 'microsoft/phi-4', label: 'Phi-4', publisher: 'Microsoft', contextWindow: 16384, supportsVision: false },
  { id: 'microsoft/phi-3.5-mini-instruct', label: 'Phi 3.5 Mini Instruct', publisher: 'Microsoft', contextWindow: 131072, supportsVision: false },
  { id: 'microsoft/phi-3-medium-4k-instruct', label: 'Phi 3 Medium 4K', publisher: 'Microsoft', contextWindow: 4096, supportsVision: false },
  { id: 'nv-mistralai/mistral-nemo-12b-instruct', label: 'Mistral NeMo 12B', publisher: 'Mistral AI', contextWindow: 131072, supportsVision: false },
  { id: '01-ai/yi-1.5-34b-chat', label: 'Yi 1.5 34B Chat', publisher: '01.AI', contextWindow: 32768, supportsVision: false },
];

export const NIM_FALLBACK = NIM_FALLBACK_MODELS;

export async function fetchNimModels(apiKey: string): Promise<NimModel[] | null> {
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.data || !Array.isArray(data.data)) return null;
    const seen = new Set<string>();
    const merged: NimModel[] = [];
    for (const m of data.data) {
      const id = m.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const fallback = NIM_FALLBACK_MODELS.find(f => f.id === id);
      merged.push(fallback || {
        id,
        label: id.split('/').pop() || id,
        publisher: id.split('/')[0] || 'NVIDIA',
        contextWindow: 131072,
        supportsVision: false,
      });
    }
    for (const f of NIM_FALLBACK_MODELS) {
      if (!seen.has(f.id)) merged.push(f);
    }
    return merged;
  } catch {
    return null;
  }
}

export const DEFAULT_NIM_MODEL_ID = 'meta/llama-3.1-70b-instruct';
export const DEFAULT_GC_MODEL_ID = 'meta/llama-3.1-8b-instruct';

export function getModelById(models: NimModel[], id: string): NimModel | undefined {
  return models.find(m => m.id === id);
}
