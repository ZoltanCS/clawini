'use client';

import { useState, useMemo } from 'react';
import { Message } from '@/app/types';

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: () => void;
  onBranch?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  modelLabel?: string;
  highlighted?: boolean;
}

interface ContentSegment {
  type: 'text' | 'code';
  language?: string;
  content: string;
}

function CopyToast({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-white text-[11px] px-2.5 py-1 rounded-xl whitespace-nowrap copy-toast pointer-events-none glass-elevated" style={{ color: 'var(--fg)' }}>
      <svg className="w-3 h-3 inline-block mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path className="checkmark-path" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4.5 12.75l6 6 9-13.5" />
      </svg>
      Másolva
    </div>
  );
}

function HtmlPreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#000' }}>
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--fg)' }}>Előnézet</span>
        <button onClick={onClose} className="p-2 rounded-xl" style={{ color: 'var(--fg-muted)', background: 'rgba(255,255,255,0.05)' }}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <iframe
          srcDoc={html}
          className="w-full h-full border-0"
          title="HTML Preview"
          sandbox="allow-scripts"
          style={{ background: 'white' }}
        />
      </div>
    </div>
  );
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const isHtml = language === 'html';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div style={{ margin: '12px 0', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between px-3 py-1.5 glass" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <span className="text-[11px] font-mono" style={{ color: 'var(--fg-muted)' }}>{language || 'code'}</span>
          <div className="flex items-center gap-1">
            {isHtml && (
              <button
                onClick={() => setShowHtmlPreview(true)}
                className="text-[11px] px-2 py-0.5 rounded transition-colors"
                style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}
              >
                Előnézet
              </button>
            )}
            <button onClick={handleCopy} className="p-1 rounded transition-colors" style={{ color: 'var(--fg-muted)' }}>
              {copied ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed" style={{ background: 'var(--surface-hover)', color: 'var(--fg)' }}><code>{code}</code></pre>
      </div>
      {showHtmlPreview && (
        <HtmlPreviewModal
          html={code}
          onClose={() => setShowHtmlPreview(false)}
        />
      )}
    </>
  );
}

