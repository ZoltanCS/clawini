'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/app/lib/supabase';
import { User } from '@supabase/supabase-js';
import { ResponseStat, ChatParams } from '@/app/components/ChatInterface';
import { NimModel } from '@/app/lib/nim-models';

const SYSTEM_PROMPT_KEY = 'systemPrompt';
const DEFAULT_SYSTEM_PROMPT = 'Te egy segítőkész, barátságos AI asszisztens vagy, aki mindig magyarul válaszol. Légy pozitív, bátorító és támogató.';
const SELECTED_MODEL_KEY = 'selectedModel';
const SHOW_TOKEN_KEY = 'showTokenUsage';
const EXPORT_FORMAT_KEY = 'exportFormat';
const DEV_MODE_KEY = 'devMode';
const MODELS_CACHE_KEY = 'nimModelsCache';

const DEFAULT_MODEL_ID = 'minimaxai/minimax-m3';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  devMode: boolean;
  responseHistory: ResponseStat[];
  models: NimModel[];
  chatParams: ChatParams;
  onChatParamsChange: (next: ChatParams) => void;
}

export default function SettingsModal({ isOpen, onClose, user, devMode, responseHistory, models, chatParams, onChatParamsChange }: SettingsModalProps) {
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
  const [memories, setMemories] = useState<{id: string; content: string}[]>([]);
  const [quickTopics, setQuickTopics] = useState<{id: string; topic: string}[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [cacheSize, setCacheSize] = useState<number | null>(null);

  const [catalogJson, setCatalogJson] = useState('');
  const [catalogSaved, setCatalogSaved] = useState(false);
  const [debugResult, setDebugResult] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [localData, setLocalData] = useState<{ key: string; value: string }[]>([]);
  const [expandedStats, setExpandedStats] = useState<Set<string>>(new Set());
  const [nimCatalog, setNimCatalog] = useState<string[]>([]);
  const [nimCatalogLoading, setNimCatalogLoading] = useState(false);
  const [nimCatalogError, setNimCatalogError] = useState<string | null>(null);
  const [selectedNimModels, setSelectedNimModels] = useState<Set<string>>(new Set());
  const [nimSearch, setNimSearch] = useState('');
  const [catalogAdded, setCatalogAdded] = useState(false);

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

      // Check if already installed
      if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
        setIsInstalled(true);
      }
    }
    if (user) {
      loadUserProfile();
    }
  }, [user, isOpen]);

  // PWA install prompt listener (global, not dependent on modal open)
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstalled(false);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

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

  // Load memories and topics when memory tab opens
  useEffect(() => {
    if (isOpen && activeTab === 'memory' && user) {
      supabase.from('memories').select('id, content').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => {
        if (data) setMemories(data);
      });
      supabase.from('quick_topics').select('id, topic').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => {
        if (data) setQuickTopics(data);
      });
    }
  }, [isOpen, activeTab, user]);

  // Load cache size when download tab opens
  useEffect(() => {
    if (isOpen && activeTab === 'download' && 'caches' in window) {
      (async () => {
        try {
          const cacheNames = await caches.keys();
          let totalSize = 0;
          for (const name of cacheNames) {
            const cache = await caches.open(name);
            const keys = await cache.keys();
            for (const request of keys) {
              const response = await cache.match(request);
              if (response) {
                const blob = await response.blob();
                totalSize += blob.size;
              }
            }
          }
          setCacheSize(totalSize);
        } catch {
          setCacheSize(null);
        }
      })();
    }
  }, [isOpen, activeTab]);

  const handleDeleteMemory = async (id: string) => {
    await supabase.from('memories').delete().eq('id', id);
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const handleDeleteTopic = async (id: string) => {
    await supabase.from('quick_topics').delete().eq('id', id);
    setQuickTopics(prev => prev.filter(t => t.id !== id));
  };

  const handleAddTopic = async () => {
    if (!newTopic.trim() || !user) return;
    const { data, error } = await supabase.from('quick_topics').insert({ user_id: user.id, topic: newTopic.trim() }).select().single();
    if (error) {
      alert(`Nem sikerült hozzáadni a témát: ${error.message}`);
      return;
    }
    if (data) setQuickTopics(prev => [data, ...prev]);
    setNewTopic('');
  };

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleRefreshCache = async () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        window.location.reload();
      }
    }
  };

  const handleClearCache = async () => {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      setCacheSize(0);
      alert('Cache törölve!');
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsLoading(true);
    localStorage.setItem(SYSTEM_PROMPT_KEY, systemPrompt);
    localStorage.setItem(SELECTED_MODEL_KEY, defaultModel);
    localStorage.setItem(SHOW_TOKEN_KEY, String(showTokenUsage));
    localStorage.setItem(EXPORT_FORMAT_KEY, exportFormat);
    localStorage.setItem(DEV_MODE_KEY, String(devMode));

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
    if (!user) return;
    if (!confirm('Biztosan törölni szeretnéd a fiókodat? Ez nem visszavonható!')) return;
    setIsLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data.error) alert(`Fiók törlése részben sikerült: ${data.error}`);
    } catch {
      alert('Hiba történt a fiók törlése közben');
    }
    setIsLoading(false);
    await supabase.auth.signOut();
    onClose();
    window.location.reload();
  };

  const handleThemeSelect = (theme: 'light' | 'dark' | 'system') => {
    setSettings({ ...settings, theme });
    // Apply immediately: ChatInterface listens for this event and reads localStorage
    localStorage.setItem('theme', theme);
    window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }));
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'general', label: 'Általános', icon: '\u2699' },
    { id: 'prompt', label: 'AI Prompt', icon: '\uD83E\uDDE0' },
    { id: 'memory', label: 'Memória', icon: '\uD83E\uDDE0' },
    { id: 'download', label: 'Letöltés', icon: '\uD83D\uDCE5' },
    { id: 'account', label: 'Fiók', icon: '\uD83D\uDC64' },
    { id: 'appearance', label: 'Megjelenés', icon: '\uD83C\uDFA8' },
    { id: 'dev', label: 'Dev', icon: '\uD83D\uDD27' },
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

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--fg)' }}>Fejlesztői mód</div>
                    <div className="text-sm" style={{ color: 'var(--fg-muted)' }}>Extra modellek a választóban + teljesítmény statisztikák (TTFT, tok/s)</div>
                  </div>
                  <button
                    onClick={() => { const v = !devMode; localStorage.setItem(DEV_MODE_KEY, String(v)); window.dispatchEvent(new CustomEvent('dev-mode-change', { detail: v })); }}
                    className={`w-12 h-6 rounded-full transition-colors`}
                    style={{ background: devMode ? 'var(--accent)' : 'var(--border)' }}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${devMode ? 'translate-x-6' : 'translate-x-1'}`} />
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
                        onClick={() => handleThemeSelect(theme)}
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

            {activeTab === 'memory' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>Quick kártya témák</label>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={newTopic}
                      onChange={(e) => setNewTopic(e.target.value)}
                      placeholder="Pl. fitness tippek, receptek..."
                      className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--input-bg)', color: 'var(--fg)', border: '1px solid var(--border-subtle)' }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddTopic(); }}
                    />
                    <button onClick={handleAddTopic} className="px-3 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--accent-glass)', color: 'var(--accent)' }}>
                      Hozzáadás
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {quickTopics.map((topic) => (
                      <div key={topic.id} className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: 'var(--input-bg)' }}>
                        <span className="text-sm" style={{ color: 'var(--fg)' }}>{topic.topic}</span>
                        <button onClick={() => handleDeleteTopic(topic.id)} className="p-1 rounded-lg" style={{ color: 'var(--fg-muted)' }}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--fg-secondary)' }}>Memóriák (automatikus)</label>
                  {memories.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>Még nincsenek memóriák. Chatelj, és automatikusan megjegyzi a fontos dolgokat.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {memories.map((mem) => (
                        <div key={mem.id} className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: 'var(--input-bg)' }}>
                          <span className="text-sm" style={{ color: 'var(--fg)' }}>{mem.content}</span>
                          <button onClick={() => handleDeleteMemory(mem.id)} className="p-1 rounded-lg" style={{ color: 'var(--fg-muted)' }}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'download' && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>Alkalmazás telepítése</h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--fg-muted)' }}>
                    Telepítsd a Clawini-t a készülékedre, hogy offline is használhasd és gyorsabban betöltődjön.
                  </p>
                  {isInstalled ? (
                    <div className="px-4 py-3 rounded-2xl" style={{ background: 'var(--success-bg)', border: '1px solid var(--success)', color: 'var(--success)' }}>
                      ✓ Az alkalmazás telepítve van
                    </div>
                  ) : deferredPrompt ? (
                    <button onClick={handleInstallPWA} className="px-6 py-3 rounded-2xl font-medium transition-all duration-200 hover-scale" style={{ background: 'linear-gradient(135deg, #007aff, #5856d6)', color: 'white', boxShadow: '0 4px 12px rgba(0,122,255,0.3)' }}>
                      📥 Telepítés most
                    </button>
                  ) : (
                    <div className="px-4 py-3 rounded-2xl text-sm" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)', color: 'var(--fg-muted)' }}>
                      A telepítés nem elérhető ezen a platformon vagy már telepítve van.
                    </div>
                  )}
                </div>

                <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                  <h3 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>Offline cache</h3>
                  <p className="text-sm mb-3" style={{ color: 'var(--fg-muted)' }}>
                    Az alkalmazás fájljai tárolva vannak a készülékeden az offline működéshez.
                  </p>
                  {cacheSize !== null && (
                    <div className="text-sm mb-3" style={{ color: 'var(--fg-secondary)' }}>
                      Cache mérete: <strong>{(cacheSize / 1024 / 1024).toFixed(2)} MB</strong>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={handleRefreshCache} className="px-4 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200" style={{ background: 'var(--accent-glass)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
                      🔄 Cache frissítése
                    </button>
                    <button onClick={handleClearCache} className="px-4 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200" style={{ background: 'var(--input-bg)', color: 'var(--fg-secondary)', border: '1px solid var(--border-subtle)' }}>
                      🗑️ Cache törlése
                    </button>
                  </div>
                </div>

                <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                  <h3 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>Offline státusz</h3>
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)' }}>
                    <div className={`w-3 h-3 rounded-full ${navigator.onLine ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-sm" style={{ color: 'var(--fg)' }}>
                      {navigator.onLine ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'dev' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-medium mb-1" style={{ color: 'var(--fg)' }}>Fejlesztői mód</h3>
                  <div className="flex items-center justify-between">
                    <div className="text-sm" style={{ color: 'var(--fg-muted)' }}>Extra modellek + statisztikák a chatben</div>
                    <button
                      onClick={() => { const v = !devMode; localStorage.setItem(DEV_MODE_KEY, String(v)); window.dispatchEvent(new CustomEvent('dev-mode-change', { detail: v })); }}
                      className={`w-12 h-6 rounded-full transition-colors`}
                      style={{ background: devMode ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${devMode ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--fg-muted)' }}>A váltás a bezárás után azonnal hat (oldal újratöltés nélkül).</p>
                </div>

                <div>
                  <h3 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>Válasz előzmények ({responseHistory.length})</h3>
                  {responseHistory.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>Még nincs rögzített válasz. Küldj egy üzenetet, és a statisztikák itt is megmaradnak.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {responseHistory.map((r) => (
                        <div key={r.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)' }}>
                          <button
                            onClick={() => setExpandedStats(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.error ? '' : ''}`} style={{ background: r.error ? 'var(--danger)' : r.aborted ? '#f59e0b' : 'var(--success)' }} />
                              <span className="text-sm truncate" style={{ color: 'var(--fg)' }}>{r.model.split('/').pop()}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[11px] font-mono" style={{ color: 'var(--fg-muted)' }}>{new Date(r.timestamp).toLocaleTimeString('hu-HU')}</span>
                              <span className="text-[11px] font-mono" style={{ color: 'var(--fg-muted)' }}>{r.ttft ? `${(r.ttft / 1000).toFixed(2)}s` : '—'}</span>
                              <span className="text-[11px] font-mono" style={{ color: 'var(--fg-muted)' }}>{r.tokensPerSec.toFixed(0)} t/s</span>
                            </div>
                          </button>
                          {expandedStats.has(r.id) && (
                            <div className="px-3 pb-2.5 text-[11px] font-mono space-y-0.5" style={{ color: 'var(--fg-muted)', background: 'var(--surface-hover)' }}>
                              <div>Modell: {r.model}</div>
                              <div>Időpont: {new Date(r.timestamp).toLocaleString('hu-HU')}</div>
                              <div>TTFT: {(r.ttft / 1000).toFixed(2)}s | Teljes idő: {r.elapsed.toFixed(2)}s</div>
                              <div>Tokenek: {r.tokens} (becsült: {Math.round(r.chars / 4)} | karakter: {r.chars})</div>
                              <div>Sebesség: {r.tokensPerSec.toFixed(1)} tok/s</div>
                              {r.fallbackModel && <div>Fallback modell: {r.fallbackModel}</div>}
                              {r.compacted && <div style={{ color: 'var(--accent)' }}>Kompaktálva: {r.compacted.messages} üzenet / {r.compacted.tokens} tok (Kimi összefoglaló)</div>}
                              {r.aborted && <div>Állapot: megszakítva</div>}
                              {r.error && <div style={{ color: 'var(--danger)' }}>Hiba: {r.error}</div>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>API paraméterek</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-secondary)' }}>Temperature ({chatParams.temperature})</label>
                      <input type="range" min={0} max={2} step={0.1} value={chatParams.temperature}
                        onChange={(e) => onChatParamsChange({ ...chatParams, temperature: Number(e.target.value) })}
                        className="w-full" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-secondary)' }}>Top P ({chatParams.topP})</label>
                      <input type="range" min={0} max={1} step={0.05} value={chatParams.topP}
                        onChange={(e) => onChatParamsChange({ ...chatParams, topP: Number(e.target.value) })}
                        className="w-full" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-secondary)' }}>Max token ({chatParams.maxTokens})</label>
                      <input type="range" min={256} max={8192} step={256} value={chatParams.maxTokens}
                        onChange={(e) => onChatParamsChange({ ...chatParams, maxTokens: Number(e.target.value) })}
                        className="w-full" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-secondary)' }}>Frequency penalty ({chatParams.frequencyPenalty})</label>
                      <input type="range" min={-2} max={2} step={0.1} value={chatParams.frequencyPenalty}
                        onChange={(e) => onChatParamsChange({ ...chatParams, frequencyPenalty: Number(e.target.value) })}
                        className="w-full" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--fg-secondary)' }}>Reasoning effort (gondolkodó modelleknél)</label>
                    <select
                      value={chatParams.reasoningEffort}
                      onChange={(e) => onChatParamsChange({ ...chatParams, reasoningEffort: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-xl text-sm"
                      style={{ background: 'var(--input-bg)', color: 'var(--fg)', border: '1px solid var(--border-subtle)' }}
                    >
                      <option value="high">high</option>
                      <option value="medium">medium</option>
                      <option value="low">low</option>
                    </select>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>Modell katalógus</h3>
                  <div className="text-xs mb-2" style={{ color: 'var(--fg-muted)' }}>Szerkeszd a modellek listáját (JSON). Mentés után a választó frissül.</div>
                  <textarea
                    value={catalogJson}
                    onChange={(e) => { setCatalogJson(e.target.value); setCatalogSaved(false); }}
                    rows={10}
                    spellCheck={false}
                    className="w-full px-3 py-2.5 rounded-2xl resize-none text-[11px] font-mono"
                    style={{ background: 'var(--input-bg)', color: 'var(--fg)', border: '1px solid var(--border-subtle)' }}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setCatalogJson(JSON.stringify(models, null, 2))}
                      className="px-3 py-2 rounded-xl text-xs font-medium" style={{ background: 'var(--input-bg)', color: 'var(--fg-secondary)', border: '1px solid var(--border-subtle)' }}
                    >
                      Aktuális betöltése
                    </button>
                    <button
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(catalogJson);
                          if (!Array.isArray(parsed)) throw new Error('tömb kell');
                          localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ models: parsed, timestamp: Date.now() }));
                          window.dispatchEvent(new CustomEvent('models-cache-updated'));
                          setCatalogSaved(true);
                          setTimeout(() => setCatalogSaved(false), 2000);
                        } catch (err: any) {
                          alert(`Érvénytelen JSON: ${err.message}`);
                        }
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-medium" style={{ background: 'var(--accent-glass)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                    >
                      {catalogSaved ? 'Mentve!' : 'Mentés'}
                    </button>
                  </div>

                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={async () => {
                          setNimCatalogLoading(true);
                          setNimCatalogError(null);
                          try {
                            const res = await fetch('/api/debug');
                            const data = await res.json();
                            if (data.nimModels && Array.isArray(data.nimModels)) {
                              setNimCatalog(data.nimModels);
                              setSelectedNimModels(new Set());
                            } else {
                              setNimCatalog([]);
                              setNimCatalogError(data.nimError || 'Nem sikerült lekérni a modelleket');
                            }
                          } catch (e: any) {
                            setNimCatalogError(e?.message || 'Hálózati hiba');
                          }
                          setNimCatalogLoading(false);
                        }}
                        disabled={nimCatalogLoading}
                        className="px-3 py-2 rounded-xl text-xs font-medium disabled:opacity-50" style={{ background: 'var(--accent-glass)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                      >
                        {nimCatalogLoading ? 'Betöltés...' : (nimCatalog.length > 0 ? 'Újra listázás' : 'Elérhető modellek az API-ból')}
                      </button>
                      {nimCatalog.length > 0 && (
                        <>
                          <input
                            value={nimSearch}
                            onChange={(e) => setNimSearch(e.target.value)}
                            placeholder="Keresés..."
                            className="flex-1 min-w-0 px-3 py-2 rounded-xl text-xs"
                            style={{ background: 'var(--input-bg)', color: 'var(--fg)', border: '1px solid var(--border-subtle)' }}
                          />
                          <button
                            onClick={() => {
                              const existingIds = new Set((JSON.parse(catalogJson || '[]') || []).map((m: any) => m.id).filter(Boolean));
                              const filtered = nimCatalog.filter(id => id.toLowerCase().includes(nimSearch.toLowerCase()));
                              if (filtered.length > 0 && filtered.every(id => selectedNimModels.has(id))) {
                                setSelectedNimModels(new Set());
                              } else {
                                setSelectedNimModels(new Set(filtered));
                              }
                            }}
                            className="px-3 py-2 rounded-xl text-xs font-medium" style={{ background: 'var(--input-bg)', color: 'var(--fg-secondary)', border: '1px solid var(--border-subtle)' }}
                          >
                            Összes jelölése
                          </button>
                        </>
                      )}
                    </div>
                    {nimCatalogError && (
                      <div className="text-xs mb-2" style={{ color: 'var(--danger)' }}>Hiba: {nimCatalogError}</div>
                    )}
                    {nimCatalog.length > 0 && (
                      <>
                        <div className="max-h-44 overflow-y-auto rounded-xl" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)' }}>
                          {nimCatalog.filter(id => id.toLowerCase().includes(nimSearch.toLowerCase())).map(id => {
                            const known = (JSON.parse(catalogJson || '[]') || []).some((m: any) => m.id === id);
                            return (
                              <label key={id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:opacity-80" style={{ color: 'var(--fg)' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedNimModels.has(id)}
                                  onChange={() => {
                                    setSelectedNimModels(prev => {
                                      const n = new Set(prev);
                                      if (n.has(id)) n.delete(id); else n.add(id);
                                      return n;
                                    });
                                  }}
                                />
                                <span className="flex-1 min-w-0 truncate font-mono text-[11px]">{id}</span>
                                {known && <span className="text-[10px] shrink-0" style={{ color: 'var(--success)' }}>katalógusban van</span>}
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => {
                              const selected = nimCatalog.filter(id => selectedNimModels.has(id));
                              if (selected.length === 0) return;
                              let current: any[] = [];
                              try {
                                const parsed = JSON.parse(catalogJson);
                                if (Array.isArray(parsed)) current = parsed;
                              } catch {}
                              const existingIds = new Set(current.map(m => m.id));
                              const added: any[] = [];
                              for (const id of selected) {
                                if (existingIds.has(id)) continue;
                                existingIds.add(id);
                                added.push({
                                  id,
                                  label: id.includes('/') ? id.split('/').pop() : id,
                                  publisher: id.includes('/') ? id.split('/')[0] : 'Egyéb',
                                  contextWindow: 131072,
                                  supportsVision: id.toLowerCase().includes('vision') || id.toLowerCase().includes('vl'),
                                  supportsThinking: true,
                                  description: 'API-ból hozzáadva',
                                });
                              }
                              const merged = [...current, ...added];
                              setCatalogJson(JSON.stringify(merged, null, 2));
                              localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ models: merged, timestamp: Date.now() }));
                              window.dispatchEvent(new CustomEvent('models-cache-updated'));
                              setSelectedNimModels(new Set());
                              setCatalogAdded(true);
                              setTimeout(() => setCatalogAdded(false), 2000);
                            }}
                            disabled={selectedNimModels.size === 0}
                            className="px-3 py-2 rounded-xl text-xs font-medium disabled:opacity-50" style={{ background: 'var(--accent-glass)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                          >
                            {catalogAdded ? 'Hozzáadva!' : `Kijelöltek hozzáadása (${selectedNimModels.size})`}
                          </button>
                          <span className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                            {nimCatalog.length} modell, {selectedNimModels.size} kijelölve
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>Diagnosztika</h3>
                  <button
                    onClick={async () => {
                      setDebugLoading(true);
                      try {
                        const res = await fetch('/api/debug');
                        setDebugResult(await res.json());
                      } catch (e: any) {
                        setDebugResult({ error: e?.message || 'hiba' });
                      }
                      setDebugLoading(false);
                    }}
                    disabled={debugLoading}
                    className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50" style={{ background: 'var(--accent-glass)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                  >
                    {debugLoading ? 'Futtatás...' : 'Futtatás'}
                  </button>
                  {debugResult && (
                    <div className="mt-2 text-[11px] font-mono space-y-1 p-3 rounded-xl" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)', color: 'var(--fg-muted)' }}>
                      {debugResult.error && <div style={{ color: 'var(--danger)' }}>Hiba: {debugResult.error}</div>}
                      {debugResult.envStatus && (
                        <div className="space-y-0.5">
                          <div className="font-semibold" style={{ color: 'var(--fg)' }}>Környezeti változók:</div>
                          {Object.entries(debugResult.envStatus).map(([k, v]) => (
                            <div key={k}>{k}: <span style={{ color: v ? 'var(--success)' : 'var(--danger)' }}>{v ? 'beállítva' : 'hiányzik'}</span></div>
                          ))}
                        </div>
                      )}
                      {debugResult.nimError && <div style={{ color: 'var(--danger)' }}>NIM: {debugResult.nimError}</div>}
                      {debugResult.nimModelCount !== undefined && <div>NIM modellek száma: {debugResult.nimModelCount}</div>}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="font-medium mb-2" style={{ color: 'var(--fg)' }}>LocalStorage adatok</h3>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => setLocalData(Object.keys(localStorage).map(k => ({ key: k, value: localStorage.getItem(k) || '' })))}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium" style={{ background: 'var(--input-bg)', color: 'var(--fg-secondary)', border: '1px solid var(--border-subtle)' }}
                    >
                      Listázás
                    </button>
                    <button
                      onClick={() => {
                        const all = Object.keys(localStorage).reduce((acc, k) => { acc[k] = localStorage.getItem(k) || ''; return acc; }, {} as Record<string, string>);
                        const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = `clawini-settings-${new Date().toISOString().slice(0, 10)}.json`;
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium" style={{ background: 'var(--input-bg)', color: 'var(--fg-secondary)', border: '1px solid var(--border-subtle)' }}
                    >
                      Összes exportálása
                    </button>
                  </div>
                  {localData.length > 0 && (
                    <div className="space-y-1.5">
                      {localData.map((d) => (
                        <div key={d.key} className="flex items-center gap-2 px-2.5 py-2 rounded-xl" style={{ background: 'var(--input-bg)' }}>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate" style={{ color: 'var(--fg)' }}>{d.key}</div>
                            <div className="text-[10px] font-mono truncate" style={{ color: 'var(--fg-muted)' }}>{d.value.slice(0, 120)}{d.value.length > 120 ? '...' : ''}</div>
                          </div>
                          <button
                            onClick={() => { localStorage.removeItem(d.key); setLocalData(prev => prev.filter(x => x.key !== d.key)); }}
                            className="px-2 py-1 rounded-lg text-[10px] flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}
                          >
                            Törlés
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
