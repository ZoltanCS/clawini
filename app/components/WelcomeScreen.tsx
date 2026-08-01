'use client';

import { Chat } from '@/app/types';

interface WelcomeScreenProps {
  onSuggestionClick: (suggestion: string) => void;
  currentChat: Chat | null;
}

const suggestions = [
  { title: 'Szülinapi meglepetés', description: 'Adj ötleteket egy egyedi szülinapi bulihoz' },
  { title: 'Játékest tervezés', description: 'Tervezz egy olcsó és szórakoztató játékestét' },
  { title: 'Reggeli rutin', description: 'Készíts egy produktív reggeli rutint' },
  { title: 'Utazás tippek', description: 'Adj tippeket olcsó európai utazáshoz' },
  { title: 'Főzés segítség', description: 'Adj egy gyors vacsora receptet' },
  { title: 'Produktivitás', description: 'Hogyan legyek produktívabb a munkában' },
];

export default function WelcomeScreen({ onSuggestionClick, currentChat }: WelcomeScreenProps) {
  if (currentChat) return null;

  return (
    <div className="flex-1 flex flex-col justify-end px-4 pb-4 overflow-hidden">
      {/* Scrollable card strip at the bottom */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSuggestionClick(suggestion.description)}
            className="flex-shrink-0 snap-start w-[160px] p-3.5 rounded-2xl text-left transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div className="text-[12px] font-medium leading-snug mb-1" style={{ color: 'var(--fg)' }}>{suggestion.title}</div>
            <div className="text-[11px] leading-snug" style={{ color: 'var(--fg-muted)' }}>{suggestion.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
