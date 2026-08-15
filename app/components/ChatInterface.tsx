'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/app/hooks/useAuth';
import { useSupabaseChat } from '@/app/hooks/useSupabaseChat';
import { Message, ChatError } from '@/app/types';
import { supabase } from '@/app/lib/supabase';
import {
  countMessageTokensHeuristic,
  formatTokenCount,
  getTokenUsagePercent,
  getTokenUsageColor,
  isOverGCThreshold,
  isOverCompactThreshold,
} from '@/app/lib/tokens';
import { NimModel, DEFAULT_NIM_MODEL_ID, DEFAULT_GC_MODEL_ID, GEMINI_CATALOG, OPENCODE_CATALOG, getModelById } from '@/app/lib/nim-models';
import Sidebar from '@/app/components/Sidebar';
import ChatInput from '@/app/components/ChatInput';
import MessageList from '@/app/components/MessageList';
import WelcomeScreen from '@/app/components/WelcomeScreen';
import AuthModal from '@/app/components/AuthModal';
import SettingsModal from '@/app/components/SettingsModal';

const MODELS_CACHE_KEY = 'nimModelsCache';
const MODELS_CACHE_AGE = 1000 * 60 * 30;
const SELECTED_MODEL_KEY = 'selectedModel';
const THEME_KEY = 'theme';
const DEV_MODE_KEY = 'devMode';
const CHAT_PARAMS_KEY = 'chatParams';
// Keep in sync with COMPACT_KEEP_RECENT in app/api/chat/route.ts
const COMPACT_KEEP_RECENT = 15;

export interface ResponseStat {
  id: string;
  model: string;
  timestamp: number;
  elapsed: number;
  ttft: number;
  tokensPerSec: number;
  tokens: number;
  chars: number;
  fallbackModel?: string;
  compacted?: { messages: number; tokens: number };
  aborted?: boolean;
  error?: string;
}

export interface ChatParams {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  reasoningEffort: 'high' | 'medium' | 'low';
}

const DEFAULT_CHAT_PARAMS: ChatParams = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 0.9,
  frequencyPenalty: 0.3,
  reasoningEffort: 'high',
};

const MODEL_SHEET_OPTIONS = [
  { tier: 'normal', label: 'Normál', id: 'minimaxai/minimax-m3' },
  { tier: 'smart',  label: 'Okos',   id: 'z-ai/glm5' },
  { tier: 'ultra',  label: 'Ultra',  id: 'deepseek-ai/deepseek-v4-pro' },
] as const;

const DEV_MODEL_OPTIONS = [
  { label: 'Mistral Medium 3.5',  id: 'mistralai/mistral-medium-3.5-128b' },
  { label: 'Inkling',             id: 'thinkingmachines/inkling' },
  { label: 'DeepSeek V4 Flash',   id: 'deepseek-ai/deepseek-v4-flash' },
  { label: 'Nemotron 3 Ultra',    id: 'nvidia/nemotron-3-ultra-550b-a55b' },
] as const;

const OPENCODE_MODEL_IDS = new Set(OPENCODE_CATALOG.map(m => m.id));

export function exportChatAsMarkdown(messages: Message[], title: string): string {
  let md = `# ${title}\n\n`;
  for (const msg of messages) {
    md += `### ${msg.role === 'user' ? 'Te' : 'AI'}\n${msg.content}\n\n`;
    if (msg.image_url) md += `![kép](${msg.image_url})\n\n`;
  }
  return md;
}

export function exportChatAsJson(messages: Message[], title: string): string {
  return JSON.stringify({ title, messages, exported_at: new Date().toISOString() }, null, 2);
}

