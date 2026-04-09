import React from 'react';
import InlineStatus, { type StatusTone } from './InlineStatus';

interface StorageCardProps {
  appLanguage: 'zh' | 'en';
  appTheme: 'light' | 'dark';
  vectorStoragePath: string;
  documentStoragePath: string;
  stateText: string;
  stateTone: StatusTone;
  onVectorPathChange: (value: string) => void;
  onDocumentPathChange: (value: string) => void;
  onPickVectorDirectory: () => void;
  onPickDocumentDirectory: () => void;
  onOpenVectorStorage: () => void;
  onOpenDocumentStorage: () => void;
  onClearVectorCache: () => void;
  vectorStatsText: string;
  documentStatsText: string;
  vectorHint: string;
  documentHint: string;
  storageLocked?: boolean;
}

export default function StorageCard({
  appLanguage,
  appTheme,
  vectorStoragePath,
  documentStoragePath,
  stateText,
  stateTone,
  onVectorPathChange,
  onDocumentPathChange,
  onPickVectorDirectory,
  onPickDocumentDirectory,
  onOpenVectorStorage,
  onOpenDocumentStorage,
  onClearVectorCache,
  vectorStatsText,
  documentStatsText,
  vectorHint,
  documentHint,
  storageLocked = false,
}: StorageCardProps) {
  const isDark = appTheme === 'dark';
  const sectionLabel = appLanguage === 'en' ? 'Storage Config' : '存储配置';
  const sectionTitle = appLanguage === 'en' ? 'Knowledge Base Directory' : '知识库目录';

  return (
    <section className={`rounded-xl border p-5 shadow-sm ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`} data-testid="settings-card-storage">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{sectionLabel}</p>
          <h3 className={`mt-1 text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{sectionTitle}</h3>
        </div>
        <InlineStatus tone={stateTone} message={stateText} testId="settings-card-storage-state" />
      </div>

      <div className="mt-4 space-y-4">
        <div className={`rounded-lg border p-3 ${isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50/70'}`} data-testid="settings-card-storage-vector">
          <p className={`mb-2 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>向量知识库目录</p>
          <label className={`block text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
            <span className="mb-1 block font-medium">向量目录路径</span>
            <input
              value={vectorStoragePath}
              aria-label="存储路径"
              onChange={(event) => onVectorPathChange(event.target.value)}
              disabled={storageLocked}
              className={`w-full rounded-lg border px-3 py-2 font-mono text-xs ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={onPickVectorDirectory} disabled={storageLocked} className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'}`}>选择目录</button>
            <button type="button" onClick={onOpenVectorStorage} className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>打开目录</button>
            <button type="button" onClick={onClearVectorCache} className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>清理缓存</button>
          </div>
          {vectorStatsText && <p className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{vectorStatsText}</p>}
          {vectorHint && <p className={`mt-1 text-xs ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>{vectorHint}</p>}
        </div>

        <div className={`rounded-lg border p-3 ${isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50/70'}`} data-testid="settings-card-storage-docs">
          <p className={`mb-2 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>文档知识库目录</p>
          <label className={`block text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
            <span className="mb-1 block font-medium">文档目录路径</span>
            <input
              value={documentStoragePath}
              aria-label="文档目录路径"
              onChange={(event) => onDocumentPathChange(event.target.value)}
              disabled={storageLocked}
              className={`w-full rounded-lg border px-3 py-2 font-mono text-xs ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={onPickDocumentDirectory} disabled={storageLocked} className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'}`}>选择目录</button>
            <button type="button" onClick={onOpenDocumentStorage} className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>打开目录</button>
          </div>
          {documentStatsText && <p className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{documentStatsText}</p>}
          {documentHint && <p className={`mt-1 text-xs ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>{documentHint}</p>}
        </div>
      </div>
    </section>
  );
}
