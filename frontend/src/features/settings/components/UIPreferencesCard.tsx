import React from 'react';
import InlineStatus, { type StatusTone } from './InlineStatus';

interface UIPreferencesCardProps {
  appLanguage: 'zh' | 'en';
  appTheme: 'light' | 'dark';
  language: 'zh' | 'en';
  theme: 'light' | 'dark';
  stateText: string;
  stateTone: StatusTone;
  onLanguageChange: (value: 'zh' | 'en') => void;
  onThemeChange: (value: 'light' | 'dark') => void;
}

export default function UIPreferencesCard({
  appLanguage,
  appTheme,
  language,
  theme,
  stateText,
  stateTone,
  onLanguageChange,
  onThemeChange,
}: UIPreferencesCardProps) {
  const isDark = appTheme === 'dark';
  const title = appLanguage === 'en' ? 'Language & Theme' : '语言与主题';
  const sectionLabel = appLanguage === 'en' ? 'UI Preferences' : '界面偏好';

  return (
    <section className={`rounded-xl border p-5 shadow-sm ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`} data-testid="settings-card-ui">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{sectionLabel}</p>
          <h3 className={`mt-1 text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{title}</h3>
        </div>
        <InlineStatus tone={stateTone} message={stateText} testId="settings-card-ui-state" />
      </div>
      <div className="mt-4 space-y-4">
        <label className={`block text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          <span className="mb-1 block font-medium">界面语言</span>
          <select
            value={language}
            onChange={(event) => onLanguageChange(event.target.value as 'zh' | 'en')}
            className={`w-full rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
            aria-label="界面语言"
          >
            <option value="zh">中文 (简体)</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className={`block text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          <span className="mb-1 block font-medium">主题模式</span>
          <select
            value={theme}
            onChange={(event) => onThemeChange(event.target.value as 'light' | 'dark')}
            className={`w-full rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
            aria-label="主题模式"
          >
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
      </div>
    </section>
  );
}
