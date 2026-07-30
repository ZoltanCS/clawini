'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/app/lib/supabase';
import { User } from '@supabase/supabase-js';

const SYSTEM_PROMPT_KEY = 'systemPrompt';
const DEFAULT_SYSTEM_PROMPT = 'Te egy segítőkész, barátságos AI asszisztens vagy, aki mindig magyarul válaszol. Légy pozitív, bátorító és támogató.';
const SELECTED_MODEL_KEY = 'selectedModel';
const SHOW_TOKEN_KEY = 'showTokenUsage';
const EXPORT_FORMAT_KEY = 'exportFormat';

const DEFAULT_MODEL_ID = 'meta/llama-3.1-70b-instruct';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export default function SettingsModal({ isOpen, onClose, user }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [isLoading, setIsLoading] = useState(false);

  const [settings, setSettings] = useState({
    fullName: '',
    theme: 'system' as 'light' | 'dark' | 'system',
    language: 'hu' as 'hu' | 'en',
    notifications: true,
    autoSave: true,
  });

  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [defaultModel, setDefaultModel] = useState(DEFAULT_MODEL_ID);
  const [showTokenUsage, setShowTokenUsage] = useState(false);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json' | 'clipboard'>('markdown');

  useEffect(() => {
    if (isOpen) {
      const savedPrompt = localStorage.getItem(SYSTEM_PROMPT_KEY);
      if (savedPrompt) setSystemPrompt(savedPrompt);

      const savedModel = localStorage.getItem(SELECTED_MODEL_KEY);
      if (savedModel) setDefaultModel(savedModel);

      const savedToken = localStorage.getItem(SHOW_TOKEN_KEY);
      if (savedToken) setShowTokenUsage(savedToken === 'true');

      const savedExport = localStorage.getItem(EXPORT_FORMAT_KEY);
      if (savedExport) setExportFormat(savedExport as any);
    }
    if (user) {
      loadUserProfile();
    }
  }, [user, isOpen]);

  const loadUserProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (data) {
      setSettings(prev => ({
        ...prev,
        fullName: data.full_name || '',
        theme: data.theme || 'system',
        language: data.language || 'hu',
        notifications: data.notifications ?? true,
        autoSave: data.auto_save ?? true,
      }));
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsLoading(true);
    localStorage.setItem(SYSTEM_PROMPT_KEY, systemPrompt);
    localStorage.setItem(SELECTED_MODEL_KEY, defaultModel);
    localStorage.setItem(SHOW_TOKEN_KEY, String(showTokenUsage));
    localStorage.setItem(EXPORT_FORMAT_KEY, exportFormat);

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: settings.fullName,
        theme: settings.theme,
        language: settings.language,
        notifications: settings.notifications,
        auto_save: settings.autoSave,
        updated_at: new Date().toISOString(),
      });
    setIsLoading(false);
    if (!error) onClose();
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Biztosan törölni szeretnéd a fiókodat? Ez nem visszavonható!')) return;
    await supabase.from('chats').delete().eq('user_id', user?.id);
    await supabase.auth.admin.deleteUser(user?.id || '');
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'general', label: 'Általános', icon: '\u2699' },
    { id: 'prompt', label: 'AI Prompt', icon: '\uD83E\uDDE0' },
    { id: 'account', label: 'Fiók', icon: '\uD83D\uDC64' },
    { id: 'appearance', label: 'Megjelenés', icon: '\uD83C\uDFA8' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
      <div className="rounded-3xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col glass-elevated glass-border-gradient" style={{ boxShadow: 'var(--glass-shadow-lg)' }}>
        <div className="flex justify-between items-center p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--fg)' }}>Beállítások</h2>
          <button onClick={onClose} className="p-2 rounded-full touch-active" style={{ color: 'var(--fg-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
          {/* Mobile tabs: scrollable row */}
          <div className="flex sm:flex-col gap-1 p-3 overflow-x-auto sm:overflow-y-auto sm:w-36 flex-shrink-0 scrollbar-none glass" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm whitespace-nowrap sm:whitespace-normal transition-all duration-200"
                style={{
                  background: activeTab === tab.id ? 'var(--accent-glass)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--accent)' : 'var(--fg-secondary)',
                }}
              >
                <span>{tab.icon}</span>
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 p-5 overflow-y-auto" style={{ color: 'var(--fg)' }}>
            {activeTab === 'general' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--fg-secondary)' }}>Alapértelmezett modell</label>
                  <div className="text-xs mb-2" style={{ color: 'var(--fg-muted)' }}>A modell választóban is módosítható</div>
                  <div className="px-3 py-2.5 rounded-2xl text-sm" style={{ background: 'var(--input-bg)', color: 'var(--fg)', border: '1px solid var(--border-subtle)' }}>
                    {defaultModel.split('/').pop() || defaultModel}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--fg)' }}>Token használat mutatása</div>
                    <div className="text-sm" style={{ color: 'var(--fg-muted)' }}>Token számláló megjelenítése alapból</div>
                  </div>
                  <button
                    onClick={() => setShowTokenUsage(!showTokenUsage)}
                    className={`w-12 h-6 rounded-full transition-colors ${showTokenUsage ? 'bg-blue-500' : ''}`}
                    style={{ background: showTokenUsage ? 'var(--accent)' : 'var(--border)' }}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${showTokenUsage ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>Export formátum</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'markdown' as const, label: 'Markdown' },
                      { value: 'json' as const, label: 'JSON' },
                      { value: 'clipboard' as const, label: 'Vágólap' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setExportFormat(opt.value)}
                        className="px-3 py-2 rounded-2xl text-sm font-medium transition-all duration-200"
                        style={{
                          border: exportFormat === opt.value ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                          background: exportFormat === opt.value ? 'var(--accent-glass)' : 'var(--input-bg)',
                          color: exportFormat === opt.value ? 'var(--accent)' : 'var(--fg-secondary)',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>Nyelv</label>
                  <select
                    value={settings.language}
                    onChange={(e) => setSettings({ ...settings, language: e.target.value as 'hu' | 'en' })}
                    className="w-full px-4 py-2.5 rounded-2xl text-base"
                    style={{ background: 'var(--input-bg)', color: 'var(--fg)', border: '1px solid var(--border-subtle)' }}
                  >
                    <option value="hu">Magyar</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--fg)' }}>Értesítések</div>
                    <div className="text-sm" style={{ color: 'var(--fg-muted)' }}>Kapj értesítést új üzenetekről</div>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, notifications: !settings.notifications })}
                    className={`w-12 h-6 rounded-full transition-colors`}
                    style={{ background: settings.notifications ? 'var(--accent)' : 'var(--border)' }}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${settings.notifications ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--fg)' }}>Automatikus mentés</div>
                    <div className="text-sm" style={{ color: 'var(--fg-muted)' }}>Beszélgetések automatikus mentése</div>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, autoSave: !settings.autoSave })}
                    className={`w-12 h-6 rounded-full transition-colors`}
                    style={{ background: settings.autoSave ? 'var(--accent)' : 'var(--border)' }}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${settings.autoSave ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'prompt' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>Rendszer prompt</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={8}
                    className="w-full px-4 py-2.5 rounded-2xl resize-none text-base"
                    style={{ background: 'var(--input-bg)', color: 'var(--fg)', border: '1px solid var(--border-subtle)' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>Az AI asszisztens személyiségét és viselkedését határozza meg. A promptba automatikusan bekerülnek: dátum, idő, időzóna, nap, hónap, év.</p>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>Teljes név</label>
                  <input
                    type="text" value={settings.fullName}
                    onChange={(e) => setSettings({ ...settings, fullName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-2xl text-base"
                    style={{ background: 'var(--input-bg)', color: 'var(--fg)', border: '1px solid var(--border-subtle)' }}
                    placeholder="Add meg a neved"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>Email</label>
                  <input type="email" value={user?.email || ''} disabled className="w-full px-4 py-2.5 rounded-2xl text-base" style={{ background: 'var(--input-bg)', color: 'var(--fg-muted)', border: '1px solid var(--border-subtle)' }} />
                </div>
                <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                  <h3 className="font-medium mb-2" style={{ color: 'var(--danger)' }}>Veszélyes zóna</h3>
                  <button onClick={handleDeleteAccount} className="px-4 py-2.5 rounded-2xl transition-all duration-200 hover-scale" style={{ border: '1px solid var(--danger)', color: 'var(--danger)' }}>Fiók törlése</button>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--fg-secondary)' }}>Téma</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['light', 'dark', 'system'] as const).map((theme) => (
                      <button
                        key={theme}
                        onClick={() => setSettings({ ...settings, theme })}
                        className="p-4 rounded-3xl text-center transition-all duration-200 glass-border-gradient"
                        style={{
                          background: settings.theme === theme ? 'var(--accent-glass)' : 'var(--input-bg)',
                          border: settings.theme === theme ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                          color: 'var(--fg)',
                        }}
                      >
                        <div className="text-2xl mb-1">{theme === 'light' ? '\u2600' : theme === 'dark' ? '\uD83C\uDF19' : '\uD83D\uDCBB'}</div>
                        <div className="text-sm font-medium">{theme === 'light' ? 'Világos' : theme === 'dark' ? 'Sötét' : 'Rendszer'}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8 flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2.5 font-medium rounded-2xl transition-all duration-200 glass-hover" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)', color: 'var(--fg-secondary)' }}>Mégsem</button>
              <button onClick={handleSave} disabled={isLoading} className="px-6 py-2.5 text-white font-medium rounded-2xl transition-all duration-200 disabled:opacity-50 hover-scale" style={{ background: 'linear-gradient(135deg, #007aff, #5856d6)', boxShadow: '0 4px 12px rgba(0,122,255,0.3)' }}>
                {isLoading ? 'Mentés...' : 'Mentés'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
