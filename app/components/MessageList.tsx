'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
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
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  modelLabel?: string;
  regeneratingId?: string | null;
}

function TypingIndicator({ modelLabel = 'AI' }: { modelLabel?: string }) {
  return (
    <div className="flex justify-start mb-4 animate-messageSlideIn">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center animate-float">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
              <span className="text-sm font-medium" style={{ color: 'var(--fg-secondary)' }}>{modelLabel}</span>
            </div>
            <div className="flex items-center gap-1.5 ml-7">
          <div className="w-2 h-2 bg-blue-400 rounded-full typing-dot" />
          <div className="w-2 h-2 bg-blue-400 rounded-full typing-dot" />
          <div className="w-2 h-2 bg-blue-400 rounded-full typing-dot" />
        </div>
      </div>
    </div>
  );
}

export default function MessageList({ chatId, isLoading, onMessagesLoaded, streamingContent, onRegenerate, onBranch, onEdit, onDelete, modelLabel = 'AI', regeneratingId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const prevChatId = useRef<string | null>(null);
  const prevMessageCount = useRef(0);
  const isNearBottom = useRef(true);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 150;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

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

  useEffect(() => {
    prevMessageCount.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (!isNearBottom.current) return;
    const el = bottomRef.current;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  if (!chatId) return null;

  if (isLoadingMessages) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-500 spinner" />
      </div>
    );
  }

  if (messages.length === 0) return null;

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-3 scroll-smooth" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
      <div className="w-full max-w-3xl mx-auto">
        {messages.map((message, index) => (
          <div key={message.id} className="animate-messageSlideIn" style={{ animationDelay: index === messages.length - 1 ? '0s' : '0s' }}>
            <MessageBubble 
              message={message}
              onRegenerate={() => onRegenerate?.(message.id)}
              onBranch={() => onBranch?.(message.id)}
              onEdit={() => onEdit?.(message.id)}
              onDelete={() => onDelete?.(message.id)}
              modelLabel={modelLabel}
            />
          </div>
        ))}
        {streamingContent && (
          <div className="flex justify-start mb-4">
            <div className="max-w-[88%] sm:max-w-[75%] px-4 py-3 rounded-2xl bg-transparent">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center animate-float">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
          <span className="text-sm font-medium" style={{ color: 'var(--fg-secondary)' }}>{modelLabel}</span>
              </div>
              <div className="text-[15px] leading-relaxed whitespace-pre-wrap streaming-cursor" style={{ color: 'var(--fg)' }}>{streamingContent}</div>
            </div>
          </div>
        )}
        {isLoading && !streamingContent && <TypingIndicator modelLabel={modelLabel} />}
        <div ref={bottomRef} className="h-2" />
      </div>
    </div>
  );
}
