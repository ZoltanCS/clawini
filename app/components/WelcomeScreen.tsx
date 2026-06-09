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
    title: 'Kreatív írás',
    description: 'Írj egy történetet vagy verset',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    title: 'Ötletelés',
    description: 'Segíts új ötletekben',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    title: 'Kódolás',
    description: 'Segítség programozásban',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    title: 'Tanulás',
    description: 'Magyarázz el egy témát',
  },
];

export default function WelcomeScreen({ onSuggestionClick, currentChat }: WelcomeScreenProps) {
  // Only show welcome screen when there's no active chat
  if (currentChat) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 overflow-y-auto">
      {/* Logo */}
      <div className="mb-6">
        <svg viewBox="0 0 24 24" className="w-12 h-12 mx-auto">
          <path fill="#4285f4" d="M12 2L8 8l4 3-4 3 4 6 4-6-4-3 4-6z" />
        </svg>
      </div>

      {/* Welcome text */}
      <h1 className="text-3xl sm:text-4xl font-normal text-center text-gray-800 mb-2">
        Miben segíthetek ma?
      </h1>
      <p className="text-gray-500 text-center mb-8">
        Üdvözöljük a Gemini Chatben!
      </p>

      {/* Suggestions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSuggestionClick(suggestion.description)}
            className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all text-left group"
          >
            <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
              {suggestion.icon}
            </div>
            <div>
              <div className="font-medium text-gray-800 text-sm">{suggestion.title}</div>
              <div className="text-xs text-gray-500">{suggestion.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
