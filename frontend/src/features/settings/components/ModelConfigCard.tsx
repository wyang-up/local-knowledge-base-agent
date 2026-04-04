import React from 'react';
import InlineStatus, { type StatusTone } from './InlineStatus';

export interface ProviderModelItem {
  id: string;
  displayName: string;
  modelType: 'llm' | 'embedding';
  description: string;
  isOnline: boolean;
}

interface ModelConfigCardProps {
  appLanguage: 'zh' | 'en';
  appTheme: 'light' | 'dark';
  activeProvider: string;
  providers: Array<{ id: string; label: string }>;
  baseUrl: string;
  apiKey: string;
  llmModel: string;
  embeddingModel: string;
  stateText: string;
  stateTone: StatusTone;
  models: ProviderModelItem[];
  isApiKeyRevealed: boolean;
  providerActionHint: string;
  onProviderSwitch: (providerId: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onLlmModelChange: (value: string) => void;
  onEmbeddingModelChange: (value: string) => void;
  onTestConnection: () => void;
  onToggleApiKeyReveal: () => void;
  onCopyApiKey: () => void;
}

export default function ModelConfigCard({
  appLanguage,
  appTheme,
  activeProvider,
  providers,
  baseUrl,
  apiKey,
  llmModel,
  embeddingModel,
  stateText,
  stateTone,
  models,
  isApiKeyRevealed,
  providerActionHint,
  onProviderSwitch,
  onBaseUrlChange,
  onApiKeyChange,
  onLlmModelChange,
  onEmbeddingModelChange,
  onTestConnection,
  onToggleApiKeyReveal,
  onCopyApiKey,
}: ModelConfigCardProps) {
  const isDark = appTheme === 'dark';
  const sectionLabel = appLanguage === 'en' ? 'Model Config' : '模型配置';
  const sectionTitle = appLanguage === 'en' ? 'Provider & Model Parameters' : 'Provider 与模型参数';

  const llmOptions = React.useMemo(() => {
    const source = models.filter((item) => item.modelType === 'llm');
    if (llmModel && !source.some((item) => item.id === llmModel)) {
      return [
        { id: llmModel, displayName: llmModel, modelType: 'llm', description: '当前已配置模型', isOnline: false },
        ...source,
      ];
    }
    return source;
  }, [llmModel, models]);

  const embeddingOptions = React.useMemo(() => {
    const source = models.filter((item) => item.modelType === 'embedding');
    if (embeddingModel && !source.some((item) => item.id === embeddingModel)) {
      return [
        { id: embeddingModel, displayName: embeddingModel, modelType: 'embedding', description: '当前已配置模型', isOnline: false },
        ...source,
      ];
    }
    return source;
  }, [embeddingModel, models]);

  const llmDescription = llmOptions.find((item) => item.id === llmModel)?.description;
  const embeddingDescription = embeddingOptions.find((item) => item.id === embeddingModel)?.description;

  return (
    <section className={`rounded-xl border p-5 shadow-sm ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`} data-testid="settings-card-model">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{sectionLabel}</p>
          <h3 className={`mt-1 text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{sectionTitle}</h3>
        </div>
        <InlineStatus tone={stateTone} message={stateText} testId="settings-card-model-state" />
      </div>

      <div className="mt-4 space-y-3">
        <label className={`block text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          <span className="mb-1 block font-medium">服务提供商</span>
          <select
            value={activeProvider}
            onChange={(event) => onProviderSwitch(event.target.value)}
            className={`w-full rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
            aria-label="服务提供商"
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.label}</option>
            ))}
          </select>
        </label>

        <label className={`block text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          <span className="mb-1 block font-medium">Base URL</span>
          <input
            value={baseUrl}
            onChange={(event) => onBaseUrlChange(event.target.value)}
            className={`w-full rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
          />
        </label>

        <label className={`block text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          <span className="mb-1 block font-medium">API Key</span>
          <input
            value={apiKey}
            type={isApiKeyRevealed ? 'text' : 'password'}
            aria-label="API Key"
            onChange={(event) => onApiKeyChange(event.target.value)}
            className={`w-full rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onTestConnection} className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}>
            测试连接
          </button>
          <button type="button" onClick={onToggleApiKeyReveal} className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}>
            {isApiKeyRevealed ? '隐藏 Key' : '显示 Key'}
          </button>
          <button type="button" onClick={onCopyApiKey} className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}>
            复制 Key
          </button>
        </div>
        {providerActionHint && <p className="text-xs text-slate-500">{providerActionHint}</p>}

        <label className={`block text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          <span className="mb-1 block font-medium">LLM 模型</span>
          <select
            value={llmModel}
            aria-label="LLM 模型"
            onChange={(event) => onLlmModelChange(event.target.value)}
            className={`w-full rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
          >
            {llmOptions.map((item) => (
              <option key={`llm-${item.id}`} value={item.id}>{item.displayName}</option>
            ))}
          </select>
        </label>
        {llmDescription && <p className="-mt-1 text-xs text-slate-500">{llmDescription}</p>}

        <label className={`block text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          <span className="mb-1 block font-medium">Embedding 模型</span>
          <select
            value={embeddingModel}
            aria-label="Embedding 模型"
            onChange={(event) => onEmbeddingModelChange(event.target.value)}
            className={`w-full rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`}
          >
            {embeddingOptions.map((item) => (
              <option key={`embedding-${item.id}`} value={item.id}>{item.displayName}</option>
            ))}
          </select>
        </label>
        {embeddingDescription && <p className="-mt-1 text-xs text-slate-500">{embeddingDescription}</p>}
      </div>
    </section>
  );
}
