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
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 overflow-y-auto relative">
      {/* Background glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div className="w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] rounded-full opacity-60 animate-orbPulse"
          style={{
            background: 'radial-gradient(circle, rgba(77,159,255,0.4) 0%, rgba(30,80,200,0.2) 40%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
      </div>

      {/* Orb */}
      <div className="relative mb-8 animate-slideUpFade">
        <div className="w-20 h-20 rounded-full flex items-center justify-center animate-orbFloat"
          style={{
            background: 'radial-gradient(circle at 30% 30%, rgba(120,180,255,0.9), rgba(40,100,220,0.8) 50%, rgba(20,60,160,0.9))',
            boxShadow: '0 0 60px rgba(77,159,255,0.5), 0 0 120px rgba(77,159,255,0.2), inset 0 -4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <svg className="w-9 h-9 text-white/90" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
      </div>

      <h1 className="text-2xl font-semibold text-center mb-1.5 animate-slideUpFade relative z-10" style={{ animationDelay: '0.1s', color: 'var(--fg)' }}>
        Miben segíthetek?
      </h1>
      <p className="text-center mb-10 text-sm animate-slideUpFade relative z-10" style={{ animationDelay: '0.15s', color: 'var(--fg-muted)' }}>
        Kérdezz bármit, vagy válassz az alábbiak közül
      </p>

      <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm relative z-10 stagger-children">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSuggestionClick(suggestion.description)}
            className="flex flex-col gap-1 p-3.5 rounded-2xl transition-all duration-300 text-left hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'var(--input-bg)',
              border: '1px solid var(--border-subtle)',
              backdropFilter: 'blur(12px)',
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
