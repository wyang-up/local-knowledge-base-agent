import React from 'react';
import InlineStatus from './InlineStatus';

interface SettingsLayoutProps {
  language: 'zh' | 'en';
  theme: 'light' | 'dark';
  onImportClick: () => void;
  onImportFile: (file: File) => void;
  onExport: () => void;
  onReset: () => void;
  showSaveBar: boolean;
  onSaveAll: () => void;
  bannerTone: 'success' | 'error' | 'warning' | 'info' | null;
  bannerMessage: string;
  children: React.ReactNode;
}

export default function SettingsLayout({
  language,
  theme,
  onImportClick,
  onImportFile,
  onExport,
  onReset,
  showSaveBar,
  onSaveAll,
  bannerTone,
  bannerMessage,
  children,
}: SettingsLayoutProps) {
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const isDark = theme === 'dark';
  const title = language === 'en' ? 'System Settings' : '系统设置';
  const eyebrow = language === 'en' ? 'Settings Center' : '设置中心';
  const unsavedHint = language === 'en' ? 'Unsaved changes' : '存在未保存更改';

  return (
    <div
      className={`relative min-h-full pb-20 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}
      data-testid="settings-page-surface"
    >
      <div className={`sticky top-0 z-20 border-b px-6 py-3 backdrop-blur ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'}`}>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{eyebrow}</p>
            <h2 className={`text-xl font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              data-testid="settings-import-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                onImportFile(file);
                event.currentTarget.value = '';
              }}
            />
            <button type="button" onClick={() => { onImportClick(); importInputRef.current?.click(); }} className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}>导入</button>
            <button type="button" onClick={onExport} className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}>导出</button>
            <button type="button" onClick={onReset} className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}>重置</button>
          </div>
        </div>
        {bannerTone && bannerMessage && (
          <div className="mx-auto mt-2 w-full max-w-6xl">
            <InlineStatus tone={bannerTone} message={bannerMessage} />
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="flex flex-col gap-4" data-testid="settings-sections">{children}</div>
      </div>

      {showSaveBar && (
        <div
          className={`fixed bottom-16 left-0 right-0 z-30 border-t px-6 py-3 ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-300 bg-white/95'}`}
          data-testid="save-all-bar"
        >
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
            <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{unsavedHint}</p>
            <button type="button" onClick={onSaveAll} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">保存全部</button>
          </div>
        </div>
      )}
    </div>
  );
}
