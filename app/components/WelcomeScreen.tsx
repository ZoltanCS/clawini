'use client';

import { Chat } from '@/app/types';

interface WelcomeScreenProps {
  onSuggestionClick: (suggestion: string) => void;
  currentChat: Chat | null;
}

const suggestions = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'Kreativ iras',
    description: 'Irj egy tortenetet vagy verset',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    title: 'Otleteles',
    description: 'Segits uj otletekben',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    title: 'Kodolas',
    description: 'Segitseg programozasban',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    title: 'Tanulas',
    description: 'Magyarázz el egy temat',
  },
];

export default function WelcomeScreen({ onSuggestionClick, currentChat }: WelcomeScreenProps) {
  if (currentChat) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 overflow-y-auto">
      <div className="mb-5">
        <svg viewBox="0 0 24 24" className="w-14 h-14 mx-auto">
          <path fill="#4285f4" d="M12 2L8 8l4 3-4 3 4 6 4-6-4-3 4-6z" />
        </svg>
      </div>

      <h1 className="text-2xl font-medium text-center text-gray-800 mb-1.5">
        Miben segithetek ma?
      </h1>
      <p className="text-gray-500 text-center mb-6 text-sm">
        Udvozlunk a Clawiniben!
      </p>

      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSuggestionClick(suggestion.description)}
            className="flex flex-col items-center gap-2 p-3.5 bg-white border border-gray-200 rounded-xl active:border-blue-400 active:shadow-md transition-all text-left touch-active"
          >
            <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600">
              {suggestion.icon}
            </div>
            <div className="text-center">
              <div className="font-medium text-gray-800 text-sm">{suggestion.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{suggestion.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}