export default function ChatInterface() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [hasGeneratedTitle, setHasGeneratedTitle] = useState<Set<string>>(new Set());
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_NIM_MODEL_ID);
  const [isModelSheetOpen, setIsModelSheetOpen] = useState(false);
  const [providerTab, setProviderTab] = useState<'nvidia' | 'google' | 'opencode'>('nvidia');
  const [error, setError] = useState<ChatError | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [models, setModels] = useState<NimModel[]>([]);
  const [isModelsLoading, setIsModelsLoading] = useState(true);
  const [showTokenUsage, setShowTokenUsage] = useState(false);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json' | 'clipboard'>('markdown');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [branchToast, setBranchToast] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [webSearchMode, setWebSearchMode] = useState<'off' | 'auto' | 'on'>('off');
  const [thinking, setThinking] = useState(false);
  const [thinkingContent, setThinkingContent] = useState<string>('');
  const [devMode, setDevMode] = useState(false);
  const [streamStats, setStreamStats] = useState<{ ttft: number; tokensPerSec: number; elapsed: number } | null>(null);
  const [lastResponse, setLastResponse] = useState<ResponseStat | null>(null);
  const [responseHistory, setResponseHistory] = useState<ResponseStat[]>([]);
  const [chatParams, setChatParams] = useState<ChatParams>(DEFAULT_CHAT_PARAMS);
  const gcTriggeredRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const partialContentRef = useRef<string>('');
  const thinkingContentRef = useRef<string>('');
  const compactingRef = useRef(false);
  const pendingChatIdRef = useRef<string | null>(null);
  const streamStartRef = useRef(0);
  const firstTokenAtRef = useRef<number | null>(null);
  const streamCharsRef = useRef(0);
  const usageTokensRef = useRef(0);
  const fallbackModelRef = useRef<string | undefined>(undefined);
  const compactInfoRef = useRef<{ messages: number; tokens: number } | undefined>(undefined);
  const sendModelRef = useRef<string>('');
  const [compactSummary, setCompactSummary] = useState<string | null>(null);
  const [compactedCount, setCompactedCount] = useState(0);
  const [messagesRefreshKey, setMessagesRefreshKey] = useState(0);

  // Bump to force MessageList to refetch from DB after local mutations,
  // so the UI never depends solely on realtime events arriving.
  const bumpMessages = useCallback(() => setMessagesRefreshKey(k => k + 1), []);

  const wrapWithThinking = (content: string, thinkingText: string) => {
    if (!thinkingText) return content;
    return `「thinking」\n${thinkingText.trim()}\n「/thinking」\n\n${content}`;
  };

  // Theme
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | 'system' | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') { root.classList.add('dark'); }
    else if (theme === 'light') { root.classList.remove('dark'); }
    else {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.matches ? root.classList.add('dark') : root.classList.remove('dark');
      const handler = (e: MediaQueryListEvent) => e.matches ? root.classList.add('dark') : root.classList.remove('dark');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  // Load persisted settings
  useEffect(() => {
    setShowTokenUsage(localStorage.getItem('showTokenUsage') === 'true');
    const savedExport = localStorage.getItem('exportFormat') as 'markdown' | 'json' | 'clipboard' | null;
    if (savedExport) setExportFormat(savedExport);
    const savedWebSearch = localStorage.getItem('webSearchMode') as 'off' | 'auto' | 'on' | null;
    if (savedWebSearch) setWebSearchMode(savedWebSearch);
    setThinking(localStorage.getItem('thinking') === 'true');
    setDevMode(localStorage.getItem(DEV_MODE_KEY) === 'true');
    try {
      const p = JSON.parse(localStorage.getItem(CHAT_PARAMS_KEY) || '');
      if (p) setChatParams({ ...DEFAULT_CHAT_PARAMS, ...p });
    } catch {}
  }, []);

  const handleChatParamsChange = useCallback((next: ChatParams) => {
    setChatParams(next);
    localStorage.setItem(CHAT_PARAMS_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    const onDevModeChange = (e: Event) => {
      setDevMode(Boolean((e as CustomEvent).detail));
    };
    const onThemeChange = (e: Event) => {
      const t = (e as CustomEvent).detail;
      if (t === 'light' || t === 'dark' || t === 'system') setTheme(t);
    };
    const onModelsCacheUpdated = () => {
      try {
        const { models: cachedModels } = JSON.parse(localStorage.getItem(MODELS_CACHE_KEY) || '{}');
        if (Array.isArray(cachedModels)) {
          const geminiIds = new Set(GEMINI_CATALOG.map(g => g.id));
          const cleaned = cachedModels.filter((m: any) => !(m.id && m.id.startsWith('gemini-') && !geminiIds.has(m.id)));
          setModels(cleaned);
        }
      } catch {}
    };
    window.addEventListener('dev-mode-change', onDevModeChange);
    window.addEventListener('theme-change', onThemeChange);
    window.addEventListener('models-cache-updated', onModelsCacheUpdated);
    return () => {
      window.removeEventListener('dev-mode-change', onDevModeChange);
      window.removeEventListener('theme-change', onThemeChange);
      window.removeEventListener('models-cache-updated', onModelsCacheUpdated);
    };
  }, []);

  // Load models
  useEffect(() => {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    const savedModel = localStorage.getItem(SELECTED_MODEL_KEY);

    // Migrate old model IDs
    const modelIdMigration: Record<string, string> = {
      'z-ai/glm-5.3': 'z-ai/glm5',
      'z-ai/glm-5.2': 'z-ai/glm5',
      'zai.glm-4.7': 'z-ai/glm5',
      'zai.glm-5': 'z-ai/glm5',
      'minimax/minimax-m1-80k': 'minimaxai/minimax-m3',
      'minimaxai/minimax-m3': 'minimaxai/minimax-m3',
      'minimax.minimax-m2.5': 'minimaxai/minimax-m3',
      'deepseek-ai/deepseek-r1': 'deepseek-ai/deepseek-v4-pro',
      'deepseek-ai/deepseek-v4-pro': 'deepseek-ai/deepseek-v4-pro',
      'moonshotai.kimi-k2.5': 'moonshotai/kimi-k2.6',
      'moonshotai/kimi-k2.5': 'moonshotai/kimi-k2.6',
      'global.amazon.nova-2-lite-v1:0': 'minimax.minimax-m2.5',
      'arn:aws:bedrock:us-east-1:936854375954:inference-profile/us.amazon.nova-lite-v1:0': 'minimax.minimax-m2.5',
      'eu.anthropic.claude-sonnet-4-6': 'z-ai/glm5',
      'global.anthropic.claude-opus-4-6-v1': 'deepseek-ai/deepseek-v4-pro',
    };
    const migratedModel = savedModel ? (modelIdMigration[savedModel] || savedModel) : null;
    if (migratedModel) {
      setSelectedModelId(migratedModel);
      localStorage.setItem(SELECTED_MODEL_KEY, migratedModel);
    }

    // Clear stale cache
    if (cached) {
      try {
        const { models: cachedModels } = JSON.parse(cached);
        const hasOldIds = cachedModels.some((m: any) => modelIdMigration[m.id]);
        if (hasOldIds) {
          localStorage.removeItem(MODELS_CACHE_KEY);
        }
      } catch {}
    }

    const cached2 = localStorage.getItem(MODELS_CACHE_KEY);
    if (cached2) {
      try {
        const { models: cachedModels, timestamp } = JSON.parse(cached2);
        if (Date.now() - timestamp < MODELS_CACHE_AGE) {
          const geminiIds = new Set(GEMINI_CATALOG.map(g => g.id));
          const cleaned = Array.isArray(cachedModels) ? cachedModels.filter((m: any) => !(m.id && m.id.startsWith('gemini-') && !geminiIds.has(m.id))) : cachedModels;
          setModels(cleaned);
          setIsModelsLoading(false);
          return;
        }
      } catch {}
    }

    fetch('/api/models').then(r => r.json()).then(data => {
      const m = data.models || []; setModels(m);
      localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ models: m, timestamp: Date.now() }));
      setIsModelsLoading(false);
    }).catch(() => setIsModelsLoading(false));
  }, []);

  const { user, isLoading: isAuthLoading, signOut } = useAuth();
  const { chats, currentChat, currentChatId, setCurrentChatId, createNewChat, deleteChat, updateChatTitle, addMessage, uploadImage } = useSupabaseChat(user);

  // Refs so stable callbacks can read the latest values without retriggering effects
  const selectedModelIdRef = useRef(selectedModelId);
  selectedModelIdRef.current = selectedModelId;
  const currentChatIdRef = useRef(currentChatId);
  currentChatIdRef.current = currentChatId;

  // Toggle tempera blob expansion when chat is active
  useEffect(() => {
    const root = document.documentElement;
    if (currentChatId) {
      root.classList.add('chat-active');
    } else {
      root.classList.remove('chat-active');
    }
  }, [currentChatId]);

  const currentModel = useMemo(() => getModelById(models, selectedModelId), [models, selectedModelId]);
  const modelLabel = currentModel?.label || selectedModelId.split('/').pop() || selectedModelId;
  const contextWindow = currentModel?.contextWindow || 131072;

  const dropdownGroups = useMemo(() => {
    const main: { id: string; label: string; tier?: string }[] = [];
    const dev: { id: string; label: string }[] = [];
    const google: { id: string; label: string; tier?: string }[] = GEMINI_CATALOG.map(m => ({ id: m.id, label: m.label, tier: m.tier }));
    const opencode: { id: string; label: string; tier?: string }[] = OPENCODE_CATALOG.map(m => ({ id: m.id, label: m.label, tier: m.tier }));
    if (models.length === 0) {
      main.push(...MODEL_SHEET_OPTIONS);
      if (devMode) dev.push(...DEV_MODEL_OPTIONS);
    } else {
      const tierOrder: Record<string, number> = { normal: 0, smart: 1, ultra: 2 };
      main.push(
        ...models
          .filter((m: any) => m.tier && !String(m.id).startsWith('gemini-') && !OPENCODE_MODEL_IDS.has(m.id)) // Gemini + OpenCode models live in their own tabs
          .sort((a: any, b: any) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9))
          .map((m: any) => ({ id: m.id, label: m.label || m.id, tier: m.tier as string })),
      );
      if (devMode) dev.push(...models.filter((m: any) => !m.tier && !String(m.id).startsWith('gemini-') && !OPENCODE_MODEL_IDS.has(m.id)).map((m: any) => ({ id: m.id, label: m.label || m.id })));
      for (const opt of MODEL_SHEET_OPTIONS) if (!main.some(m => m.id === opt.id)) main.push(opt);
      if (devMode) for (const opt of DEV_MODEL_OPTIONS) if (!dev.some(m => m.id === opt.id)) dev.push(opt);
    }
    return { main, dev, google, opencode };
  }, [models, devMode]);

  useEffect(() => {
    const knownIds: Set<string> = new Set([
      ...MODEL_SHEET_OPTIONS,
      ...DEV_MODEL_OPTIONS,
      ...GEMINI_CATALOG.map(g => g.id),
      ...OPENCODE_CATALOG.map(o => o.id),
    ].map(o => typeof o === 'string' ? o : o.id));
    if (selectedModelId && models.length > 0 && !models.find(m => m.id === selectedModelId) && !knownIds.has(selectedModelId)) {
      setSelectedModelId(DEFAULT_NIM_MODEL_ID);
      localStorage.setItem(SELECTED_MODEL_KEY, DEFAULT_NIM_MODEL_ID);
    }
  }, [models, selectedModelId]);

  useEffect(() => {
    if (branchToast) {
      const t = setTimeout(() => setBranchToast(null), 2500);
      return () => clearTimeout(t);
    }
  }, [branchToast]);

  const dismissError = useCallback(() => setError(null), []);

  const handleWebSearchToggle = useCallback(() => {
    setWebSearchMode(prev => {
      const next = prev === 'off' ? 'auto' : prev === 'auto' ? 'on' : 'off';
      localStorage.setItem('webSearchMode', next);
      return next;
    });
  }, []);

  const handleThinkingToggle = useCallback(() => {
    setThinking(prev => {
      const next = !prev;
      localStorage.setItem('thinking', String(next));
      return next;
    });
  }, []);

  const handleAuthCode = useCallback(async () => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (code) { await supabase.auth.exchangeCodeForSession(code); window.history.replaceState({}, document.title, window.location.pathname); }
  }, []);

  useEffect(() => { handleAuthCode(); }, [handleAuthCode]);

  // Mobile keyboard handling
  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const handleResize = () => {
      document.documentElement.style.setProperty('--visual-height', `${visual.height}px`);
    };
    handleResize();
    visual.addEventListener('resize', handleResize);
    return () => visual.removeEventListener('resize', handleResize);
  }, []);

  const generateChatTitle = useCallback(async (chatId: string, firstMessage: string) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Csinálj rövid címet (max 5 szó) ennek: "${firstMessage.substring(0, 200)}". Csak a címet.` }],
          model: DEFAULT_GC_MODEL_ID,
        }),
      });
      if (!res.ok) return;
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let title = '';
      let buffer = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Buffer across chunks: SSE lines can be split between reads
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data: ') || t === 'data: [DONE]') continue;
            try { title += JSON.parse(t.slice(6)).choices?.[0]?.delta?.content || ''; } catch {}
          }
        }
      }
      title = title.trim().replace(/^["']|["']$/g, '').replace(/^(Cím:|Title:)\s*/i, '');
      if (title.length > 3 && title.length < 100) await updateChatTitle(chatId, title);
    } catch {}
  }, [updateChatTitle]);

  const getSystemPrompt = () => localStorage.getItem('systemPrompt') || '';

  const loadChatCompactInfo = useCallback(async (chatId: string) => {
    const { data } = await supabase
      .from('chats')
      .select('compact_summary, compacted_count')
      .eq('id', chatId)
      .single();
    setCompactSummary((data?.compact_summary as string) || null);
    setCompactedCount(data?.compacted_count || 0);
  }, []);

  const fireCompact = useCallback(async (chatId: string, messages: { role: string; content: string; image_url?: string | null }[]) => {
    if (compactingRef.current || !chatId || messages.length === 0) return;
    compactingRef.current = true;
    try {
      const toCompact = messages.slice(0, Math.max(0, messages.length - COMPACT_KEEP_RECENT));
      if (toCompact.length === 0) return;

      const res = await fetch('/api/chat/compact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: toCompact }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.summary) return;

      await supabase.from('chats').update({
        compact_summary: data.summary,
        compacted_count: data.compactedCount || toCompact.length,
      }).eq('id', chatId);

      setCompactSummary(data.summary);
      setCompactedCount(data.compactedCount || toCompact.length);
    } catch {
      // Compact hiba nem blokkolja a chatet
    } finally {
      compactingRef.current = false;
    }
  }, []);

  const streamResponse = useCallback(async (response: Response, signal?: AbortSignal) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let accumulatedThinking = '';
    let buffer = '';
    let rafPending = false;
    let thinkingRafPending = false;
    streamStartRef.current = performance.now();
    firstTokenAtRef.current = null;
    streamCharsRef.current = 0;
    usageTokensRef.current = 0;
    fallbackModelRef.current = response.headers.get('x-fallback-model') || undefined;
    const compactHeader = response.headers.get('x-compact-info');
    if (compactHeader) {
      const [cm, ct] = compactHeader.split(';');
      const cmN = parseInt(cm, 10);
      if (!isNaN(cmN) && cmN > 0) compactInfoRef.current = { messages: cmN, tokens: parseInt(ct, 10) || 0 };
    } else {
      compactInfoRef.current = undefined;
    }

    const updateStats = () => {
      const now = performance.now();
      const ttft = firstTokenAtRef.current ? firstTokenAtRef.current - streamStartRef.current : null;
      const tokens = usageTokensRef.current || Math.round(streamCharsRef.current / 4);
      const elapsed = firstTokenAtRef.current ? (now - firstTokenAtRef.current) / 1000 : 0;
      setStreamStats(prev => ({
        ttft: ttft ?? prev?.ttft ?? 0,
        tokensPerSec: elapsed > 0 ? tokens / elapsed : 0,
        elapsed: (now - streamStartRef.current) / 1000,
      }));
    };

    const scheduleFlush = () => {
      if (rafPending || signal?.aborted) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (signal?.aborted) return;
        if (accumulated !== partialContentRef.current) {
          partialContentRef.current = accumulated;
          setStreamingContent(accumulated);
          updateStats();
        }
      });
    };

    const scheduleThinkingFlush = () => {
      if (thinkingRafPending || signal?.aborted) return;
      thinkingRafPending = true;
      requestAnimationFrame(() => {
        thinkingRafPending = false;
        if (signal?.aborted) return;
        if (accumulatedThinking !== thinkingContentRef.current) {
          thinkingContentRef.current = accumulatedThinking;
          setThinkingContent(accumulatedThinking);
        }
      });
    };

    if (reader) {
      try {
        while (true) {
          if (signal?.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const t = line.trim();
            if (!t || t === 'data: [DONE]') continue;
            if (t.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(t.slice(6));
                if (parsed.usage?.completion_tokens) usageTokensRef.current = parsed.usage.completion_tokens;
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.reasoning_content) { accumulatedThinking += delta.reasoning_content; scheduleThinkingFlush(); }
                if (delta?.content) {
                  if (firstTokenAtRef.current === null) {
                    firstTokenAtRef.current = performance.now();
                    console.log('[TTFT]', firstTokenAtRef.current - streamStartRef.current, 'ms');
                  }
                  streamCharsRef.current += delta.content.length;
                  accumulated += delta.content; scheduleFlush();
                }
              } catch {}
            } else if (t.startsWith('{')) {
              try {
                const parsed = JSON.parse(t);
                if (parsed.usage?.completion_tokens) usageTokensRef.current = parsed.usage.completion_tokens;
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.reasoning_content) { accumulatedThinking += delta.reasoning_content; scheduleThinkingFlush(); }
                if (delta?.content) {
                  if (firstTokenAtRef.current === null) {
                    firstTokenAtRef.current = performance.now();
                    console.log('[TTFT]', firstTokenAtRef.current - streamStartRef.current, 'ms');
                  }
                  streamCharsRef.current += delta.content.length;
                  accumulated += delta.content; scheduleFlush();
                }
              } catch {}
            }
          }
        }
      } catch {}
    }
    partialContentRef.current = accumulated;
    thinkingContentRef.current = accumulatedThinking;
    setStreamingContent(accumulated);
    setThinkingContent(accumulatedThinking);
    updateStats();
    return accumulated;
  }, []);

  const recordResponse = useCallback((model: string, opts?: { aborted?: boolean; error?: string }) => {
    if (!streamStartRef.current) return null;
    const now = performance.now();
    const ttft = firstTokenAtRef.current ? firstTokenAtRef.current - streamStartRef.current : 0;
    const elapsed = (now - streamStartRef.current) / 1000;
    const tokens = usageTokensRef.current || Math.round(streamCharsRef.current / 4);
    const entry: ResponseStat = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      model,
      timestamp: Date.now(),
      elapsed,
      ttft,
      tokensPerSec: elapsed > 0 ? tokens / elapsed : 0,
      tokens,
      chars: streamCharsRef.current,
      fallbackModel: fallbackModelRef.current,
      compacted: compactInfoRef.current,
      ...opts,
    };
    setLastResponse(entry);
    setResponseHistory(prev => [entry, ...prev].slice(0, 30));
    return entry;
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    recordResponse(sendModelRef.current, { aborted: true });
    setStreamingContent(''); setThinkingContent('');
    setIsLoading(false);
    setRegeneratingId(null);
  }, [recordResponse]);

  const handleSendMessage = useCallback(async (content: string, imageUrls?: string[] | null) => {
    if (!user) { setIsAuthModalOpen(true); return; }
    setStreamingContent(''); setThinkingContent(''); setStreamStats(null);
    if (abortRef.current) abortRef.current.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    let chatId = currentChatId;
    if (!chatId) {
      const newChatId = await createNewChat();
      if (!newChatId) return;
      chatId = newChatId;
    }

    setIsLoading(true);
    setError(null);
    setRegeneratingId(null);
    sendModelRef.current = selectedModelId;
    streamStartRef.current = 0;

    let allMessages: { role: string; content: string; image_url?: string | null }[];

    if (editingMessage) {
      const { data: msgs } = await supabase
        .from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
      const editIdx = msgs?.findIndex(m => m.id === editingMessage.id) ?? -1;
      if (editIdx !== -1 && msgs) {
        const toDelete = msgs.slice(editIdx).map(m => m.id);
        await supabase.from('messages').delete().in('id', toDelete);
      }
      const messagesBefore = (msgs || []).slice(0, editIdx);
      const userMsg = { role: 'user' as const, content, image_url: imageUrls ? (imageUrls.length === 1 ? imageUrls[0] : JSON.stringify(imageUrls)) : undefined };
      allMessages = [...messagesBefore.map(m => ({ role: m.role, content: m.content, image_url: m.image_url })), userMsg];
      await addMessage(chatId, 'user', content, imageUrls);
      setEditingMessage(null);
      bumpMessages();
    } else {
      const { data: freshMessages } = await supabase
        .from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
      const userMsg = { role: 'user' as const, content, image_url: imageUrls ? (imageUrls.length === 1 ? imageUrls[0] : JSON.stringify(imageUrls)) : undefined };
      allMessages = [...(freshMessages || []).map(m => ({ role: m.role, content: m.content, image_url: m.image_url })), userMsg];

      if (freshMessages?.length === 0 && !hasGeneratedTitle.has(chatId)) {
        generateChatTitle(chatId, content);
        setHasGeneratedTitle(prev => new Set(prev).add(chatId));
      }

      await addMessage(chatId, 'user', content, imageUrls);
      bumpMessages();
    }

    const heuristicTokens = countMessageTokensHeuristic(allMessages, selectedModelId);
      setTokenCount(heuristicTokens);

    if (isOverCompactThreshold(allMessages.length, heuristicTokens, compactSummary !== null)) {
      fireCompact(chatId, allMessages);
    }

    try {
      if (abort.signal.aborted) { setStreamingContent(''); setThinkingContent(''); return; }
      const requestStartAt = performance.now();
      streamStartRef.current = requestStartAt;
      firstTokenAtRef.current = null;
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages, model: selectedModelId, systemPrompt: getSystemPrompt(), webSearch: webSearchMode, thinking, compactSummary: compactSummary || undefined, ...chatParams }),
        signal: abort.signal,
      });

      if (abort.signal.aborted) { setStreamingContent(''); setThinkingContent(''); return; }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.details || errorBody.error || `Hiba: ${response.status}`);
      }

      const accumulatedContent = await streamResponse(response, abort.signal);
      setStreamingContent(''); setThinkingContent('');

      if (abort.signal.aborted) {
        const partial = partialContentRef.current;
        if (partial) {
          await addMessage(chatId, 'assistant', wrapWithThinking(partial, thinkingContentRef.current));
          setTokenCount(countMessageTokensHeuristic([...allMessages, { role: 'assistant', content: partial }], selectedModelId));
          bumpMessages();
        }
        return;
      }

      recordResponse(selectedModelId);

      const finalMessages = [...allMessages, { role: 'assistant' as const, content: accumulatedContent || '' }];
      setTokenCount(countMessageTokensHeuristic(finalMessages, selectedModelId));
      await addMessage(chatId, 'assistant', wrapWithThinking(accumulatedContent || 'Sajnos nem kaptam választ.', thinkingContentRef.current));
      bumpMessages();

      // Background: extract memories
      if (user && accumulatedContent) {
        fetch('/api/memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: allMessages.slice(-6), userId: user.id }),
        }).catch(() => {});
      }
    } catch (error: any) {
      setStreamingContent(''); setThinkingContent('');
      if (error?.name === 'AbortError') {
        const partial = partialContentRef.current;
        if (partial) {
          await addMessage(chatId, 'assistant', wrapWithThinking(partial, thinkingContentRef.current));
          setTokenCount(countMessageTokensHeuristic([...allMessages, { role: 'assistant', content: partial }], selectedModelId));
          bumpMessages();
        }
        return;
      }
      const msg = error instanceof Error ? error.message : 'Ismeretlen hiba';
      recordResponse(selectedModelId, { error: msg });
      // Error is shown via the banner only - never persisted as a chat message
      setError({ message: msg, timestamp: Date.now(), retryFn: () => { handleSendMessage(content, imageUrls); } });
    } finally {
      if (abortRef.current === abort) {
        abortRef.current = null;
        setIsLoading(false);
        setRegeneratingId(null);
      }
    }
  }, [user, currentChatId, createNewChat, addMessage, selectedModelId, generateChatTitle, hasGeneratedTitle, streamResponse, editingMessage, webSearchMode, thinking, chatParams, recordResponse, compactSummary, fireCompact, bumpMessages]);

  const handleImageUpload = useCallback(async (file: File): Promise<string | null> => {
    if (!user) return null;
    // Don't create a chat just for an image pick - upload to a draft path
    // (storage policy only checks the first folder = user id)
    return await uploadImage(file, currentChatId || 'draft');
  }, [user, currentChatId, uploadImage]);

  const handleNewChat = useCallback(() => {
    if (!user) { setIsAuthModalOpen(true); return; }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreamingContent(''); setThinkingContent('');
    setIsLoading(false);
    setEditingMessage(null);
    setCurrentChatId(null);
    setIsSidebarOpen(false);
    gcTriggeredRef.current = false;
    setCompactSummary(null);
    setCompactedCount(0);
  }, [user, setCurrentChatId]);

  const handleSelectChat = useCallback((chatId: string) => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setCurrentChatId(chatId);
    setStreamingContent(''); setThinkingContent('');
    setIsLoading(false);
    setIsSidebarOpen(false);
    setError(null);
    setEditingMessage(null);
    gcTriggeredRef.current = false;
    setRegeneratingId(null);
    if (chatId) loadChatCompactInfo(chatId);
  }, [setCurrentChatId, loadChatCompactInfo]);

  const handleMessagesLoaded = useCallback((messages: Message[]) => {
    setCurrentMessages(messages);
    setTokenCount(countMessageTokensHeuristic(messages.map(m => ({ role: m.role, content: m.content, image_url: m.image_url })), selectedModelIdRef.current));
    if (currentChatIdRef.current) loadChatCompactInfo(currentChatIdRef.current);
  }, [loadChatCompactInfo]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setCurrentChatId(null);
  }, [signOut, setCurrentChatId]);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    localStorage.setItem(SELECTED_MODEL_KEY, modelId);
    setIsModelSheetOpen(false);
    if (currentMessages.length > 0) {
      setTokenCount(countMessageTokensHeuristic(currentMessages.map(m => ({ role: m.role, content: m.content, image_url: m.image_url })), modelId));
    }
  }, [currentMessages]);

  const handleRegenerate = useCallback(async (messageId: string) => {
    if (!currentChatId || !user) return;
    if (abortRef.current) abortRef.current.abort();
    setStreamingContent(''); setThinkingContent('');

    const { data: messages } = await supabase
      .from('messages').select('*').eq('chat_id', currentChatId).order('created_at', { ascending: true });
    if (!messages) return;
    const msgIdx = messages.findIndex(m => m.id === messageId);
    if (msgIdx === -1 || messages[msgIdx].role !== 'assistant') return;

    const abort = new AbortController();
    abortRef.current = abort;
    setIsLoading(true);
    setError(null);
    // Hide the old message while regenerating; the DB row stays until the new
    // answer arrives, so on error it simply reappears (nothing is ever lost).
    setRegeneratingId(messageId);

    const allMessages = messages.slice(0, msgIdx).map(m => ({ role: m.role, content: m.content, image_url: m.image_url }));

    try {
      if (abort.signal.aborted) return;
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages, model: selectedModelId, systemPrompt: getSystemPrompt(), webSearch: webSearchMode, thinking, compactSummary: compactSummary || undefined, ...chatParams }),
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.details || errorBody.error || `Hiba: ${response.status}`);
      }

      const accumulatedContent = await streamResponse(response, abort.signal);
      setStreamingContent(''); setThinkingContent('');

      if (abort.signal.aborted) {
        // Stopped: keep the partial answer if we got one, otherwise restore the old message
        const partial = partialContentRef.current;
        if (partial) {
          await supabase.from('messages').delete().eq('id', messageId).eq('chat_id', currentChatId);
          await addMessage(currentChatId, 'assistant', wrapWithThinking(partial, thinkingContentRef.current));
          bumpMessages();
        }
        return;
      }

      recordResponse(selectedModelId);
      setTokenCount(countMessageTokensHeuristic([...allMessages, { role: 'assistant', content: accumulatedContent || '' }], selectedModelId));
      await supabase.from('messages').delete().eq('id', messageId).eq('chat_id', currentChatId);
      await addMessage(currentChatId, 'assistant', wrapWithThinking(accumulatedContent || 'Sajnos nem kaptam választ.', thinkingContentRef.current));
      bumpMessages();
    } catch (error: any) {
      setStreamingContent(''); setThinkingContent('');
      if (error?.name === 'AbortError') return; // old message reappears via regeneratingId reset
      const msg = error instanceof Error ? error.message : 'Ismeretlen hiba';
      recordResponse(selectedModelId, { error: msg });
      // Old message still exists in DB, so retry works reliably
      setError({ message: msg, timestamp: Date.now(), retryFn: () => handleRegenerate(messageId) });
    } finally {
      if (abortRef.current === abort) {
        abortRef.current = null;
        setIsLoading(false);
      }
      setRegeneratingId(null);
    }
  }, [currentChatId, user, addMessage, selectedModelId, streamResponse, webSearchMode, thinking, chatParams, recordResponse, compactSummary, bumpMessages]);

  const closeBranchToast = useCallback(() => setBranchToast(null), []);

  const handleBranch = useCallback(async (messageId: string) => {
    if (!currentChatId || !user) return;
    const { data: messages } = await supabase
      .from('messages').select('*').eq('chat_id', currentChatId).order('created_at', { ascending: true });
    if (!messages || messages.length === 0) return;

    const msgIdx = messages.findIndex(m => m.id === messageId);
    if (msgIdx === -1) return;
    const endIdx = msgIdx + 1;
    if (endIdx <= 0) return;

    const toCopy = messages.slice(0, endIdx);
    const newChatId = await createNewChat();
    if (!newChatId) return;

    await supabase.from('messages').insert(toCopy.map(m => ({
      chat_id: newChatId, role: m.role, content: m.content,
      image_url: m.image_url, created_at: m.created_at,
    })));

    const firstUserMsg = toCopy.find(m => m.role === 'user');
    if (firstUserMsg && !hasGeneratedTitle.has(newChatId)) {
      generateChatTitle(newChatId, firstUserMsg.content);
      setHasGeneratedTitle(prev => new Set(prev).add(newChatId));
    }
    setCurrentChatId(newChatId);
    setIsSidebarOpen(false);
    setError(null);
    gcTriggeredRef.current = false;
    setBranchToast(`Új ág létrehozva ${toCopy.length} üzenettel`);
  }, [currentChatId, user, createNewChat, generateChatTitle, hasGeneratedTitle]);

  const handleEditMessage = useCallback(async (messageId: string) => {
    const { data } = await supabase
      .from('messages').select('*').eq('id', messageId).single();
    if (data && data.role === 'user') {
      setEditingMessage(data as Message);
    }
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!currentChatId || !user) return;
    if (!window.confirm('Törlöd ezt az üzenetet és az utána következőket?')) return;
    const { data: msgs } = await supabase
      .from('messages').select('id').eq('chat_id', currentChatId).order('created_at', { ascending: true });
    if (!msgs) return;
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    const toDelete = msgs.slice(idx).map(m => m.id);
    // Delete with chat_id filter to satisfy RLS, in a single request
    await supabase.from('messages').delete().in('id', toDelete).eq('chat_id', currentChatId);
    bumpMessages();
  }, [currentChatId, user, bumpMessages]);

  const handleGarbageCollect = useCallback(async () => {
    if (!currentChatId || !user || gcTriggeredRef.current) return;
    gcTriggeredRef.current = true;

    const { data: messages } = await supabase
      .from('messages').select('*').eq('chat_id', currentChatId).order('created_at', { ascending: true });
    if (!messages || messages.length === 0) return;

    setIsLoading(true);
    setError(null);

    const convoText = messages.map(m => `[${m.role === 'user' ? 'Felhasznalo' : 'AI'}]: ${m.content.substring(0, 500)}`).join('\n\n');

    try {
      if (abortRef.current) abortRef.current.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Tomoritsd: ${convoText}` }], model: DEFAULT_GC_MODEL_ID,
          systemPrompt: 'Tomor osszefoglalo. Magyarul. Lenyeget.', signal: abort.signal,
        }),
      });
      if (!response.ok) throw new Error('GC hiba');
      const content = await streamResponse(response, abort.signal);
      setStreamingContent(''); setThinkingContent('');
      if (!content) throw new Error('Ures tomorites');

      const newChatId = await createNewChat();
      if (!newChatId) return;
      await addMessage(newChatId, 'user', `[GC] Tombritett valtozat`);
      await addMessage(newChatId, 'assistant', content);
      setCurrentChatId(newChatId);
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      gcTriggeredRef.current = false;
      setError({ message: error?.message || 'GC hiba', timestamp: Date.now(), retryFn: () => { gcTriggeredRef.current = false; handleGarbageCollect(); } });
    } finally {
      setIsLoading(false);
    }
  }, [currentChatId, user, createNewChat, addMessage, streamResponse]);

  useEffect(() => {
    if (isOverGCThreshold(tokenCount) && currentChatId && !isLoading && !gcTriggeredRef.current) handleGarbageCollect();
  }, [tokenCount, currentChatId, isLoading, handleGarbageCollect]);

  const handleExport = useCallback(async (format: 'markdown' | 'json' | 'clipboard') => {
    if (!currentChatId) return;
    setExportMenuOpen(false);
    const { data: messages } = await supabase
      .from('messages').select('*').eq('chat_id', currentChatId).order('created_at', { ascending: true });
    if (!messages || messages.length === 0) return;
    const title = currentChat?.title || 'Chat export';
    if (format === 'clipboard') {
      await navigator.clipboard.writeText(messages.map(m => `[${m.role === 'user' ? 'Te' : 'AI'}]: ${m.content}`).join('\n\n'));
      return;
    }
    const content = format === 'markdown' ? exportChatAsMarkdown(messages, title) : exportChatAsJson(messages, title);
    const blob = new Blob([content], { type: format === 'markdown' ? 'text/markdown' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.${format === 'markdown' ? 'md' : 'json'}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [currentChatId, currentChat]);

  // Use the preferred export format from settings if available
  const handleQuickExport = useCallback(() => {
    handleExport(exportFormat);
  }, [handleExport, exportFormat]);

  const usagePercent = getTokenUsagePercent(tokenCount, contextWindow);
  const usageColor = getTokenUsageColor(usagePercent);

  if (isAuthLoading) {
    return <div className="flex items-center justify-center h-dvh"><div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-accent spinner" /></div>;
  }

  return (
    <div className="flex overflow-hidden relative z-10" style={{ height: 'var(--visual-height, 100dvh)' }}>
      <Sidebar
        isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}
        chats={chats} currentChatId={currentChatId} onSelectChat={handleSelectChat}
        onNewChat={handleNewChat} onDeleteChat={deleteChat}
        user={user} onSignIn={() => setIsAuthModalOpen(true)}
        onSignOut={handleSignOut} onSettings={() => setIsSettingsOpen(true)}
      />

      <main className="flex-1 flex flex-col h-full relative">
        <header className="flex items-center justify-between px-3 py-2.5 z-10 glass" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-1.5 min-w-0">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 rounded-xl hover:bg-surface-hover transition-all duration-150" style={{ color: 'var(--fg-secondary)' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            <button onClick={() => setIsModelSheetOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl glass-hover transition-all duration-200 max-w-[200px] min-w-0" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)' }}>
              {thinking && (
                <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent)' }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                </svg>
              )}
              <span className="font-medium text-sm truncate" style={{ color: 'var(--fg)' }}>{modelLabel}</span>
              <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--fg-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {showTokenUsage && tokenCount > 0 && (
              <div className="flex items-center gap-1.5 ml-1">
                <div className="h-1.5 rounded-full w-12 overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${usagePercent}%`, backgroundColor: usageColor }} />
                </div>
                <span className="text-[10px] font-medium" style={{ color: 'var(--fg-muted)' }}>{formatTokenCount(tokenCount)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => setShowTokenUsage(p => { const n = !p; localStorage.setItem('showTokenUsage', String(n)); return n; })} className="p-2 rounded-xl hover:bg-surface-hover transition-all duration-150" title="Token használat" style={{ color: 'var(--fg-secondary)' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 9h16.5m-16.5 6.75h16.5" />
              </svg>
            </button>

            <button onClick={handleNewChat} className="p-2 rounded-xl hover:bg-surface-hover transition-all duration-150" title="Új beszélgetés" style={{ color: 'var(--fg-secondary)' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>

            {currentChatId && (
              <div className="relative">
                <button onClick={() => setExportMenuOpen(!exportMenuOpen)} className="p-2 rounded-xl hover:bg-surface-hover transition-all duration-150" title="Export" style={{ color: 'var(--fg-secondary)' }}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </button>
                {exportMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 rounded-xl shadow-lg z-50 min-w-[170px] animate-scaleIn overflow-hidden" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
                      {[
                        { label: 'Markdown (.md)', format: 'markdown' as const },
                        { label: 'JSON (.json)', format: 'json' as const },
                        { label: 'Vágólapra másolás', format: 'clipboard' as const },
                      ].map(item => (
                        <button key={item.format} onClick={() => handleExport(item.format)}
                          className="w-full text-left px-4 py-3 text-sm transition-colors duration-100 flex items-center justify-between" style={{ color: 'var(--fg-secondary)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span>{item.label}</span>
                          {item.format === exportFormat && (
                            <svg className="w-4 h-4 ml-2" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {!user && (
              <button onClick={() => setIsAuthModalOpen(true)} className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition-all duration-150">
                Bejelentkezés
              </button>
            )}
          </div>
        </header>

        {branchToast && (
          <div className="mx-3 mt-2 rounded-xl px-4 py-3 flex items-center justify-between animate-slideDown" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--success)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm break-words" style={{ color: 'var(--success)' }}>{branchToast}</span>
            </div>
            <button onClick={closeBranchToast} className="p-1.5 rounded-lg transition-colors flex-shrink-0 ml-2" style={{ color: 'var(--success)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {error && (
          <div className="mx-3 mt-2 rounded-xl px-4 py-3 flex items-center justify-between animate-slideDown" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--danger)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="text-sm break-words" style={{ color: 'var(--danger)' }}>{error.message}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {error.retryFn && (
                <button onClick={() => { dismissError(); error.retryFn?.(); }} className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.1)' }}>Újra</button>
              )}
              <button onClick={dismissError} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--danger)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <WelcomeScreen onSuggestionClick={handleSendMessage} currentChat={currentChat} userId={user?.id} />
          <MessageList
            chatId={currentChatId} isLoading={isLoading}
            refreshKey={messagesRefreshKey}
            onMessagesLoaded={handleMessagesLoaded}
            streamingContent={streamingContent}
            thinkingContent={thinkingContent}
            isThinking={thinking}
            devMode={devMode}
            streamStats={streamStats}
            onRegenerate={handleRegenerate} onBranch={handleBranch}
            onEdit={handleEditMessage} onDelete={handleDeleteMessage}
            modelLabel={modelLabel} regeneratingId={regeneratingId}
          />
        </div>

        {devMode && ((isLoading ? streamStats : lastResponse) || (compactSummary && compactedCount > 0)) && (
          <div className="px-3 pb-1.5 flex justify-center">
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl text-[11px] font-mono animate-fadeIn" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)', color: 'var(--fg-muted)' }}>
              {isLoading && streamStats ? (
                <>
                  <span>TTFT: {(streamStats.ttft / 1000).toFixed(2)}s</span>
                  <span>{streamStats.tokensPerSec.toFixed(0)} tok/s</span>
                  <span>{streamStats.elapsed.toFixed(1)}s</span>
                </>
              ) : lastResponse ? (
                <>
                  <span style={{ color: lastResponse.error ? 'var(--danger)' : undefined }}>{lastResponse.error ? 'Hiba' : lastResponse.aborted ? 'Megállítva' : 'Válasz'}</span>
                  <span>{lastResponse.model.split('/').pop()}</span>
                  <span>TTFT: {(lastResponse.ttft / 1000).toFixed(2)}s</span>
                  <span>{lastResponse.tokensPerSec.toFixed(0)} tok/s</span>
                  <span>{lastResponse.tokens} tok</span>
                  <span>{lastResponse.elapsed.toFixed(1)}s</span>
                  {lastResponse.fallbackModel && <span>fallback: {lastResponse.fallbackModel}</span>}
                  {lastResponse.compacted && <span style={{ color: 'var(--accent)' }}>compact: {lastResponse.compacted.messages} üzenet / {lastResponse.compacted.tokens} tok</span>}
                </>
              ) : null}
              {compactSummary && compactedCount > 0 && (
                <span style={{ color: 'var(--accent)' }}>compact: {compactedCount} üzenet összefoglalva</span>
              )}
            </div>
          </div>
        )}

        <div className="px-3 py-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
          <ChatInput
            onSend={(content, imageUrls) => { handleSendMessage(content, imageUrls); }}
            isLoading={isLoading} onImageUpload={handleImageUpload}
            onStop={stopStreaming}
            placeholder={user ? 'Írj bármit...' : 'Bejelentkezés szükséges'}
            editValue={editingMessage?.content}
            editImageUrls={(() => {
              if (!editingMessage?.image_url) return [];
              try {
                const p = JSON.parse(editingMessage.image_url);
                return Array.isArray(p) ? p : [editingMessage.image_url];
              } catch { return [editingMessage.image_url]; }
            })()}
            onCancelEdit={handleCancelEdit}
            webSearchMode={webSearchMode}
            onWebSearchToggle={handleWebSearchToggle}
          />
        </div>
      </main>

      {/* Model Dropdown */}
      {isModelSheetOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsModelSheetOpen(false)} />
          <div className="fixed left-3 top-14 rounded-xl shadow-lg z-50 min-w-[150px] animate-scaleIn overflow-hidden" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
            <div className="px-3 pt-3 pb-1">
              <div className="relative flex rounded-full p-1 mx-auto max-w-[280px]" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)' }}>
                <div
                  className="absolute top-1 bottom-1 w-[calc(33.333%-4px)] rounded-full transition-transform duration-200"
                  style={{ background: 'var(--accent-glass)', left: providerTab === 'nvidia' ? '4px' : providerTab === 'google' ? 'calc(33.333% + 0px)' : 'calc(66.666% + 0px)', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
                />
                {(['nvidia', 'google', 'opencode'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setProviderTab(p)}
                    className="relative flex-1 rounded-full py-1 text-[11px] font-semibold transition-colors"
                    style={{ color: providerTab === p ? 'var(--accent)' : 'var(--fg-muted)' }}
                  >
                    {p === 'nvidia' ? 'NVIDIA' : p === 'google' ? 'Google' : 'OpenCode'}
                  </button>
                ))}
              </div>
            </div>
            {providerTab === 'google' ? (
              <>
                {dropdownGroups.google.map(opt => {
                  const selected = opt.id === selectedModelId;
                  return (
                    <button key={opt.id} onClick={() => handleModelChange(opt.id)}
                      className="w-full text-left px-4 py-3 text-sm transition-colors duration-100 flex items-center justify-between"
                      style={{ color: selected ? 'var(--accent)' : 'var(--fg-secondary)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span>{opt.label}</span>
                      {selected && (
                        <svg className="w-4 h-4 ml-2" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </>
            ) : providerTab === 'opencode' ? (
              <>
                {dropdownGroups.opencode.map(opt => {
                  const selected = opt.id === selectedModelId;
                  return (
                    <button key={opt.id} onClick={() => handleModelChange(opt.id)}
                      className="w-full text-left px-4 py-3 text-sm transition-colors duration-100 flex items-center justify-between"
                      style={{ color: selected ? 'var(--accent)' : 'var(--fg-secondary)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span>{opt.label}</span>
                      {selected && (
                        <svg className="w-4 h-4 ml-2" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                {dropdownGroups.main.map(opt => {
              const selected = opt.id === selectedModelId;
              return (
                <button key={opt.id} onClick={() => handleModelChange(opt.id)}
                  className="w-full text-left px-4 py-3 text-sm transition-colors duration-100 flex items-center justify-between"
                  style={{ color: selected ? 'var(--accent)' : 'var(--fg-secondary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>{opt.label}</span>
                  {selected && (
                    <svg className="w-4 h-4 ml-2" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              );
            })}
                {dropdownGroups.dev.length > 0 && (
                  <>
                    <div className="mx-3 h-px" style={{ background: 'var(--border)' }} />
                    <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>Dev</div>
                    {dropdownGroups.dev.map(opt => {
                      const selected = opt.id === selectedModelId;
                      return (
                        <button key={opt.id} onClick={() => handleModelChange(opt.id)}
                          className="w-full text-left px-4 py-3 text-sm transition-colors duration-100 flex items-center justify-between"
                          style={{ color: selected ? 'var(--accent)' : 'var(--fg-secondary)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span>{opt.label}</span>
                          {selected && (
                            <svg className="w-4 h-4 ml-2" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            )}
            <div className="mx-3 h-px" style={{ background: 'var(--border)' }} />
            <button
              onClick={handleThinkingToggle}
              className="w-full text-left px-4 py-3 text-sm transition-colors duration-100 flex items-center justify-between"
              style={{ color: thinking ? 'var(--accent)' : 'var(--fg-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span>Gondolkodás</span>
              {thinking && (
                <svg className="w-4 h-4 ml-2" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </button>
          </div>
        </>
      )}

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <SettingsModal
        isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} user={user}
        devMode={devMode}
        responseHistory={responseHistory}
        models={models}
        chatParams={chatParams}
        onChatParamsChange={handleChatParamsChange}
      />
    </div>
  );
}
