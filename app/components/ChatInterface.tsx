'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/app/hooks/useAuth';
import { useSupabaseChat } from '@/app/hooks/useSupabaseChat';
import { Message, ChatError } from '@/app/types';
import { supabase } from '@/app/lib/supabase';
import {
  countMessageTokensHeuristic,
  countTokensApi,
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

export function exportChatAsMarkdown(messages: Message[], title: string): string {
  let md = `# ${title}\n\n`;
  for (const msg of messages) {
    const role = msg.role === 'user' ? '**Te**' : '**AI**';
    md += `### ${role}\n${msg.content}\n\n`;
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
  const [isTokenLoading, setIsTokenLoading] = useState(false);
  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [hasGeneratedTitle, setHasGeneratedTitle] = useState<Set<string>>(new Set());
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_NIM_MODEL_ID);
  const [isModelSheetOpen, setIsModelSheetOpen] = useState(false);
  const [webSearchUsed, setWebSearchUsed] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [models, setModels] = useState<NimModel[]>([]);
  const [isModelsLoading, setIsModelsLoading] = useState(true);
  const [showTokenUsage, setShowTokenUsage] = useState(false);
  const gcTriggeredRef = useRef(false);
  const lastTokenApiCallRef = useRef('');

  useEffect(() => {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    const savedModel = localStorage.getItem(SELECTED_MODEL_KEY);
    if (savedModel) setSelectedModelId(savedModel);

    if (cached) {
      try {
        const { models: cachedModels, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < MODELS_CACHE_AGE) {
          setModels(cachedModels);
          setIsModelsLoading(false);
          return;
        }
      } catch {}
    }

    fetch('/api/models')
      .then(r => r.json())
      .then(data => {
        const fetchedModels = data.models || [];
        setModels(fetchedModels);
        localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ models: fetchedModels, timestamp: Date.now() }));
        setIsModelsLoading(false);
      })
      .catch(() => {
        setIsModelsLoading(false);
      });
  }, []);

  const { user, isLoading: isAuthLoading, signOut } = useAuth();
  const {
    chats, currentChat, currentChatId, setCurrentChatId,
    createNewChat, deleteChat, updateChatTitle, addMessage, uploadImage,
  } = useSupabaseChat(user);

  const currentModel = useMemo(() => getModelById(models, selectedModelId), [models, selectedModelId]);
  const modelLabel = currentModel?.label || selectedModelId.split('/').pop() || selectedModelId;
  const modelPublisher = currentModel?.publisher || '';
  const contextWindow = currentModel?.contextWindow || 131072;

  const groupedModels = useMemo(() => {
    const groups: Record<string, NimModel[]> = {};
    for (const m of models) {
      (groups[m.publisher] ||= []).push(m);
    }
    return groups;
  }, [models]);

  const publisherOrder = useMemo(() => {
    const preferred = ['NVIDIA', 'Meta', 'DeepSeek', 'Mistral AI', 'Qwen', 'Google', 'Microsoft', '01.AI'];
    const keys = Object.keys(groupedModels);
    return [...preferred.filter(p => keys.includes(p)), ...keys.filter(k => !preferred.includes(k))];
  }, [groupedModels]);

  useEffect(() => {
    if (selectedModelId && models.length > 0 && !models.find(m => m.id === selectedModelId)) {
      setSelectedModelId(DEFAULT_NIM_MODEL_ID);
      localStorage.setItem(SELECTED_MODEL_KEY, DEFAULT_NIM_MODEL_ID);
    }
  }, [models, selectedModelId]);

  const dismissError = useCallback(() => setError(null), []);

  const handleAuthCode = useCallback(async () => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (code) {
      await supabase.auth.exchangeCodeForSession(code);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => { handleAuthCode(); }, [handleAuthCode]);

  const generateChatTitle = useCallback(async (chatId: string, firstMessage: string) => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Csinálj egy rövid, lényegretörő címet (max 5 szó) ehhez a beszélgetéshez. Csak a címet írd, semmi mást.\n\nÜzenet: "${firstMessage.substring(0, 200)}"` }],
          model: DEFAULT_GC_MODEL_ID,
        }),
      });
      if (!response.ok) return;
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let title = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) title += delta;
              } catch {}
            }
          }
        }
      }
      title = title.trim().replace(/^["']|["']$/g, '').replace(/^(Cím:|Title:)\s*/i, '');
      if (title && title.length > 3 && title.length < 100) await updateChatTitle(chatId, title);
    } catch (error) {
      console.error('Title gen error:', error);
    }
  }, [updateChatTitle]);

  const getSystemPrompt = () => localStorage.getItem('systemPrompt') || '';

  const streamResponse = useCallback(async (response: Response) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';
    setStreamingContent('');

    if (reader) {
      try {
        while (true) {
          const result = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Stream timeout')), 60000))
          ]);
          const { done, value } = result;
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed === 'data: [DONE]') continue;
            if (trimmed.startsWith('data: ')) {
              const data = trimmed.slice(6);
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) { accumulated += delta; setStreamingContent(accumulated); }
              } catch {}
            } else if (trimmed.startsWith('{')) {
              try {
                const parsed = JSON.parse(trimmed);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) { accumulated += delta; setStreamingContent(accumulated); }
              } catch {}
            }
          }
        }
      } catch (e) {
        if (accumulated) {
          return accumulated;
        }
        throw e;
      }
    }
    return accumulated;
  }, []);

  const handleSendMessage = useCallback(async (content: string, imageUrls?: string[] | null) => {
    if (!user) { setIsAuthModalOpen(true); return; }
    let chatId = currentChatId;
    if (!chatId) {
      const newChatId = await createNewChat();
      if (!newChatId) return;
      chatId = newChatId;
    }

    setIsLoading(true);
    setError(null);
    setShowTokenUsage(false);

    const { data: freshMessages } = await supabase
      .from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });

    const userMsg: any = { role: 'user' as const, content, image_url: imageUrls ? (imageUrls.length === 1 ? imageUrls[0] : JSON.stringify(imageUrls)) : undefined };
    const allMessages = [...(freshMessages || []).map(m => ({ role: m.role, content: m.content, image_url: m.image_url })), userMsg];

    const heuristicTokens = countMessageTokensHeuristic(allMessages, selectedModelId);
    setTokenCount(heuristicTokens);

    if (freshMessages?.length === 0 && !hasGeneratedTitle.has(chatId)) {
      generateChatTitle(chatId, content);
      setHasGeneratedTitle(prev => new Set(prev).add(chatId));
    }

    await addMessage(chatId, 'user', content, imageUrls);

    try {
      const body: any = { messages: allMessages, model: selectedModelId };
      body.systemPrompt = getSystemPrompt();

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.details || errorBody.error || `Hiba: ${response.status}`);
      }

      const accumulatedContent = await streamResponse(response);
      setStreamingContent('');
      setTimeout(() => setWebSearchUsed(false), 10000);

      const finalMessages = [...allMessages, { role: 'assistant' as const, content: accumulatedContent || '' }];
      const finalTokens = countMessageTokensHeuristic(finalMessages, selectedModelId);
      setTokenCount(finalTokens);
      await addMessage(chatId, 'assistant', accumulatedContent || 'Sajnos nem kaptam választ.');
    } catch (error) {
      console.error('Error:', error);
      const msg = error instanceof Error ? error.message : 'Ismeretlen hiba';
      await addMessage(chatId, 'assistant', `Hiba: ${msg}`);
      setError({ message: msg, timestamp: Date.now(), retryFn: () => { handleSendMessage(content, imageUrls); } });
    } finally {
      setIsLoading(false);
    }
  }, [user, currentChatId, createNewChat, addMessage, selectedModelId, generateChatTitle, hasGeneratedTitle, streamResponse]);

  const handleImageUpload = useCallback(async (file: File): Promise<string | null> => {
    if (!currentChatId) return null;
    return await uploadImage(file, currentChatId);
  }, [currentChatId, uploadImage]);

  const handleNewChat = useCallback(async () => {
    if (!user) { setIsAuthModalOpen(true); return; }
    await createNewChat();
    setIsSidebarOpen(false);
    gcTriggeredRef.current = false;
  }, [user, createNewChat]);

  const handleSelectChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
    setIsSidebarOpen(false);
    setError(null);
    gcTriggeredRef.current = false;
  }, [setCurrentChatId]);

  const handleMessagesLoaded = useCallback((messages: Message[]) => {
    setCurrentMessages(messages);
    const heuristic = countMessageTokensHeuristic(messages.map(m => ({ role: m.role, content: m.content, image_url: m.image_url })), selectedModelId);
    setTokenCount(heuristic);
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
      const tokens = countMessageTokensHeuristic(currentMessages.map(m => ({ role: m.role, content: m.content, image_url: m.image_url })), modelId);
      setTokenCount(tokens);
    }
  }, [currentMessages]);

  const handleRegenerate = useCallback(async (messageId: string) => {
    if (!currentChatId || !user) return;
    const { data: messages } = await supabase
      .from('messages').select('*').eq('chat_id', currentChatId).order('created_at', { ascending: true });
    if (!messages) return;
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messages[messageIndex].role !== 'assistant') return;
    const messagesBefore = messages.slice(0, messageIndex);

    await supabase.from('messages').delete().eq('id', messageId).eq('chat_id', currentChatId);
    setCurrentMessages(prev => prev.filter(m => m.id !== messageId));

    setIsLoading(true);
    setError(null);

    const allMessages = messagesBefore.map(m => ({ role: m.role, content: m.content, image_url: m.image_url }));
    try {
      const body: any = { messages: allMessages, model: selectedModelId };
      body.systemPrompt = getSystemPrompt();
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.details || errorBody.error || `Hiba: ${response.status}`);
      }
      const accumulatedContent = await streamResponse(response);
      setStreamingContent('');
      setTimeout(() => setWebSearchUsed(false), 10000);
      const finalMessages = [...allMessages, { role: 'assistant' as const, content: accumulatedContent || '' }];
      setTokenCount(countMessageTokensHeuristic(finalMessages, selectedModelId));
      await addMessage(currentChatId, 'assistant', accumulatedContent || 'Sajnos nem kaptam választ.');
    } catch (error) {
      console.error('Error:', error);
      const msg = error instanceof Error ? error.message : 'Ismeretlen hiba';
      await addMessage(currentChatId, 'assistant', `Hiba: ${msg}`);
      setError({ message: msg, timestamp: Date.now(), retryFn: () => handleRegenerate(messageId) });
    } finally {
      setIsLoading(false);
    }
  }, [currentChatId, user, addMessage, selectedModelId, streamResponse]);

  const handleBranch = useCallback(async (messageId: string) => {
    if (!currentChatId || !user) return;
    const { data: messages } = await supabase
      .from('messages').select('*').eq('chat_id', currentChatId).order('created_at', { ascending: true });
    if (!messages || messages.length === 0) return;
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    const isAssistant = messages[messageIndex].role === 'assistant';
    const endIndex = isAssistant ? messageIndex : messageIndex + 1;
    if (endIndex <= 0) return;
    const messagesToCopy = messages.slice(0, endIndex);

    const newChatId = await createNewChat();
    if (!newChatId) return;

    await supabase.from('messages').insert(messagesToCopy.map(msg => ({
      chat_id: newChatId, role: msg.role, content: msg.content,
      image_url: msg.image_url, created_at: msg.created_at,
    })));

    if (messagesToCopy.length > 0) {
      const firstUserMsg = messagesToCopy.find(m => m.role === 'user');
      if (firstUserMsg) {
        generateChatTitle(newChatId, firstUserMsg.content);
        setHasGeneratedTitle(prev => new Set(prev).add(newChatId));
      }
    }
    setCurrentChatId(newChatId);
    setIsSidebarOpen(false);
    setError(null);
    gcTriggeredRef.current = false;
  }, [currentChatId, user, createNewChat, generateChatTitle]);

  const handleGarbageCollect = useCallback(async () => {
    if (!currentChatId || !user || gcTriggeredRef.current) return;
    gcTriggeredRef.current = true;

    const { data: messages } = await supabase
      .from('messages').select('*').eq('chat_id', currentChatId).order('created_at', { ascending: true });
    if (!messages || messages.length === 0) return;

    setIsLoading(true);
    setError(null);

    const convoText = messages.map(m =>
      `[${m.role === 'user' ? 'Felhasznalo' : 'AI'}]: ${m.content.substring(0, 500)}`
    ).join('\n\n');

    try {
      const body: any = {
        messages: [{ role: 'user', content: `Tomoritsd ossze az alabbi beszelgetest. Tartsd meg a lenyegi informaciokat, kulcsfontossagu pontokat, donteseket es kontextust. Ird at ugy, mintha egy roviditett verzio lenne, amibol folytatni lehet a beszelgetest.\n\nBeszelgetes:\n${convoText}` }],
        model: DEFAULT_GC_MODEL_ID,
        systemPrompt: 'Te egy tomor osszefoglalo asszisztens vagy. Csak magyarul valaszolj. Legy tomor es lenyegretoro.',
      };
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.details || errorBody.error || `GC hiba: ${response.status}`);
      }
      const accumulatedContent = await streamResponse(response);
      setStreamingContent('');
      if (!accumulatedContent) throw new Error('A tomorites nem adott vissza eredmenyt.');

      const newChatId = await createNewChat();
      if (!newChatId) return;
      await addMessage(newChatId, 'user', `[GC] Garbage collector - tomorites (>800k token)`);
      await addMessage(newChatId, 'assistant', accumulatedContent);
      setCurrentChatId(newChatId);
      setIsSidebarOpen(false);
    } catch (error) {
      console.error('GC error:', error);
      gcTriggeredRef.current = false;
      const msg = error instanceof Error ? error.message : 'Ismeretlen hiba a tomorites soran';
      setError({ message: msg, timestamp: Date.now(), retryFn: () => { gcTriggeredRef.current = false; handleGarbageCollect(); } });
    } finally {
      setIsLoading(false);
    }
  }, [currentChatId, user, createNewChat, addMessage, streamResponse]);

  useEffect(() => {
    if (isOverGCThreshold(tokenCount) && currentChatId && !isLoading && !gcTriggeredRef.current) {
      handleGarbageCollect();
    }
  }, [tokenCount, currentChatId, isLoading, handleGarbageCollect]);

  const handleCompactCommand = useCallback((input: string) => {
    if (input.trim() === '/compact') { handleGarbageCollect(); return true; }
    return false;
  }, [handleGarbageCollect]);

  const handleExport = useCallback(async (format: 'markdown' | 'json' | 'clipboard') => {
    if (!currentChatId) return;
    setExportMenuOpen(false);
    const { data: messages } = await supabase
      .from('messages').select('*').eq('chat_id', currentChatId).order('created_at', { ascending: true });
    if (!messages || messages.length === 0) return;
    const title = currentChat?.title || 'Chat export';

    if (format === 'clipboard') {
      const text = messages.map(m => `[${m.role === 'user' ? 'Te' : 'AI'}]: ${m.content}`).join('\n\n');
      await navigator.clipboard.writeText(text);
      return;
    }

    const content = format === 'markdown' ? exportChatAsMarkdown(messages, title) : exportChatAsJson(messages, title);
    const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.${format === 'markdown' ? 'md' : 'json'}`;
    const blob = new Blob([content], { type: format === 'markdown' ? 'text/markdown' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [currentChatId, currentChat]);

  const usagePercent = getTokenUsagePercent(tokenCount, contextWindow);
  const usageColor = getTokenUsageColor(usagePercent);

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-white overflow-hidden">
      <Sidebar
        isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}
        chats={chats} currentChatId={currentChatId} onSelectChat={handleSelectChat}
        onNewChat={handleNewChat} onDeleteChat={deleteChat}
        user={user} onSignIn={() => setIsAuthModalOpen(true)}
        onSignOut={handleSignOut} onSettings={() => setIsSettingsOpen(true)}
      />

      <main className="flex-1 flex flex-col h-full relative">
        <header className="flex items-center justify-between px-2 py-2.5 border-b border-gray-100 bg-white/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-1 min-w-0">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-all duration-150">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            <button onClick={() => setIsModelSheetOpen(true)} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-all duration-150 max-w-[180px]">
              <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="font-medium text-gray-800 text-sm truncate">{modelLabel}</span>
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {showTokenUsage && tokenCount > 0 && (
              <div className="flex items-center gap-1.5 ml-1">
                <div className="h-1.5 bg-gray-100 rounded-full w-12 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${usagePercent}%`, backgroundColor: usageColor }} />
                </div>
                <span className="text-[10px] font-medium text-gray-500">{formatTokenCount(tokenCount)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setShowTokenUsage(p => !p)} className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-all duration-150" title="Token használat">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </button>

            <button onClick={handleNewChat} className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-all duration-150" title="Új beszélgetés">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>

            {currentChatId && (
              <div className="relative">
                <button onClick={() => setExportMenuOpen(!exportMenuOpen)} className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-all duration-150" title="Export">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </button>
                {exportMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-[170px] animate-scaleIn">
                      {[
                        { label: 'Markdown (.md)', format: 'markdown' as const },
                        { label: 'JSON (.json)', format: 'json' as const },
                        { label: 'Vágólapra másolás', format: 'clipboard' as const },
                      ].map(item => (
                        <button key={item.format} onClick={() => handleExport(item.format)}
                          className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors duration-100">
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {!user && (
              <button onClick={() => setIsAuthModalOpen(true)} className="px-3.5 py-2 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-medium rounded-full transition-all duration-150 hover:shadow-lg hover:shadow-blue-200">
                Bejelentkezés
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="mx-2 mt-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between animate-slideDown">
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="text-sm text-red-700 break-words">{error.message}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {error.retryFn && (
                <button onClick={() => { dismissError(); error.retryFn?.(); }} className="px-3 py-1.5 text-xs font-medium text-red-600 active:bg-red-100 rounded-lg">Újra</button>
              )}
              <button onClick={dismissError} className="p-1.5 active:bg-red-100 rounded-full">
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-blue-50/50 to-white">
          <WelcomeScreen onSuggestionClick={handleSendMessage} currentChat={currentChat} />
          <MessageList
            chatId={currentChatId} isLoading={isLoading}
            onMessagesLoaded={handleMessagesLoaded}
            streamingContent={streamingContent}
            onRegenerate={handleRegenerate} onBranch={handleBranch}
            modelLabel={modelLabel}
          />
        </div>

        <div className="px-3 py-3 bg-gradient-to-t from-white via-white to-transparent" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
          <ChatInput
            onSend={(content, imageUrls) => { if (handleCompactCommand(content)) return; handleSendMessage(content, imageUrls); }}
            isLoading={isLoading} onImageUpload={handleImageUpload}
            placeholder={user ? 'Írj bármit...' : 'Bejelentkezés szükséges'}
          />
        </div>
      </main>

      {/* Model Sheet - Mobile Bottom Sheet */}
      {isModelSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/40 sheet-backdrop" onClick={() => setIsModelSheetOpen(false)} />
          <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl sm:max-h-[80vh] sm:mx-4 rounded-t-2xl max-h-[70vh] flex flex-col animate-slideUp">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Modell választás</h2>
              <button onClick={() => setIsModelSheetOpen(false)} className="p-2 rounded-full active:bg-gray-100">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {isModelsLoading ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
              </div>
            ) : models.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-12 text-gray-500 text-sm">Nem sikerült betölteni a modelleket</div>
            ) : (
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {publisherOrder.map(publisher => {
                  const publisherModels = groupedModels[publisher];
                  if (!publisherModels) return null;
                  return (
                    <div key={publisher} className="mb-4">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 py-1.5">{publisher}</div>
                      {publisherModels.map(model => {
                        const isSelected = model.id === selectedModelId;
                        return (
                          <button
                            key={model.id}
                            onClick={() => handleModelChange(model.id)}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left active:bg-gray-50 transition-colors ${
                              isSelected ? 'bg-blue-50' : ''
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'border-blue-500' : 'border-gray-300'
                            }`}>
                              {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                                {model.label}
                              </div>
                              <div className="text-xs text-gray-500 truncate">{model.id}</div>
                              {model.description && (
                                <div className="text-xs text-gray-400 mt-0.5">{model.description}</div>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 flex-shrink-0">{(model.contextWindow / 1000).toFixed(0)}k</div>
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
