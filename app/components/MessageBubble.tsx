'use client';

import { useState } from 'react';
import { Message } from '@/app/types';

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: () => void;
  onBranch?: () => void;
}

export default function MessageBubble({ message, onRegenerate, onBranch }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const imageUrls: string[] = (() => {
    if (!message.image_url) return [];
    try {
      const parsed = JSON.parse(message.image_url);
      return Array.isArray(parsed) ? parsed : [message.image_url];
    } catch {
      return [message.image_url];
    }
  })();

  const formatContent = (content: string) => {
    let formatted = content;
    
    formatted = formatted.replace(/^#### (.+)$/gm, '<h4 class="text-lg font-semibold mt-3 mb-2">$1</h4>');
    formatted = formatted.replace(/^### (.+)$/gm, '<h3 class="text-xl font-semibold mt-4 mb-2">$1</h3>');
    formatted = formatted.replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold mt-4 mb-3">$1</h2>');
    formatted = formatted.replace(/^# (.+)$/gm, '<h1 class="text-3xl font-bold mt-4 mb-3">$1</h1>');
    
    const tableRegex = /\|(.+)\|\n\|[-:\| ]+\|\n((?:\|.+\|\n?)+)/g;
    formatted = formatted.replace(tableRegex, (match, header, rows) => {
      const headers = header.split('|').map((h: string) => h.trim()).filter((h: string) => h);
      const rowData = rows.trim().split('\n').map((row: string) => 
        row.split('|').map((cell: string) => cell.trim()).filter((cell: string) => cell)
      );
      
      let tableHtml = '<div class="overflow-x-auto my-3"><table class="min-w-full border-collapse border border-gray-300">';
      tableHtml += '<thead><tr class="bg-gray-100">';
      headers.forEach((h: string) => {
        tableHtml += `<th class="border border-gray-300 px-3 py-2 text-left font-semibold">${h}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';
      
      rowData.forEach((row: string[]) => {
        tableHtml += '<tr>';
        row.forEach((cell: string) => {
          tableHtml += `<td class="border border-gray-300 px-3 py-2">${cell}</td>`;
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table></div>';
      return tableHtml;
    });
    
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto my-3"><code>$2</code></pre>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>');
    formatted = formatted.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    formatted = formatted.replace(/^\s*[-*+] (.+)$/gm, '<li class="ml-4">$1</li>');
    formatted = formatted.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="list-disc my-2">$&</ul>');
    formatted = formatted.replace(/^\s*\d+\. (.+)$/gm, '<li class="ml-4">$1</li>');
    formatted = formatted.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
      if (match.includes('<ul')) return match;
      return '<ol class="list-decimal my-2">' + match + '</ol>';
    });
    
    formatted = formatted.replace(/\n/g, '<br/>');
    
    return formatted;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-gray-100 text-gray-800'
            : 'bg-transparent text-gray-800'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 relative">
              <svg viewBox="0 0 24 24" className="w-full h-full">
                <path fill="#4285f4" d="M12 2L8 8l4 3-4 3 4 6 4-6-4-3 4-6z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-600">Gemini</span>
          </div>
        )}
        
        {imageUrls.length > 0 && (
          <div className={`mb-3 ${imageUrls.length > 1 ? 'grid grid-cols-2 gap-2' : ''}`}>
            {imageUrls.map((url, i) => (
              <img 
                key={i}
                src={url} 
                alt={`Uploaded ${i + 1}`} 
                className="max-w-full max-h-64 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(url, '_blank')}
              />
            ))}
          </div>
        )}
        
        {message.content && (
          <div
            className="text-[15px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
          />
        )}
        
        <div className="flex items-center gap-1 mt-3">
          {!isUser && (
            <>
              <button className="p-1.5 touch-active rounded-full active:bg-gray-100 transition-colors" title="Tetszik">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
              </button>
              <button className="p-1.5 touch-active rounded-full active:bg-gray-100 transition-colors" title="Nem tetszik">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                </svg>
              </button>
              <button 
                onClick={onRegenerate}
                className="p-1.5 touch-active rounded-full active:bg-gray-100 transition-colors" 
                title="Ujrageneralas"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button 
                onClick={onBranch}
                className="p-1.5 touch-active rounded-full active:bg-gray-100 transition-colors" 
                title="Branch - uj chat innen"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </button>
            </>
          )}
          <button 
            onClick={handleCopy}
            className="p-1.5 touch-active rounded-full active:bg-gray-100 transition-colors" 
            title={copied ? "Masolva!" : "Masolas"}
          >
            {copied ? (
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}