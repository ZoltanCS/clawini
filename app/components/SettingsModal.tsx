'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/lib/supabase';
import { User } from '@supabase/supabase-js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

const SYSTEM_PROMPT_KEY = 'systemPrompt';
const DEFAULT_SYSTEM_PROMPT = 'Te egy segítőkész, barátságos AI asszisztens vagy, aki mindig magyarul válaszol. Légy pozitív, bátorító és támogató.';

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

  useEffect(() => {
    if (isOpen) {
      const savedPrompt = localStorage.getItem(SYSTEM_PROMPT_KEY);
      if (savedPrompt) setSystemPrompt(savedPrompt);
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
    { id: 'general', label: 'Altalanos', icon: '\u2699' },
    { id: 'prompt', label: 'AI Prompt', icon: '\uD83E\uDDE0' },
    { id: 'account', label: 'Fiok', icon: '\uD83D\uDC64' },
    { id: 'appearance', label: 'Megjelenes', icon: '\uD83C\uDFA8' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-xl font-semibold text-gray-800">Beallitasok</h2>
          <button onClick={onClose} className="p-2 active:bg-gray-100 rounded-full touch-active">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-36 border-r bg-gray-50 p-3 space-y-1 flex-shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                  activeTab === tab.id ? 'bg-blue-50 text-blue-600' : 'active:bg-gray-100 text-gray-700'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 p-5 overflow-y-auto">
            {activeTab === 'general' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nyelv</label>
                  <select
                    value={settings.language}
                    onChange={(e) => setSettings({ ...settings, language: e.target.value as 'hu' | 'en' })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
                  >
                    <option value="hu">Magyar</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-800">Ertesitesek</div>
                    <div className="text-sm text-gray-500">Kapj ertesitest uj uzenetekről</div>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, notifications: !settings.notifications })}
                    className={`w-12 h-6 rounded-full transition-colors ${settings.notifications ? 'bg-blue-500' : 'bg-gray-300'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${settings.notifications ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-800">Automatikus mentes</div>
                    <div className="text-sm text-gray-500">Beszelgetesek automatikus mentese</div>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, autoSave: !settings.autoSave })}
                    className={`w-12 h-6 rounded-full transition-colors ${settings.autoSave ? 'bg-blue-500' : 'bg-gray-300'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${settings.autoSave ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'prompt' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rendszer prompt</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={6}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none text-base"
                  />
                  <p className="text-xs text-gray-400 mt-1">Az AI asszisztens szemelyiseget es viselkedeset hatarozza meg. A promptba automatikusan bekerulnek: datum, ido, idozona, nap, honap, ev.</p>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Teljes nev</label>
                  <input
                    type="text" value={settings.fullName}
                    onChange={(e) => setSettings({ ...settings, fullName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
                    placeholder="Add meg a neved"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input type="email" value={user?.email || ''} disabled className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-500" />
                </div>
                <div className="pt-4 border-t">
                  <h3 className="text-red-600 font-medium mb-2">Veszelyes zona</h3>
                  <button onClick={handleDeleteAccount} className="px-4 py-2.5 border border-red-300 text-red-600 rounded-lg active:bg-red-50 transition-colors">Fiok torlese</button>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Tema</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['light', 'dark', 'system'] as const).map((theme) => (
                      <button
                        key={theme}
                        onClick={() => setSettings({ ...settings, theme })}
                        className={`p-4 border-2 rounded-xl text-center transition-colors ${settings.theme === theme ? 'border-blue-500 bg-blue-50' : 'border-gray-200 active:border-gray-300'}`}
                      >
                        <div className="text-2xl mb-1">{theme === 'light' ? '\u2600' : theme === 'dark' ? '\uD83C\uDF19' : '\uD83D\uDCBB'}</div>
                        <div className="text-sm font-medium">{theme === 'light' ? 'Vilagos' : theme === 'dark' ? 'Sotet' : 'Rendszer'}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8 flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg active:bg-gray-50 transition-colors">Megsem</button>
              <button onClick={handleSave} disabled={isLoading} className="px-6 py-2.5 bg-blue-500 active:bg-blue-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors">
                {isLoading ? 'Mentes...' : 'Mentes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}