'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/app/hooks/useAuth';
import { useSupabaseChat } from '@/app/hooks/useSupabaseChat';
import { Message, ChatError } from '@/app/types';
import { supabase } from '@/app/lib/supabase';
import {
  countMessageTokensHeuristic,
  countTokensApi,
  formatTokenCount,
  GEMINI_CONTEXT_WINDOW,
  getTokenUsagePercent,
  getTokenUsageColor,
  isOverGCThreshold,
} from '@/app/lib/tokens';
import Sidebar from '@/app/components/Sidebar';
import ChatInput from '@/app/components/ChatInput';
import MessageList from '@/app/components/MessageList';
import WelcomeScreen from '@/app/components/WelcomeScreen';
import AuthModal from '@/app/components/AuthModal';
import SettingsModal from '@/app/components/SettingsModal';

const MODEL_OPTIONS = [
  { id: 'gemini', label: 'Gemini Flash Lite' },
  { id: 'grok', label: 'Grok 4.20' },
];

export function exportChatAsMarkdown(messages: Message[], title: string): string {
  let md = `# ${title}\n\n`;
  for (const msg of messages) {
    const role = msg.role === 'user' ? '**Te**' : '**AI**';
    md += `### ${role}\n${msg.content}\n\n`;
    if (msg.image_url) md += `_[kep]_\n\n`;
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
  const [isTokenLoading, setIsTokenLoading] = useState(false);
  const [hasGeneratedTitle, setHasGeneratedTitle] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState('gemini');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [webSearchUsed, setWebSearchUsed] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const gcTriggeredRef = useRef(false);
  const lastTokenApiCallRef = useRef<string>('');

  useEffect(() => {
    const saved = localStorage.getItem('selectedModel');
    if (saved) setSelectedModel(saved);
  }, []);

  const { user, isLoading: isAuthLoading, signOut } = useAuth();
  const {
    chats, currentChat, currentChatId, setCurrentChatId,
    createNewChat, deleteChat, updateChatTitle, addMessage, uploadImage,
  } = useSupabaseChat(user);

  const allModels = MODEL_OPTIONS;
  const getModelLabel = (id: string) => allModels.find(m => m.id === id)?.label || id;
  const contextWindow = GEMINI_CONTEXT_WINDOW;

  const dismissError = useCallback(() => setError(null), []);

  const fetchRealTokenCount = useCallback(async (messages: Message[], model: string) => {
    const key = messages.map(m => m.id).join(',') + model;
    if (key === lastTokenApiCallRef.current) return;
    lastTokenApiCallRef.current = key;

    if (model === 'gemini' && messages.length > 0) {
      setIsTokenLoading(true);
      const realCount = await countTokensApi(messages);
      if (realCount > 0) {
        setTokenCount(realCount);
      }
      setIsTokenLoading(false);
    }
  }, []);

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
          messages: [{ role: 'user', content: `Csinálj egy rövid, lényegretörő címet (max 5 szó) ehhez a beszélgetéshez. Csak a címet írd, semmi mást.\n\nÜzenet: "${firstMessage.substring(0, 200)}"` }]
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
              } catch (e) {}
            }
          }
        }
      }
      title = title.trim().replace(/^["']|["']$/g, '').replace(/^(Cím:|Title:)\s*/i, '');
      if (title && title.length > 3 && title.length < 100) await updateChatTitle(chatId, title);
    } catch (error) {
      console.error('Error generating title:', error);
    }
  }, [updateChatTitle]);

  const getSystemPrompt = () => localStorage.getItem('systemPrompt') || '';

  const streamResponse = useCallback(async (response: Response) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = '';
    setStreamingContent('');

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
              if (parsed.__meta__?.web_search) { setWebSearchUsed(true); continue; }
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) { accumulatedContent += delta; setStreamingContent(accumulatedContent); }
            } catch (e) {}
          }
        }
      }
    }
    return accumulatedContent;
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

    const { data: freshMessages } = await supabase
      .from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });

    const userMsg: any = { role: 'user' as const, content, image_url: imageUrls ? (imageUrls.length === 1 ? imageUrls[0] : JSON.stringify(imageUrls)) : undefined };
    const allMessages = [...(freshMessages || []).map(m => ({ role: m.role, content: m.content, image_url: m.image_url })), userMsg];

    const heuristicTokens = countMessageTokensHeuristic(allMessages, selectedModel);
    setTokenCount(heuristicTokens);
    fetchRealTokenCount(freshMessages || [], selectedModel);

    if (freshMessages?.length === 0 && !hasGeneratedTitle.has(chatId)) {
      generateChatTitle(chatId, content);
      setHasGeneratedTitle(prev => new Set(prev).add(chatId));
    }

    await addMessage(chatId, 'user', content, imageUrls);

    try {
      const body: any = { messages: allMessages, model: selectedModel === 'grok' ? 'gemini' : selectedModel };
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
      const finalTokens = countMessageTokensHeuristic(finalMessages, selectedModel);
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
  }, [user, currentChatId, createNewChat, addMessage, selectedModel, generateChatTitle, hasGeneratedTitle, streamResponse, fetchRealTokenCount]);

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
    const heuristic = countMessageTokensHeuristic(messages.map(m => ({ role: m.role, content: m.content, image_url: m.image_url })), selectedModel);
    setTokenCount(heuristic);
    fetchRealTokenCount(messages, selectedModel);
  }, [selectedModel, fetchRealTokenCount]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setCurrentChatId(null);
  }, [signOut, setCurrentChatId]);

  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
    localStorage.setItem('selectedModel', model);
    setIsModelDropdownOpen(false);
    if (currentMessages.length > 0) {
      const tokens = countMessageTokensHeuristic(currentMessages.map(m => ({ role: m.role, content: m.content, image_url: m.image_url })), model);
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
      const body: any = { messages: allMessages, model: selectedModel === 'grok' ? 'gemini' : selectedModel };
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
      setTokenCount(countMessageTokensHeuristic(finalMessages, selectedModel));
      await addMessage(currentChatId, 'assistant', accumulatedContent || 'Sajnos nem kaptam választ.');
    } catch (error) {
      console.error('Error:', error);
      const msg = error instanceof Error ? error.message : 'Ismeretlen hiba';
      await addMessage(currentChatId, 'assistant', `Hiba: ${msg}`);
      setError({ message: msg, timestamp: Date.now(), retryFn: () => handleRegenerate(messageId) });
    } finally {
      setIsLoading(false);
    }
  }, [currentChatId, user, addMessage, selectedModel, streamResponse]);

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
        model: 'grok',
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
      <div className="flex items-center justify-center h-screen-safe">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen-safe bg-white overflow-hidden">
      <Sidebar
        isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}
        chats={chats} currentChatId={currentChatId} onSelectChat={handleSelectChat}
        onNewChat={handleNewChat} onDeleteChat={deleteChat}
        user={user} onSignIn={() => setIsAuthModalOpen(true)}
        onSignOut={handleSignOut} onSettings={() => setIsSettingsOpen(true)}
      />

      <main className="flex-1 flex flex-col h-full relative">
        <header className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2.5 -ml-1.5 touch-active rounded-full active:bg-gray-100">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="relative">
              <button onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)} className="flex items-center gap-1 px-2 py-1.5 touch-active rounded-lg active:bg-gray-100">
                <span className="font-medium text-gray-800 text-sm truncate max-w-[100px]">{getModelLabel(selectedModel)}</span>
                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isModelDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsModelDropdownOpen(false)} />
                  <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-[180px] max-h-[300px] overflow-y-auto">
                    {allModels.map((model) => (
                      <button key={model.id} onClick={() => handleModelChange(model.id)}
                        className={`w-full text-left px-4 py-3 text-sm touch-active ${selectedModel === model.id ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}>
                        {model.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {tokenCount > 0 && (
              <div className="flex items-center gap-1.5 min-w-0 flex-shrink">
                <div className="h-1.5 bg-gray-100 rounded-full flex-1 min-w-[40px] max-w-[80px] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${usagePercent}%`, backgroundColor: usageColor }} />
                </div>
                <span className="text-[10px] font-medium text-gray-500 whitespace-nowrap">
                  {isTokenLoading ? '...' : formatTokenCount(tokenCount)}/{formatTokenCount(contextWindow)}
                </span>
              </div>
            )}

            {webSearchUsed && (
              <div className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>Web
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={handleNewChat} className="p-2.5 touch-active rounded-full active:bg-gray-100" title="Uj beszelgetes">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>

            {currentChatId && (
              <div className="relative">
                <button onClick={() => setExportMenuOpen(!exportMenuOpen)} className="p-2.5 touch-active rounded-full active:bg-gray-100" title="Export">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
                {exportMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-[170px]">
                      {[
                        { label: 'Markdown (.md)', format: 'markdown' as const },
                        { label: 'JSON (.json)', format: 'json' as const },
                        { label: 'Vagolapra masolas', format: 'clipboard' as const },
                      ].map(item => (
                        <button key={item.format} onClick={() => handleExport(item.format)}
                          className="w-full text-left px-4 py-3 text-sm text-gray-700 touch-active">
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {!user && (
              <button onClick={() => setIsAuthModalOpen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 active:bg-blue-600 text-white text-sm font-medium rounded-full">
                Bejelentkezes
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="error-enter mx-3 mt-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-red-700 truncate">{error.message}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {error.retryFn && (
                <button onClick={() => { dismissError(); error.retryFn?.(); }} className="px-3 py-1.5 text-xs font-medium text-red-600 active:bg-red-100 rounded-lg">Ujra</button>
              )}
              <button onClick={dismissError} className="p-1.5 active:bg-red-100 rounded-full">
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col overflow-hidden bg-gradient-blue">
          <WelcomeScreen onSuggestionClick={handleSendMessage} currentChat={currentChat} />
          <MessageList
            chatId={currentChatId} isLoading={isLoading}
            onMessagesLoaded={handleMessagesLoaded}
            streamingContent={streamingContent}
            onRegenerate={handleRegenerate} onBranch={handleBranch}
          />
        </div>

        <div className="px-3 py-3 bg-gradient-to-t from-white via-white to-transparent" style={{ paddingBottom: `calc(12px + var(--safe-area-inset-bottom))` }}>
          <div className="w-full">
            <ChatInput
              onSend={(content, imageUrls) => { if (handleCompactCommand(content)) return; handleSendMessage(content, imageUrls); }}
              isLoading={isLoading} onImageUpload={handleImageUpload}
              placeholder={user ? "Kerj barmit... ( /compact = GC )" : "Bejelentkezes szukseges a chathez"}
            />
          </div>
        </div>
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} user={user} />
    </div>
  );
}