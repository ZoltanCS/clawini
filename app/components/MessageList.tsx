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
  modelLabel?: string;
}

function TypingIndicator({ modelLabel = 'AI' }: { modelLabel?: string }) {
  return (
    <div className="flex justify-start mb-4 animate-messageSlideIn">
      <div className="bg-transparent px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-600">{modelLabel}</span>
        </div>
        <div className="flex items-center gap-1 ml-7">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

export default function MessageList({ chatId, isLoading, onMessagesLoaded, streamingContent, onRegenerate, onBranch, modelLabel = 'AI' }: MessageListProps) {
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
        if (onMessagesLoaded) onMessagesLoaded(data);
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
  }, [chatId, onMessagesLoaded]);

  const isNewChat = chatId !== prevChatId.current;

  useEffect(() => {
    const el = bottomRef.current;
    if (el) {
      el.scrollIntoView({ behavior: isNewChat ? 'auto' : 'smooth' });
    }
  }, [messages, isLoading, streamingContent, isNewChat]);

  if (!chatId) return null;

  if (isLoadingMessages) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (messages.length === 0) return null;

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-3 py-3 scroll-smooth">
      <div className="w-full max-w-3xl mx-auto">
        {messages.map((message, index) => (
          <div key={message.id} className={index === messages.length - 1 ? 'animate-messageSlideIn' : ''}>
            <MessageBubble 
              message={message}
              onRegenerate={() => onRegenerate?.(message.id)}
              onBranch={() => onBranch?.(message.id)}
              modelLabel={modelLabel}
            />
          </div>
        ))}
        {streamingContent && (
          <div className="flex justify-start mb-4 animate-messageSlideIn">
            <div className="max-w-[88%] sm:max-w-[75%] px-4 py-3 rounded-2xl bg-transparent">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-600">{modelLabel}</span>
              </div>
              <div className="text-[15px] leading-relaxed whitespace-pre-wrap streaming-cursor">{streamingContent}</div>
            </div>
          </div>
        )}
        {isLoading && !streamingContent && <TypingIndicator modelLabel={modelLabel} />}
        <div ref={bottomRef} className="h-1" />
      </div>
    </div>
  );
}
