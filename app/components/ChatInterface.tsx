'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/app/hooks/useAuth';
import { useSupabaseChat } from '@/app/hooks/useSupabaseChat';
import { Message } from '@/app/types';
import { supabase } from '@/app/lib/supabase';
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

  const handleSendMessage = useCallback(async (content: string, imageUrl?: string | null) => {
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

    // Build message history with the new user message
    const allMessages = [
      ...(freshMessages || []).map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content, image_url: imageUrl }
    ];

    // Add user message to database
    await addMessage(chatId, 'user', content, imageUrl);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

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
                }
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }

      // Add the complete assistant message (only ONE message, no empty one)
      await addMessage(chatId, 'assistant', accumulatedContent || 'Sajnos nem kaptam választ.');
    } catch (error) {
      console.error('Error:', error);
      await addMessage(chatId, 'assistant', 'Sajnos hiba történt. Kérlek, próbáld újra.');
    } finally {
      setIsLoading(false);
    }
  }, [user, currentChatId, createNewChat, addMessage]);

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
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white/80 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800">Gemini Flash Lite</span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
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
              A Gemini hibákat tartalmazhat. Kérlek, ellenőrizd a fontos információkat.
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
