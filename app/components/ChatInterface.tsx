'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/app/hooks/useAuth';
import { useSupabaseChat } from '@/app/hooks/useSupabaseChat';
import { Message } from '@/app/types';
import { supabase } from '@/app/lib/supabase';
import { countMessageTokens, formatTokenCount } from '@/app/lib/tokens';
import Sidebar from '@/app/components/Sidebar';
import ChatInput from '@/app/components/ChatInput';
import MessageList from '@/app/components/MessageList';
import WelcomeScreen from '@/app/components/WelcomeScreen';
import AuthModal from '@/app/components/AuthModal';
import SettingsModal from '@/app/components/SettingsModal';

export default function ChatInterface() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [hasGeneratedTitle, setHasGeneratedTitle] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'deepseek'>('gemini');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Load model preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('selectedModel');
    if (saved === 'gemini' || saved === 'deepseek') {
      setSelectedModel(saved);
    }
  }, []);
  
  const { user, isLoading: isAuthLoading, signOut } = useAuth();

  // Handle OAuth callback code
  useEffect(() => {
    const handleAuthCode = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      
      if (code) {
        // Exchange code for session
        await supabase.auth.exchangeCodeForSession(code);
        // Remove code from URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };
    
    handleAuthCode();
  }, []);
  const {
    chats,
    currentChat,
    currentChatId,
    setCurrentChatId,
    createNewChat,
    deleteChat,
    updateChatTitle,
    addMessage,
    uploadImage,
  } = useSupabaseChat(user);

  // Auto-generate chat title based on first message
  const generateChatTitle = useCallback(async (chatId: string, firstMessage: string) => {
    console.log('Generating title for chat:', chatId, 'message:', firstMessage.substring(0, 50));
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: `Csinálj egy rövid, lényegretörő címet (max 5 szó) ehhez a beszélgetéshez. Csak a címet írd, semmi mást.\n\nÜzenet: "${firstMessage.substring(0, 200)}"` }
          ]
        }),
      });

      if (!response.ok) {
        console.error('Title generation failed:', response.status);
        return;
      }

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
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }

      // Clean up title
      title = title.trim().replace(/^["']|["']$/g, '').replace(/^(Cím:|Title:)\s*/i, '');
      console.log('Generated title:', title);
      
      if (title && title.length > 3 && title.length < 100) {
        await updateChatTitle(chatId, title);
        console.log('Title updated successfully');
      } else {
        console.log('Title too short or empty, skipping');
      }
    } catch (error) {
      console.error('Error generating title:', error);
    }
  }, [updateChatTitle]);

  const handleSendMessage = useCallback(async (content: string, imageUrls?: string[] | null) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    let chatId = currentChatId;
    
    // Create new chat if none exists
    if (!chatId) {
      const newChatId = await createNewChat();
      if (!newChatId) return;
      chatId = newChatId;
    }

    setIsLoading(true);

    // Load fresh messages from database to ensure full context
    const { data: freshMessages } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    // Build message history with the new user message (include image_url for context)
    const allMessages = [
      ...(freshMessages || []).map(m => ({ role: m.role, content: m.content, image_url: m.image_url })),
      { role: 'user' as const, content, image_url: imageUrls ? (imageUrls.length === 1 ? imageUrls[0] : JSON.stringify(imageUrls)) : undefined }
    ];

    // Update token count
    const tokens = countMessageTokens(allMessages);
    setTokenCount(tokens);

    // Generate title on FIRST message only
    if (freshMessages?.length === 0 && !hasGeneratedTitle.has(chatId)) {
      generateChatTitle(chatId, content);
      setHasGeneratedTitle(prev => new Set(prev).add(chatId));
    }

    // Add user message to database
    await addMessage(chatId, 'user', content, imageUrls);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages, model: selectedModel }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

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
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  accumulatedContent += delta;
                  setStreamingContent(accumulatedContent); // Update UI in real-time
                }
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }

      setStreamingContent('');
      // Add the complete assistant message (only ONE message, no empty one)
      await addMessage(chatId, 'assistant', accumulatedContent || 'Sajnos nem kaptam választ.');
    } catch (error) {
      console.error('Error:', error);
      await addMessage(chatId, 'assistant', 'Sajnos hiba történt. Kérlek, próbáld újra.');
    } finally {
      setIsLoading(false);
    }
  }, [user, currentChatId, createNewChat, addMessage, selectedModel]);

  const handleImageUpload = useCallback(async (file: File): Promise<string | null> => {
    if (!currentChatId) return null;
    return await uploadImage(file, currentChatId);
  }, [currentChatId, uploadImage]);

  const handleNewChat = useCallback(async () => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    await createNewChat();
    setIsSidebarOpen(false);
  }, [user, createNewChat]);

  const handleSelectChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
    setIsSidebarOpen(false);
  }, [setCurrentChatId]);

  const handleMessagesLoaded = useCallback((messages: Message[]) => {
    setCurrentMessages(messages);
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setCurrentChatId(null);
  }, [signOut, setCurrentChatId]);

  const handleModelChange = useCallback((model: 'gemini' | 'deepseek') => {
    setSelectedModel(model);
    localStorage.setItem('selectedModel', model);
    setIsModelDropdownOpen(false);
  }, []);

  const handleRegenerate = useCallback(async (messageId: string) => {
    if (!currentChatId || !user) return;

    // Load fresh messages from database
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', currentChatId)
      .order('created_at', { ascending: true });

    if (!messages) return;

    // Find the message to regenerate
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messages[messageIndex].role !== 'assistant') return;

    // Get all messages before this one
    const messagesBefore = messages.slice(0, messageIndex);

    // Delete the old message from database
    await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('chat_id', currentChatId);

    // Remove from local state immediately
    setCurrentMessages(prev => prev.filter(m => m.id !== messageId));

    // Regenerate
    setIsLoading(true);
    
    const allMessages = messagesBefore.map(m => ({ 
      role: m.role, 
      content: m.content,
      image_url: m.image_url 
    }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages, model: selectedModel }),
      });

      if (!response.ok) throw new Error('Failed to get response');

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
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  accumulatedContent += delta;
                  setStreamingContent(accumulatedContent);
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }

      setStreamingContent('');
      await addMessage(currentChatId, 'assistant', accumulatedContent || 'Sajnos nem kaptam választ.');
    } catch (error) {
      console.error('Error:', error);
      await addMessage(currentChatId, 'assistant', 'Sajnos hiba történt. Kérlek, próbáld újra.');
    } finally {
      setIsLoading(false);
    }
  }, [currentChatId, user, addMessage, selectedModel]);

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={deleteChat}
        user={user}
        onSignIn={() => setIsAuthModalOpen(true)}
        onSignOut={handleSignOut}
        onSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            <div className="relative">
              <button
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <span className="font-medium text-gray-800">
                  {selectedModel === 'gemini' ? 'Gemini Flash Lite' : 'DeepSeek 8B'}
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isModelDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsModelDropdownOpen(false)} />
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px] overflow-hidden">
                    <button
                      onClick={() => handleModelChange('gemini')}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${selectedModel === 'gemini' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}
                    >
                      Gemini Flash Lite
                    </button>
                    <button
                      onClick={() => handleModelChange('deepseek')}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${selectedModel === 'deepseek' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}
                    >
                      DeepSeek 8B
                    </button>
                  </div>
                </>
              )}
            </div>
            
            {/* Token Counter */}
            {tokenCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>{formatTokenCount(tokenCount)} token</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleNewChat}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="Új beszélgetés"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {!user && (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-full transition-colors"
              >
                Bejelentkezés
              </button>
            )}
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gradient-blue">
          <WelcomeScreen 
            onSuggestionClick={handleSendMessage}
            currentChat={currentChat}
          />
          
          <MessageList 
            chatId={currentChatId}
            isLoading={isLoading}
            onMessagesLoaded={handleMessagesLoaded}
            streamingContent={streamingContent}
            onRegenerate={handleRegenerate}
          />

        </div>

        {/* Input Area */}
        <div className="px-4 py-4 bg-gradient-to-t from-white via-white to-transparent">
          <div className="max-w-3xl mx-auto">
            <ChatInput
              onSend={handleSendMessage}
              isLoading={isLoading}
              onImageUpload={handleImageUpload}
              placeholder={user ? "Kérdezz bármit..." : "Bejelentkezés szükséges a chathez"}
            />
            <p className="text-center text-xs text-gray-400 mt-2">
              A {selectedModel === 'gemini' ? 'Gemini' : 'DeepSeek'} hibákat tartalmazhat. Kérlek, ellenőrizd a fontos információkat.
            </p>
          </div>
        </div>
      </main>

      {/* Modals */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} user={user} />
    </div>
  );
}
