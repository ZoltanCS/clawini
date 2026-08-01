'use client';

import { Chat } from '@/app/types';
import { User } from '@supabase/supabase-js';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chats: Chat[];
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onSettings: () => void;
}

export default function Sidebar({
  isOpen, onClose, chats, currentChatId,
  onSelectChat, onNewChat, onDeleteChat,
  user, onSignIn, onSignOut, onSettings,
}: SidebarProps) {
  if (!isOpen) return null;

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Ma';
    if (date.toDateString() === yesterday.toDateString()) return 'Tegnap';
    return date.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 animate-fadeIn" onClick={onClose} style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} />

      <aside className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[300px] flex flex-col animate-slideInLeft glass-elevated glass-border-gradient" style={{ borderRadius: '0 20px 20px 0' }}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--fg)' }}>Clawini</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full touch-active" style={{ color: 'var(--fg-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 text-left glass-hover"
            style={{ background: 'var(--input-bg)', color: 'var(--fg-secondary)', border: '1px solid var(--border-subtle)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--fg-secondary)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="font-medium">Új beszélgetés</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {chats.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
              Nincsenek korábbi beszélgetések
            </div>
          ) : (
            <div className="space-y-0.5">
              {chats.map((chat) => {
                const isSelected = currentChatId === chat.id;
                return (
                  <div
                    key={chat.id}
                    onClick={() => onSelectChat(chat.id)}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all duration-200"
                    style={{
                      background: isSelected ? 'var(--accent-glass)' : 'transparent',
                      color: isSelected ? 'var(--accent)' : 'var(--fg)',
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">{chat.title}</div>
                      <div className="text-xs" style={{ color: 'var(--fg-muted)' }}>{formatDate(chat.updated_at)}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                      className="p-1.5 opacity-0 group-hover:opacity-100 rounded-xl transition-all hover-scale"
                      style={{ color: 'var(--danger)' }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 space-y-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {user ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0" style={{ background: 'var(--glass-bg)', border: '1px solid var(--border-subtle)', color: 'var(--fg-secondary)' }}>
                {user.email?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--fg)' }}>{user.email}</div>
                <div className="text-xs" style={{ color: 'var(--success)' }}>Bejelentkezve</div>
              </div>
              <button onClick={onSettings} className="p-2 rounded-full touch-active hover-scale" title="Beállítások" style={{ color: 'var(--fg-secondary)' }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button onClick={onSignOut} className="p-2 rounded-full touch-active hover-scale" title="Kijelentkezés" style={{ color: 'var(--fg-secondary)' }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={onSignIn}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl transition-all duration-300 hover-scale"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)', color: 'var(--fg)' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              Bejelentkezés
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
