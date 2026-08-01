'use client';

import { useState, useEffect } from 'react';
import { Chat } from '@/app/types';

interface WelcomeScreenProps {
  onSuggestionClick: (suggestion: string) => void;
  currentChat: Chat | null;
  userId?: string | null;
}

const DEFAULT_SUGGESTIONS = [
  'Szülinapi meglepetés ötletek',
  'Gyors vacsora recept',
  'Produktivitás tippek munkához',
  'Hétvégi program ötletek',
  'Új hobbi kipróbálása',
  'Reggeli rutin tervezés',
];

export default function WelcomeScreen({ onSuggestionClick, currentChat, userId }: WelcomeScreenProps) {
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);

  useEffect(() => {
    if (!userId || currentChat) return;
    fetch(`/api/suggestions?userId=${userId}`)
      .then(r => r.json())
      .then(data => {
        if (data.suggestions && data.suggestions.length > 0) {
          setSuggestions(data.suggestions);
        }
      })
      .catch(() => {});
  }, [userId, currentChat]);

  if (currentChat) return null;

  return (
    <div className="flex-1 flex flex-col justify-end px-4 pb-4 overflow-hidden">
      <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSuggestionClick(suggestion)}
            className="flex-shrink-0 snap-start w-[160px] p-3.5 rounded-2xl text-left transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div className="text-[12px] font-medium leading-snug" style={{ color: 'var(--fg)' }}>{suggestion}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
