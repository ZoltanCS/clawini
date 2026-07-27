'use client';

import { useState } from 'react';
import { Message } from '@/app/types';

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: () => void;
  onBranch?: () => void;
  modelLabel?: string;
  highlighted?: boolean;
}

function CopyToast({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-white text-[11px] px-2.5 py-1 rounded-lg whitespace-nowrap copy-toast pointer-events-none" style={{ background: 'var(--surface-elevated)' }}>
      <svg className="w-3 h-3 inline-block mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path className="checkmark-path" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4.5 12.75l6 6 9-13.5" />
      </svg>
      Másolva
    </div>
  );
}

function HtmlPreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden" style={{ background: 'var(--surface-elevated)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--fg)' }}>HTML Preview</span>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--fg-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4" style={{ background: 'var(--surface)' }}>
          <iframe
            srcDoc={html}
            className="w-full h-full border-0"
            title="HTML Preview"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    </div>
  );
}

export default function MessageBubble({ message, onRegenerate, onBranch, modelLabel = 'AI', highlighted }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const extractHtmlBlocks = (content: string): string[] => {
    const blocks: string[] = [];
    const regex = /```html\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      blocks.push(match[1]);
    }
    return blocks;
  };

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

    formatted = formatted.replace(/^#### (.+)$/gm, '<h4 class="text-lg font-semibold mt-3 mb-2" style="color:var(--fg)">$1</h4>');
    formatted = formatted.replace(/^### (.+)$/gm, '<h3 class="text-xl font-semibold mt-4 mb-2" style="color:var(--fg)">$1</h3>');
    formatted = formatted.replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold mt-4 mb-3" style="color:var(--fg)">$1</h2>');
    formatted = formatted.replace(/^# (.+)$/gm, '<h1 class="text-3xl font-bold mt-4 mb-3" style="color:var(--fg)">$1</h1>');

    const tableRegex = /\|(.+)\|\n\|[-:\| ]+\|\n((?:\|.+\|\n?)+)/g;
    formatted = formatted.replace(tableRegex, (match, header, rows) => {
      const headers = header.split('|').map((h: string) => h.trim()).filter((h: string) => h);
      const rowData = rows.trim().split('\n').map((row: string) =>
        row.split('|').map((cell: string) => cell.trim()).filter((cell: string) => cell)
      );

      let tableHtml = '<div class="overflow-x-auto my-3"><table class="min-w-full border-collapse" style="border:1px solid var(--border)">';
      tableHtml += '<thead><tr style="background:var(--surface-hover)">';
      headers.forEach((h: string) => {
        tableHtml += `<th style="border:1px solid var(--border);padding:8px 12px;text-align:left;font-weight:600;color:var(--fg)">${h}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';

      rowData.forEach((row: string[]) => {
        tableHtml += '<tr>';
        row.forEach((cell: string) => {
          tableHtml += `<td style="border:1px solid var(--border);padding:8px 12px;color:var(--fg)">${cell}</td>`;
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table></div>';
      return tableHtml;
    });

    const htmlBlocks = extractHtmlBlocks(content);
    let blockIndex = 0;
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const isHtml = lang === 'html';
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const previewBtn = isHtml ? `<button onclick="this.parentElement.querySelector('.preview-frame').classList.toggle('hidden')" style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid var(--accent);color:var(--accent);background:transparent;cursor:pointer;margin-right:6px">Előnézet</button>` : '';
      const previewFrame = isHtml ? `<div class="hidden preview-frame" style="margin-top:8px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:white;max-height:400px"><iframe srcdoc="${encodeURIComponent(code)}" style="width:100%;height:300px;border:0" sandbox="allow-scripts"></iframe></div>` : '';
      return `<div style="position:relative">${previewBtn}<pre style="background:var(--surface-hover);padding:12px;border-radius:8px;overflow-x:auto;margin:12px 0;border:1px solid var(--border)"><code style="color:var(--fg);font-size:13px">${escaped}</code></pre>${previewFrame}</div>`;
    });

    formatted = formatted.replace(/`([^`]+)`/g, (match, code) => {
      return `<code style="background:var(--surface-hover);padding:1px 4px;border-radius:4px;font-size:13px;color:var(--fg)">${code}</code>`;
    });

    formatted = formatted.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');

    formatted = formatted.replace(/^\s*[-*+] (.+)$/gm, '<li style="margin-left:16px;color:var(--fg)">$1</li>');
    formatted = formatted.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="list-disc my-2">$&</ul>');
    formatted = formatted.replace(/^\s*\d+\. (.+)$/gm, '<li style="margin-left:16px;color:var(--fg)">$1</li>');
    formatted = formatted.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
      if (match.includes('<ul')) return match;
      return '<ol class="list-decimal my-2">' + match + '</ol>';
    });

    return formatted;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 group ${highlighted ? 'animate-highlight-branch rounded-2xl' : ''}`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <div
          className={`max-w-[88%] sm:max-w-[75%] px-4 py-3 rounded-2xl break-words overflow-hidden min-w-0 transition-shadow duration-200 ${
            isUser ? '' : ''
          }`}
          style={{
            background: isUser ? 'var(--bubble-user)' : 'var(--bubble-ai)',
            color: 'var(--fg)',
          }}
        >
          {!isUser && (
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0 animate-float">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="text-sm font-medium" style={{ color: 'var(--fg-secondary)' }}>{modelLabel}</span>
            </div>
          )}

          {imageUrls.length > 0 && (
            <div className={`mb-3 ${imageUrls.length > 1 ? 'grid grid-cols-2 gap-2' : ''}`}>
              {imageUrls.map((url, i) => (
                <div key={i} className="animate-scaleIn overflow-hidden rounded-lg">
                  <img
                    src={url}
                    alt={`Uploaded ${i + 1}`}
                    className="w-full max-h-64 object-cover cursor-pointer transition-all duration-200 hover:scale-105"
                    onClick={() => window.open(url, '_blank')}
                  />
                </div>
              ))}
            </div>
          )}

          {message.content && (
            <div
              className="text-[15px] leading-relaxed break-words"
              style={{ color: 'var(--fg)' }}
              dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
            />
          )}

          <div className={`flex items-center gap-1 mt-3 transition-all duration-200`} style={{ opacity: showActions || !isUser ? 1 : 0.6 }}>
            {!isUser && (
              <>
                {extractHtmlBlocks(message.content).length > 0 && (
                  <button
                    onClick={() => setPreviewHtml(message.content)}
                    className="p-1.5 rounded-full transition-all duration-150 hover-scale"
                    title="HTML előnézet"
                    style={{ color: 'var(--fg-muted)' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                )}
                <button className="p-1.5 rounded-full transition-all duration-150 hover-scale" title="Tetszik" style={{ color: 'var(--fg-muted)' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" />
                  </svg>
                </button>
                <button className="p-1.5 rounded-full transition-all duration-150 hover-scale" title="Nem tetszik" style={{ color: 'var(--fg-muted)' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.364 13.5c.215 0 .428-.045.628-.13a3 3 0 01.292 5.757A6.75 6.75 0 0012 21a6.75 6.75 0 00-6.284-3.873 3 3 0 01.292-5.757c.2.085.413.13.628.13A4.5 4.5 0 0112 7.5a4.5 4.5 0 015.364 6z" />
                  </svg>
                </button>
                <button
                  onClick={onRegenerate}
                  className="p-1.5 rounded-full transition-all duration-150 hover-scale"
                  title="Újragenerálás"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                </button>
                <button
                  onClick={onBranch}
                  className="p-1.5 rounded-full transition-all duration-150 hover-scale"
                  title="Branch - új chat innen"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                </button>
              </>
            )}
            <div className="relative">
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-full transition-all duration-150 hover-scale"
                title={copied ? 'Másolva!' : 'Másolás'}
                style={{ color: copied ? 'var(--success)' : 'var(--fg-muted)' }}
              >
                {copied ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                  </svg>
                )}
              </button>
              <CopyToast show={copied} />
            </div>
          </div>
        </div>
      </div>

      {previewHtml && (
        <HtmlPreviewModal
          html={extractHtmlBlocks(previewHtml).join('\n')}
          onClose={() => setPreviewHtml(null)}
        />
      )}
    </>
  );
}
