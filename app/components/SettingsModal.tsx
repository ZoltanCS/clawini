'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/lib/supabase';
import { User } from '@supabase/supabase-js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

interface OllamaModel {
  name: string;
  enabled: boolean;
}

const OLLAMA_URL_KEY = 'ollamaUrl';
const OLLAMA_MODELS_KEY = 'ollamaModels';
const DEFAULT_OLLAMA_URL = 'https://11434-dep-01kv3yjwybk1665yyxj7s0g7r7-d.cloudspaces.litng.ai/';

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

  const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_OLLAMA_URL);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [downloadingModel, setDownloadingModel] = useState('');
  const [pullInput, setPullInput] = useState('');
  const [pullError, setPullError] = useState('');
  const [pullSuccess, setPullSuccess] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingTags, setIsFetchingTags] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadFromLocalStorage();
    }
    if (user) {
      loadUserProfile();
    }
  }, [user, isOpen]);

  const loadFromLocalStorage = () => {
    const savedUrl = localStorage.getItem(OLLAMA_URL_KEY);
    if (savedUrl) setOllamaUrl(savedUrl);

    const savedModels = localStorage.getItem(OLLAMA_MODELS_KEY);
    if (savedModels) {
      try {
        setOllamaModels(JSON.parse(savedModels));
      } catch {}
    }
  };

  const saveOllamaConfig = useCallback((url: string, models: OllamaModel[]) => {
    localStorage.setItem(OLLAMA_URL_KEY, url);
    localStorage.setItem(OLLAMA_MODELS_KEY, JSON.stringify(models));
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

  const handleSave = async () => {
    if (!user) return;

    setIsLoading(true);

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

    if (!error) {
      saveOllamaConfig(ollamaUrl, ollamaModels);
      onClose();
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Biztosan törölni szeretnéd a fiókodat? Ez nem visszavonható!')) {
      return;
    }
    await supabase.from('chats').delete().eq('user_id', user?.id);
    await supabase.auth.admin.deleteUser(user?.id || '');
  };

  const handlePullModel = async () => {
    const modelName = pullInput.trim();
    if (!modelName) return;

    setDownloadingModel(modelName);
    setPullError('');
    setPullSuccess('');

    try {
      const res = await fetch('/api/ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ollamaUrl, action: 'pull', model: modelName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPullError(data.error || 'Ismeretlen hiba');
        return;
      }

      setPullSuccess(`"${modelName}" sikeresen letöltve!`);
      setPullInput('');
      // Add to enabled models if not already there
      setOllamaModels(prev => {
        if (prev.some(m => m.name === modelName)) return prev;
        return [...prev, { name: modelName, enabled: true }];
      });
    } catch (err) {
      setPullError('Nem sikerült csatlakozni az Ollama szerverhez');
    } finally {
      setDownloadingModel('');
    }
  };

  const handleFetchTags = async () => {
    setIsFetchingTags(true);

    try {
      const res = await fetch('/api/ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ollamaUrl, action: 'tags' }),
      });

      const data = await res.json();

      if (res.ok && data.models) {
        setAvailableModels(data.models.map((m: any) => m.name));
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    } finally {
      setIsFetchingTags(false);
    }
  };

  const toggleOllamaModel = (name: string) => {
    setOllamaModels(prev =>
      prev.map(m => m.name === name ? { ...m, enabled: !m.enabled } : m)
    );
  };

  const removeOllamaModel = (name: string) => {
    setOllamaModels(prev => prev.filter(m => m.name !== name));
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'general', label: 'Általános', icon: '⚙' },
    { id: 'account', label: 'Fiók', icon: '👤' },
    { id: 'appearance', label: 'Megjelenés', icon: '🎨' },
    { id: 'models', label: 'Modellek', icon: '🧠' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-semibold text-gray-800">Beállítások</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-48 border-r bg-gray-50 p-4 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeTab === tab.id ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nyelv</label>
                  <select
                    value={settings.language}
                    onChange={(e) => setSettings({ ...settings, language: e.target.value as 'hu' | 'en' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="hu">Magyar</option>
                    <option value="en">English</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-800">Értesítések</div>
                    <div className="text-sm text-gray-500">Kapj értesítést új üzenetekről</div>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, notifications: !settings.notifications })}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      settings.notifications ? 'bg-blue-500' : 'bg-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.notifications ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-800">Automatikus mentés</div>
                    <div className="text-sm text-gray-500">Beszélgetések automatikus mentése</div>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, autoSave: !settings.autoSave })}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      settings.autoSave ? 'bg-blue-500' : 'bg-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.autoSave ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Teljes név</label>
                  <input
                    type="text"
                    value={settings.fullName}
                    onChange={(e) => setSettings({ ...settings, fullName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Add meg a neved"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>

                <div className="pt-6 border-t">
                  <h3 className="text-red-600 font-medium mb-2">Veszélyes zóna</h3>
                  <button
                    onClick={handleDeleteAccount}
                    className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Fiók törlése
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Téma</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['light', 'dark', 'system'] as const).map((theme) => (
                      <button
                        key={theme}
                        onClick={() => setSettings({ ...settings, theme })}
                        className={`p-4 border-2 rounded-xl text-center transition-colors ${
                          settings.theme === theme ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-2xl mb-2">
                          {theme === 'light' && '☀'}
                          {theme === 'dark' && '🌙'}
                          {theme === 'system' && '💻'}
                        </div>
                        <div className="text-sm font-medium">
                          {theme === 'light' && 'Világos'}
                          {theme === 'dark' && 'Sötét'}
                          {theme === 'system' && 'Rendszer'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'models' && (
              <div className="space-y-6">
                {/* Ollama URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ollama API URL
                  </label>
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="https://..."
                  />
                  <p className="text-xs text-gray-400 mt-1">Az Ollama szerver alap URL-je</p>
                </div>

                {/* Pull model */}
                <div className="pt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Modell letöltése
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pullInput}
                      onChange={(e) => setPullInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePullModel()}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="pl. llama3.2, mistral, qwen2.5..."
                    />
                    <button
                      onClick={handlePullModel}
                      disabled={!pullInput.trim() || !!downloadingModel}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
                    >
                      {downloadingModel ? 'Letöltés...' : 'Letöltés'}
                    </button>
                  </div>
                  {pullError && (
                    <p className="text-sm text-red-500 mt-1">{pullError}</p>
                  )}
                  {pullSuccess && (
                    <p className="text-sm text-green-600 mt-1">{pullSuccess}</p>
                  )}
                </div>

                {/* Enabled models list */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">
                      Aktív modellek
                    </label>
                    <button
                      onClick={handleFetchTags}
                      disabled={isFetchingTags}
                      className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                    >
                      {isFetchingTags ? 'Frissítés...' : 'Szerver modellek frissítése'}
                    </button>
                  </div>

                  {ollamaModels.length === 0 ? (
                    <p className="text-sm text-gray-400">Még nincs letöltött modell</p>
                  ) : (
                    <div className="space-y-2">
                      {ollamaModels.map((model) => (
                        <div key={model.name} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => toggleOllamaModel(model.name)}
                              className={`w-10 h-6 rounded-full transition-colors ${
                                model.enabled ? 'bg-blue-500' : 'bg-gray-300'
                              }`}
                            >
                              <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                                model.enabled ? 'translate-x-5' : 'translate-x-1'
                              }`} />
                            </button>
                            <span className="text-sm font-medium text-gray-800">{model.name}</span>
                          </div>
                          <button
                            onClick={() => removeOllamaModel(model.name)}
                            className="text-xs text-red-500 hover:text-red-600 font-medium"
                          >
                            Eltávolítás
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Available models on server */}
                {availableModels.length > 0 && (
                  <div className="pt-2">
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Elérhető modellek a szerveren
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableModels.map((name) => {
                        const isAdded = ollamaModels.some(m => m.name === name);
                        return (
                          <button
                            key={name}
                            onClick={() => {
                              if (!isAdded) {
                                setOllamaModels(prev => [...prev, { name, enabled: true }]);
                              }
                            }}
                            disabled={isAdded}
                            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                              isAdded
                                ? 'border-green-300 bg-green-50 text-green-600'
                                : 'border-gray-300 hover:border-blue-400 text-gray-700 hover:text-blue-600'
                            }`}
                          >
                            {name} {isAdded ? '✓' : '+'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 flex justify-end gap-2">
              <button
                onClick={() => {
                  saveOllamaConfig(ollamaUrl, ollamaModels);
                  onClose();
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Mégsem
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
              >
                {isLoading ? 'Mentés...' : 'Mentés'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
