'use client';

import { useState } from 'react';
import { Message } from '@/app/types';

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: () => void;
  onBranch?: () => void;
  modelLabel?: string;
}

export default function MessageBubble({ message, onRegenerate, onBranch, modelLabel = 'AI' }: MessageBubbleProps) {
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
        className={`max-w-[88%] sm:max-w-[75%] px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-gray-100 text-gray-800'
            : 'bg-transparent text-gray-800'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-600">{modelLabel}</span>
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
              <button className="p-1.5 rounded-full active:bg-gray-100" title="Tetszik">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" />
                </svg>
              </button>
              <button className="p-1.5 rounded-full active:bg-gray-100" title="Nem tetszik">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.364 13.5c.215 0 .428-.045.628-.13a3 3 0 01.292 5.757A6.75 6.75 0 0012 21a6.75 6.75 0 00-6.284-3.873 3 3 0 01.292-5.757c.2.085.413.13.628.13A4.5 4.5 0 0112 7.5a4.5 4.5 0 015.364 6z" />
                </svg>
              </button>
              <button 
                onClick={onRegenerate}
                className="p-1.5 rounded-full active:bg-gray-100"
                title="Újragenerálás"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
              </button>
              <button 
                onClick={onBranch}
                className="p-1.5 rounded-full active:bg-gray-100"
                title="Branch - új chat innen"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
              </button>
            </>
          )}
          <button 
            onClick={handleCopy}
            className="p-1.5 rounded-full active:bg-gray-100"
            title={copied ? 'Másolva!' : 'Másolás'}
          >
            {copied ? (
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