function TextContent({ html }: { html: string }) {
  return <div className="text-[15px] leading-relaxed break-words" style={{ color: 'var(--fg)' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function parseContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', language: match[1] || undefined, content: match[2] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return segments;
}

function formatInlineMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-lg font-semibold mt-3 mb-2" style="color:var(--fg)">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-xl font-semibold mt-4 mb-2" style="color:var(--fg)">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold mt-4 mb-3" style="color:var(--fg)">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-3xl font-bold mt-4 mb-3" style="color:var(--fg)">$1</h1>');

  const tableRegex = /\|(.+)\|\n\|[-:\| ]+\|\n((?:\|.+\|\n?)+)/g;
  html = html.replace(tableRegex, (match, header, rows) => {
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

  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  html = html.replace(/`([^`]+)`/g, (match, code) => {
    return `<code style="background:var(--surface-hover);padding:1px 4px;border-radius:4px;font-size:13px;color:var(--fg)">${code}</code>`;
  });

  html = html.replace(/^\s*[-*+] (.+)$/gm, '<li style="margin-left:16px;color:var(--fg)">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="list-disc my-2">$&</ul>');
  html = html.replace(/^\s*\d+\. (.+)$/gm, '<li style="margin-left:16px;color:var(--fg)">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
    if (match.includes('<ul')) return match;
    return '<ol class="list-decimal my-2">' + match + '</ol>';
  });

  html = html.replace(/\n/g, '<br/>');
  return html;
}

export default function MessageBubble({ message, onRegenerate, onBranch, onEdit, onDelete, modelLabel = 'AI', highlighted }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [fullHtmlPreview, setFullHtmlPreview] = useState<string | null>(null);
  const [thinkingOpen, setThinkingOpen] = useState(false);

  const thinkingMatch = !isUser ? message.content?.match(/^「thinking」\n([\s\S]*?)\n「\/thinking」\n\n([\s\S]*)$/) : null;
  const thinkingText = thinkingMatch?.[1]?.trim() || '';
  const cleanContent = thinkingMatch?.[2] ?? message.content;

  const segments = useMemo(() => parseContent(cleanContent || ''), [cleanContent]);
  const hasHtml = useMemo(() => segments.some(s => s.type === 'code' && s.language === 'html'), [segments]);

  const imageUrls: string[] = (() => {
    if (!message.image_url) return [];
    try {
      const parsed = JSON.parse(message.image_url);
      return Array.isArray(parsed) ? parsed : [message.image_url];
    } catch {
      return [message.image_url];
    }
  })();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(cleanContent || message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFullPreview = () => {
    const allHtml = segments
      .filter(s => s.type === 'code' && s.language === 'html')
      .map(s => s.content)
      .join('\n');
    setFullHtmlPreview(allHtml);
  };

  return (
    <>
      <div
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 group ${highlighted ? 'animate-highlight-branch rounded-2xl' : ''}`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <div
          className={`max-w-[88%] sm:max-w-[75%] px-4 py-3 rounded-3xl break-words overflow-hidden min-w-0 transition-all duration-200`}
          style={{
            background: isUser ? 'var(--bubble-user)' : 'var(--bubble-ai)',
            backdropFilter: 'blur(16px) saturate(150%)',
            WebkitBackdropFilter: 'blur(16px) saturate(150%)',
            border: isUser ? '1px solid var(--border-subtle)' : undefined,
            color: 'var(--fg)',
          }}
        >


          {thinkingText && (
            <div className="mb-3 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setThinkingOpen(!thinkingOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors"
                style={{ background: 'var(--surface-hover)' }}
              >
                <div className="flex items-center gap-2">
                  <svg className={`w-4 h-4 transition-transform duration-200 ${thinkingOpen ? 'rotate-90' : ''}`} style={{ color: 'var(--fg-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  <span className="text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>Gondolkodás</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{thinkingOpen ? 'Elrejtés' : 'Megnyitás'}</span>
              </button>
              {thinkingOpen && (
                <div className="px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--fg-muted)', background: 'var(--input-bg)' }}>
                  {thinkingText}
                </div>
              )}
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

          {cleanContent && (
            <div>
              {segments.map((segment, i) =>
                segment.type === 'code' ? (
                  <CodeBlock key={i} code={segment.content} language={segment.language} />
                ) : (
                  <TextContent key={i} html={formatInlineMarkdown(segment.content)} />
                )
              )}
            </div>
          )}

          <div className="flex items-center gap-0.5 mt-2 transition-all duration-200" style={{ opacity: showActions ? 0.7 : 0 }}>
            {isUser ? (
              <>
                <button
                  onClick={onEdit}
                  className="p-1 rounded-full transition-all duration-150"
                  title="Szerkesztés"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
                <button
                  onClick={onDelete}
                  className="p-1 rounded-full transition-all duration-150"
                  title="Törlés"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                {hasHtml && (
                  <button
                    onClick={handleFullPreview}
                    className="p-1 rounded-full transition-all duration-150"
                    title="HTML előnézet"
                    style={{ color: 'var(--fg-muted)' }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={onRegenerate}
                  className="p-1 rounded-full transition-all duration-150"
                  title="Újragenerálás"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                </button>
                <button
                  onClick={onBranch}
                  className="p-1 rounded-full transition-all duration-150"
                  title="Branch - új chat innen"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                </button>
              </>
            )}
            <div className="relative">
              <button
                onClick={handleCopy}
                className="p-1 rounded-full transition-all duration-150"
                title={copied ? 'Másolva!' : 'Másolás'}
                style={{ color: copied ? 'var(--success)' : 'var(--fg-muted)' }}
              >
                {copied ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                  </svg>
                )}
              </button>
              <CopyToast show={copied} />
            </div>
          </div>
        </div>
      </div>

      {fullHtmlPreview && (
        <HtmlPreviewModal
          html={fullHtmlPreview}
          onClose={() => setFullHtmlPreview(null)}
        />
      )}
    </>
  );
}
