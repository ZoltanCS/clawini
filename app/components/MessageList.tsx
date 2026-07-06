'use client';

import { useRef, useEffect, useState } from 'react';
import { Message } from '@/app/types';
import MessageBubble from './MessageBubble';
import { supabase } from '@/app/lib/supabase';

interface MessageListProps {
  chatId: string | null;
  isLoading: boolean;
  onMessagesLoaded?: (messages: Message[]) => void;
  streamingContent?: string;
  onRegenerate?: (messageId: string) => void;
  onBranch?: (messageId: string) => void;
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4 message-enter">
      <div className="bg-transparent px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 relative">
            <svg viewBox="0 0 24 24" className="w-full h-full">
              <path fill="#4285f4" d="M12 2L8 8l4 3-4 3 4 6 4-6-4-3 4-6z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-600">AI</span>
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

export default function MessageList({ chatId, isLoading, onMessagesLoaded, streamingContent, onRegenerate, onBranch }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const prevChatId = useRef<string | null>(null);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      prevChatId.current = null;
      return;
    }

    setIsLoadingMessages(true);
    prevChatId.current = chatId;

    const loadMessages = async () => {
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

    const subscription = supabase
      .channel(`messages-${chatId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages((prev) => [...prev, payload.new as Message]);
          } else if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter(m => m.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) => prev.map(m => m.id === payload.new.id ? payload.new as Message : m));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [chatId]);

  const isNewChat = chatId !== prevChatId.current;

  useEffect(() => {
    const el = bottomRef.current;
    if (el) {
      el.scrollIntoView({ behavior: isNewChat ? 'auto' : 'smooth' });
    }
  }, [messages, isLoading, isNewChat]);

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
    <div ref={containerRef} className="flex-1 overflow-y-auto px-3 py-3 scroll-smooth">
      <div className="w-full">
        {messages.map((message, index) => (
          <div key={message.id} className={index === messages.length - 1 ? 'message-enter' : ''}>
            <MessageBubble 
              message={message} 
              onRegenerate={() => onRegenerate?.(message.id)}
              onBranch={() => onBranch?.(message.id)}
            />
          </div>
        ))}
        {streamingContent && (
          <div className="flex justify-start mb-4">
            <div className="max-w-[85%] px-4 py-3 rounded-2xl bg-transparent">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 relative">
                  <svg viewBox="0 0 24 24" className="w-full h-full">
                    <path fill="#4285f4" d="M12 2L8 8l4 3-4 3 4 6 4-6-4-3 4-6z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-600">AI</span>
              </div>
              <div className="text-[15px] leading-relaxed whitespace-pre-wrap streaming-cursor">{streamingContent}</div>
            </div>
          </div>
        )}
        {isLoading && !streamingContent && <TypingIndicator />}
        <div ref={bottomRef} className="h-1" />
      </div>
    </div>
  );
}