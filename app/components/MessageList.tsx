'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Message } from '@/app/types';
import MessageBubble from './MessageBubble';
import { supabase } from '@/app/lib/supabase';

interface MessageListProps {
  chatId: string | null;
  isLoading: boolean;
  refreshKey?: number;
  onMessagesLoaded?: (messages: Message[]) => void;
  streamingContent?: string;
  thinkingContent?: string;
  isThinking?: boolean;
  devMode?: boolean;
  streamStats?: { ttft: number; tokensPerSec: number; elapsed: number } | null;
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
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
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

export default function MessageList({ chatId, isLoading, refreshKey = 0, onMessagesLoaded, streamingContent, thinkingContent, isThinking, devMode, streamStats, onRegenerate, onBranch, onEdit, onDelete, modelLabel = 'AI', regeneratingId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showJumpBtn, setShowJumpBtn] = useState(false);
  const prevChatId = useRef<string | null>(null);
  const prevMessageCount = useRef(0);
  const isNearBottom = useRef(true);
  const openedChatScrolledRef = useRef<string | null>(null);

  const handleRegenerate = useCallback((id: string) => onRegenerate?.(id), [onRegenerate]);
  const handleBranch = useCallback((id: string) => onBranch?.(id), [onBranch]);
  const handleEdit = useCallback((id: string) => onEdit?.(id), [onEdit]);
  const handleDelete = useCallback((id: string) => onDelete?.(id), [onDelete]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 150;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isNearBottom.current = near;
    setShowJumpBtn(!near);
  }, []);

  // When a chat is opened, jump straight to the latest messages
  useEffect(() => {
    if (!chatId || messages.length === 0) return;
    if (messages[0].chat_id !== chatId) return; // stale data from the previous chat
    if (openedChatScrolledRef.current === chatId) return;
    openedChatScrolledRef.current = chatId;
    bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, [chatId, messages]);

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
            // Dedupe: the same insert can arrive via realtime while a refresh fetch also includes it
            setMessages((prev) => prev.some(m => m.id === (payload.new as Message).id)
              ? prev.map(m => m.id === (payload.new as Message).id ? payload.new as Message : m)
              : [...prev, payload.new as Message]);
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
    // onMessagesLoaded intentionally not in deps: it should not trigger refetches
  }, [chatId, refreshKey]);

  useEffect(() => {
    prevMessageCount.current = messages.length;
  }, [messages]);

  const prevStreamingRef = useRef<string | undefined>(streamingContent);

  useEffect(() => {
    if (!isNearBottom.current) return;
    // On new messages, scroll immediately
    if (messages.length !== prevMessageCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return;
    }
    // On streaming, only scroll if content actually changed (debounced)
    if (streamingContent === prevStreamingRef.current && thinkingContent === undefined) return;
    prevStreamingRef.current = streamingContent;
    const el = bottomRef.current;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, streamingContent, thinkingContent]);

  if (!chatId) return null;

  if (isLoadingMessages) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-500 spinner" />
      </div>
    );
  }

  if (messages.length === 0) return null;

  // Hide the message currently being regenerated (it gets replaced once streaming finishes)
  const visibleMessages = regeneratingId ? messages.filter(m => m.id !== regeneratingId) : messages;

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={containerRef} onScroll={handleScroll} className="h-full overflow-y-auto px-3 py-3 scroll-smooth" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
      <div className="w-full max-w-3xl mx-auto">
        {visibleMessages.map((message) => (
          <div key={message.id} className="message-item animate-messageSlideIn">
            <MessageBubble 
              message={message}
              onRegenerate={() => handleRegenerate(message.id)}
              onBranch={() => handleBranch(message.id)}
              onEdit={() => handleEdit(message.id)}
              onDelete={() => handleDelete(message.id)}
              modelLabel={modelLabel}
            />
          </div>
        ))}
        {isThinking && isLoading && (
          <div className="flex justify-start mb-4">
            <div className="max-w-[88%] sm:max-w-[75%] px-4 py-3 rounded-2xl" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>Gondolkodás...</span>
                {!thinkingContent && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full typing-dot" />
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full typing-dot" />
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full typing-dot" />
                  </span>
                )}
                {devMode && streamStats && (
                  <span className="text-[11px] font-mono ml-1" style={{ color: 'var(--fg-muted)' }}>{streamStats.elapsed.toFixed(1)}s</span>
                )}
              </div>
              {thinkingContent && (
                <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--fg-muted)' }}>{thinkingContent}</div>
              )}
            </div>
          </div>
        )}
        {streamingContent && (
          <div className="flex justify-start mb-4">
            <div className="max-w-[88%] sm:max-w-[75%] px-4 py-3 rounded-2xl bg-transparent">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
          <span className="text-sm font-medium" style={{ color: 'var(--fg-secondary)' }}>{modelLabel}</span>
              </div>
              <div className="text-[15px] leading-relaxed whitespace-pre-wrap streaming-cursor" style={{ color: 'var(--fg)' }}>{streamingContent}</div>
              {devMode && streamStats && (
                <div className="flex items-center gap-3 mt-2 text-[11px] font-mono" style={{ color: 'var(--fg-muted)' }}>
                  <span>TTFT: {(streamStats.ttft / 1000).toFixed(2)}s</span>
                  <span>{streamStats.tokensPerSec.toFixed(0)} tok/s</span>
                </div>
              )}
            </div>
          </div>
        )}
        {isLoading && !streamingContent && !(isThinking && isLoading) && <TypingIndicator modelLabel={modelLabel} />}
        <div ref={bottomRef} className="h-2" />
      </div>
      {showJumpBtn && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center shadow-lg animate-fadeIn"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--fg-secondary)' }}
          title="Ugrás a legújabb üzenethez"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      )}
      </div>
    </div>
  );
}
