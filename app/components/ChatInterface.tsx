'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/app/hooks/useAuth';
import { useSupabaseChat } from '@/app/hooks/useSupabaseChat';
import { Message, ChatError } from '@/app/types';
import { supabase } from '@/app/lib/supabase';
import {
  countMessageTokensHeuristic,
  formatTokenCount,
  getModelContextWindow,
  getTokenUsagePercent,
  getTokenUsageColor,
  isOverGCThreshold,
} from '@/app/lib/tokens';
import { NimModel, DEFAULT_NIM_MODEL_ID, DEFAULT_GC_MODEL_ID, getModelById } from '@/app/lib/nim-models';
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

export function exportChatAsMarkdown(messages: Message[], title: string): string {
  let md = `# ${title}\n\n`;
  for (const msg of messages) {
    md += `### ${msg.role === 'user' ? 'Te' : 'AI'}\n${msg.content}\n\n`;
    if (msg.image_url) md += `_[kép]_\n\n`;
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
  const gcTriggeredRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const partialContentRef = useRef<string>('');
  const pendingChatIdRef = useRef<string | null>(null);

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
  }, []);

  // Load models
  useEffect(() => {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    const savedModel = localStorage.getItem(SELECTED_MODEL_KEY);
    if (savedModel) setSelectedModelId(savedModel);

    if (cached) {
      try {
        const { models: cachedModels, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < MODELS_CACHE_AGE) { setModels(cachedModels); setIsModelsLoading(false); return; }
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

  const currentModel = useMemo(() => getModelById(models, selectedModelId), [models, selectedModelId]);
  const modelLabel = currentModel?.label || selectedModelId.split('/').pop() || selectedModelId;
  const contextWindow = currentModel?.contextWindow || 131072;

  const groupedModels = useMemo(() => {
    const g: Record<string, NimModel[]> = {};
    for (const m of models) (g[m.publisher] ||= []).push(m);
    return g;
  }, [models]);

  const publisherOrder = useMemo(() => {
    const pref = ['NVIDIA', 'Meta', 'DeepSeek', 'Mistral AI', 'Google', 'Microsoft', 'Qwen'];
    const keys = Object.keys(groupedModels);
    return [...pref.filter(p => keys.includes(p)), ...keys.filter(k => !pref.includes(k))];
  }, [groupedModels]);

  useEffect(() => {
    if (selectedModelId && models.length > 0 && !models.find(m => m.id === selectedModelId)) {
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
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          for (const line of text.split('\n')) {
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

  const streamResponse = useCallback(async (response: Response, signal?: AbortSignal) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';
    let rafPending = false;

    const scheduleFlush = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (accumulated !== partialContentRef.current) {
          partialContentRef.current = accumulated;
          setStreamingContent(accumulated);
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
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) { accumulated += delta; scheduleFlush(); }
              } catch {}
            } else if (t.startsWith('{')) {
              try {
                const parsed = JSON.parse(t);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) { accumulated += delta; scheduleFlush(); }
              } catch {}
            }
          }
        }
      } catch {}
    }
    partialContentRef.current = accumulated;
    setStreamingContent(accumulated);
    return accumulated;
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreamingContent('');
    setIsLoading(false);
    setRegeneratingId(null);
  }, []);

  const handleSendMessage = useCallback(async (content: string, imageUrls?: string[] | null) => {
    if (!user) { setIsAuthModalOpen(true); return; }
    setStreamingContent('');
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
    setShowTokenUsage(false);
    setRegeneratingId(null);

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
    }

    const heuristicTokens = countMessageTokensHeuristic(allMessages, selectedModelId);
    setTokenCount(heuristicTokens);

    try {
      if (abort.signal.aborted) { setStreamingContent(''); return; }
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages, model: selectedModelId, systemPrompt: getSystemPrompt(), webSearch: webSearchMode }),
        signal: abort.signal,
      });

      if (abort.signal.aborted) { setStreamingContent(''); return; }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.details || errorBody.error || `Hiba: ${response.status}`);
      }

      const accumulatedContent = await streamResponse(response, abort.signal);
      setStreamingContent('');

      if (abort.signal.aborted) {
        const partial = partialContentRef.current;
        if (partial) {
          await addMessage(chatId, 'assistant', partial);
          setTokenCount(countMessageTokensHeuristic([...allMessages, { role: 'assistant', content: partial }], selectedModelId));
        }
        return;
      }

      const finalMessages = [...allMessages, { role: 'assistant' as const, content: accumulatedContent || '' }];
      setTokenCount(countMessageTokensHeuristic(finalMessages, selectedModelId));
      await addMessage(chatId, 'assistant', accumulatedContent || 'Sajnos nem kaptam választ.');
    } catch (error: any) {
      setStreamingContent('');
      if (error?.name === 'AbortError') {
        const partial = partialContentRef.current;
        if (partial) {
          await addMessage(chatId, 'assistant', partial);
          setTokenCount(countMessageTokensHeuristic([...allMessages, { role: 'assistant', content: partial }], selectedModelId));
        }
        return;
      }
      const msg = error instanceof Error ? error.message : 'Ismeretlen hiba';
      await addMessage(chatId, 'assistant', `Hiba: ${msg}`);
      setError({ message: msg, timestamp: Date.now(), retryFn: () => { handleSendMessage(content, imageUrls); } });
    } finally {
      if (abortRef.current === abort) {
        abortRef.current = null;
        setIsLoading(false);
        setRegeneratingId(null);
      }
    }
  }, [user, currentChatId, createNewChat, addMessage, selectedModelId, generateChatTitle, hasGeneratedTitle, streamResponse, editingMessage, webSearchMode]);

  const handleImageUpload = useCallback(async (file: File): Promise<string | null> => {
    if (!currentChatId) return null;
    return await uploadImage(file, currentChatId);
  }, [currentChatId, uploadImage]);

  const handleNewChat = useCallback(async () => {
    if (!user) { setIsAuthModalOpen(true); return; }
    setStreamingContent('');
    setEditingMessage(null);
    await createNewChat();
    setIsSidebarOpen(false);
    gcTriggeredRef.current = false;
  }, [user, createNewChat]);

  const handleSelectChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
    setStreamingContent('');
    setIsSidebarOpen(false);
    setError(null);
    setEditingMessage(null);
    gcTriggeredRef.current = false;
    setRegeneratingId(null);
  }, [setCurrentChatId]);

  const handleMessagesLoaded = useCallback((messages: Message[]) => {
    setCurrentMessages(messages);
    setTokenCount(countMessageTokensHeuristic(messages.map(m => ({ role: m.role, content: m.content, image_url: m.image_url })), selectedModelId));
  }, [selectedModelId]);

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
    setStreamingContent('');

    const { data: messages } = await supabase
      .from('messages').select('*').eq('chat_id', currentChatId).order('created_at', { ascending: true });
    if (!messages) return;
    const msgIdx = messages.findIndex(m => m.id === messageId);
    if (msgIdx === -1 || messages[msgIdx].role !== 'assistant') return;

    // Delete old message immediately so it disappears from the list
    await supabase.from('messages').delete().eq('id', messageId).eq('chat_id', currentChatId);

    const abort = new AbortController();
    abortRef.current = abort;
    setIsLoading(true);
    setError(null);

    const messagesBefore = messages.slice(0, msgIdx);
    const allMessages = messagesBefore.map(m => ({ role: m.role, content: m.content, image_url: m.image_url }));

    try {
      if (abort.signal.aborted) return;
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages, model: selectedModelId, systemPrompt: getSystemPrompt(), webSearch: webSearchMode }),
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.details || errorBody.error || `Hiba: ${response.status}`);
      }

      const accumulatedContent = await streamResponse(response, abort.signal);
      setStreamingContent('');

      if (abort.signal.aborted) return;

      setTokenCount(countMessageTokensHeuristic([...allMessages, { role: 'assistant', content: accumulatedContent || '' }], selectedModelId));
      await addMessage(currentChatId, 'assistant', accumulatedContent || 'Sajnos nem kaptam választ.');
    } catch (error: any) {
      setStreamingContent('');
      if (error?.name === 'AbortError') return;
      const msg = error instanceof Error ? error.message : 'Ismeretlen hiba';
      setError({ message: msg, timestamp: Date.now(), retryFn: () => handleRegenerate(messageId) });
    } finally {
      if (abortRef.current === abort) {
        abortRef.current = null;
        setIsLoading(false);
        setRegeneratingId(null);
      }
    }
  }, [currentChatId, user, addMessage, selectedModelId, streamResponse, webSearchMode]);

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
    const { data: msgs } = await supabase
      .from('messages').select('id').eq('chat_id', currentChatId).order('created_at', { ascending: true });
    if (!msgs) return;
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    const toDelete = msgs.slice(idx).map(m => m.id);
    await supabase.from('messages').delete().in('id', toDelete);
  }, [currentChatId, user]);

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
      setStreamingContent('');
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
    <div className="flex overflow-hidden" style={{ height: 'var(--visual-height, 100dvh)', background: 'var(--surface)' }}>
      <Sidebar
        isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}
        chats={chats} currentChatId={currentChatId} onSelectChat={handleSelectChat}
        onNewChat={handleNewChat} onDeleteChat={deleteChat}
        user={user} onSignIn={() => setIsAuthModalOpen(true)}
        onSignOut={handleSignOut} onSettings={() => setIsSettingsOpen(true)}
      />

      <main className="flex-1 flex flex-col h-full relative">
        <header className="flex items-center justify-between px-3 py-2.5 border-b z-10" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="flex items-center gap-1.5 min-w-0">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 rounded-xl hover:bg-surface-hover transition-all duration-150" style={{ color: 'var(--fg-secondary)' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            <button onClick={() => setIsModelSheetOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-surface-hover transition-all duration-150 max-w-[200px]">
              <div className="w-5 h-5 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
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

        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'linear-gradient(180deg, var(--surface) 0%, var(--surface) 100%)' }}>
          <WelcomeScreen onSuggestionClick={handleSendMessage} currentChat={currentChat} />
          <MessageList
            chatId={currentChatId} isLoading={isLoading}
            onMessagesLoaded={handleMessagesLoaded}
            streamingContent={streamingContent}
            onRegenerate={handleRegenerate} onBranch={handleBranch}
            onEdit={handleEditMessage} onDelete={handleDeleteMessage}
            modelLabel={modelLabel} regeneratingId={regeneratingId}
          />
        </div>

        <div className="px-3 py-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', background: 'linear-gradient(to top, var(--surface) 60%, transparent)' }}>
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

      {/* Model Sheet */}
      {isModelSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/40 sheet-backdrop" onClick={() => setIsModelSheetOpen(false)} />
          <div className="relative w-full sm:max-w-lg sm:rounded-2xl sm:max-h-[80vh] sm:mx-4 rounded-t-2xl max-h-[75vh] flex flex-col animate-slideUp" style={{ background: 'var(--surface-elevated)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--fg)' }}>Modell választás</h2>
              <button onClick={() => setIsModelSheetOpen(false)} className="p-2 rounded-xl hover:bg-surface-hover transition-colors" style={{ color: 'var(--fg-secondary)' }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {isModelsLoading ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <div className="w-6 h-6 rounded-full border-2 border-blue-200 border-t-accent spinner" />
              </div>
            ) : models.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-12" style={{ color: 'var(--fg-muted)' }}>Nem sikerült betölteni a modelleket</div>
            ) : (
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {publisherOrder.map(publisher => {
                  const pModels = groupedModels[publisher];
                  if (!pModels) return null;
                  return (
                    <div key={publisher} className="mb-4">
                      <div className="text-xs font-semibold uppercase tracking-wider px-2 py-1.5" style={{ color: 'var(--fg-muted)' }}>{publisher}</div>
                      {pModels.map(model => {
                        const selected = model.id === selectedModelId;
                        return (
                          <button key={model.id} onClick={() => handleModelChange(model.id)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                            style={{ background: selected ? 'rgba(59,130,246,0.1)' : 'transparent' }}>
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'border-accent' : ''}`} style={{ borderColor: selected ? 'var(--accent)' : 'var(--border)' }}>
                              {selected && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate" style={{ color: selected ? 'var(--accent)' : 'var(--fg)' }}>
                                {model.label}
                              </div>
                              <div className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>{model.id}</div>
                            </div>
                            <div className="text-[10px] flex-shrink-0" style={{ color: 'var(--fg-muted)' }}>{(model.contextWindow / 1000).toFixed(0)}k</div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} user={user} />
    </div>
  );
}
