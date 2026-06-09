'use client';

import { useRef, useEffect, useState } from 'react';
import { Message } from '@/app/types';
import MessageBubble from './MessageBubble';
import { supabase } from '@/app/lib/supabase';

interface MessageListProps {
  chatId: string | null;
  isLoading: boolean;
  onMessagesLoaded?: (messages: Message[]) => void;
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-transparent px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 relative">
            <svg viewBox="0 0 24 24" className="w-full h-full">
              <path fill="#4285f4" d="M12 2L8 8l4 3-4 3 4 6 4-6-4-3 4-6z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-600">Gemini</span>
        </div>
        <div className="flex items-center gap-1 ml-8">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce-delayed" />
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce-delayed" />
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce-delayed" />
        </div>
      </div>
    </div>
  );
}

export default function MessageList({ chatId, isLoading, onMessagesLoaded }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Load messages when chat changes
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setIsLoadingMessages(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data);
        if (onMessagesLoaded) {
          onMessagesLoaded(data);
        }
      }
      setIsLoadingMessages(false);
    };

    loadMessages();

    // Subscribe to new messages
    const subscription = supabase
      .channel(`messages-${chatId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [chatId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!chatId) {
    return null;
  }

  if (isLoadingMessages) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="max-w-3xl mx-auto">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
        
        {/* Disclaimer */}
        {messages.length > 0 && !isLoading && (
          <div className="text-center mt-6 mb-2">
            <p className="text-xs text-gray-400">
              A Gemini hibákat tartalmazhat. Kérlek, ellenőrizd a fontos információkat.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
