'use client';

import { Chat } from '@/app/types';

interface WelcomeScreenProps {
  onSuggestionClick: (suggestion: string) => void;
  currentChat: Chat | null;
}

const suggestions = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    ),
    title: 'Kreatív írás',
    description: 'Írj egy történetet vagy verset',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
    ),
    title: 'Ötletelés',
    description: 'Segíts új ötletekben',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
    title: 'Kódolás',
    description: 'Segítség programozásban',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
    title: 'Tanulás',
    description: 'Magyarázz el egy témát',
  },
];

export default function WelcomeScreen({ onSuggestionClick, currentChat }: WelcomeScreenProps) {
  if (currentChat) return null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 overflow-y-auto">
      <div className="mb-6 animate-slideUpFade">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-200 animate-float">
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
      </div>

      <h1 className="text-2xl font-semibold text-center text-gray-800 mb-1.5 animate-slideUpFade" style={{ animationDelay: '0.1s' }}>
        Miben segíthetek ma?
      </h1>
      <p className="text-gray-500 text-center mb-8 text-sm animate-slideUpFade" style={{ animationDelay: '0.15s' }}>
        Válassz egy modellt a fejlécből, és indíts beszélgetést
      </p>

      <div className="grid grid-cols-2 gap-3 w-full max-w-md stagger-children">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSuggestionClick(suggestion.description)}
            className="flex flex-col items-center gap-2.5 p-4 bg-white border border-gray-200 rounded-xl active:border-blue-400 active:shadow-md transition-all duration-150 text-center hover:shadow-lg hover:border-gray-300 hover-scale"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 transition-transform duration-200 group-hover:scale-110">
              {suggestion.icon}
            </div>
            <div>
              <div className="font-medium text-gray-800 text-sm">{suggestion.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{suggestion.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
