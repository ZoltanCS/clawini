'use client';

import { Chat } from '@/app/types';

interface WelcomeScreenProps {
  onSuggestionClick: (suggestion: string) => void;
  currentChat: Chat | null;
}

const suggestions = [
  { title: 'Kreatív írás', description: 'Írj egy történetet' },
  { title: 'Kódolás', description: 'Segítség programozásban' },
  { title: 'Ötletelés', description: 'Brainstorm ötletek' },
  { title: 'Tanulás', description: 'Magyarázz el egy témát' },
];

export default function WelcomeScreen({ onSuggestionClick, currentChat }: WelcomeScreenProps) {
  if (currentChat) return null;

  return (
    <div className="flex-1 flex flex-col items-center justify-end px-4 pb-6 overflow-y-auto">
      <h1 className="text-xl font-medium text-center mb-6 animate-slideUpFade" style={{ color: 'var(--fg)' }}>
        Miben segíthetek?
      </h1>

      <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm stagger-children">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSuggestionClick(suggestion.description)}
            className="flex flex-col gap-1 p-3.5 rounded-2xl transition-all duration-200 text-left hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(20px) saturate(150%)',
              WebkitBackdropFilter: 'blur(20px) saturate(150%)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="font-medium text-[13px]" style={{ color: 'var(--fg)' }}>{suggestion.title}</div>
            <div className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>{suggestion.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
