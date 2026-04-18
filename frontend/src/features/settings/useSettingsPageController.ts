import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { Settings as AppSettings } from '@/shared/types';
import type { SaveOperation, UseSettingsStateApi } from './useSettingsState';
import type { SettingsDraft, SettingsExportPayload, SettingsImportRequest, UiField } from './types';
import type { StatusTone } from './components/InlineStatus';

type ProviderKey = 'siliconflow' | 'openai' | 'gemini' | 'custom_compatible';
type DialogPriority = 'normal' | 'confirm' | 'leave-page';

export const SETTINGS_SESSION_HEADER = 'x-settings-session';
export const SETTINGS_CSRF_HEADER = 'x-csrf-token';

const SETTINGS_SESSION_STORAGE_KEY = 'kb.settings.sessionToken';
const SETTINGS_CSRF_STORAGE_KEY = 'kb.settings.csrfToken';
const SETTINGS_AUTH_BOOTSTRAP_ENDPOINT = '/api/settings/auth/bootstrap';
const runtimeGeneratedTokens: Partial<Record<'session' | 'csrf', string>> = {};
let settingsBootstrapPromise: Promise<boolean> | null = null;

export type DialogRequest = {
  id: string;
  priority: DialogPriority;
  title: string;
  description: string;
  confirmText: string;
  cancelText?: string;
  onConfirm?: () => Promise<void> | void;
  onCancel?: () => Promise<void> | void;
};

type CardKey = 'ui' | 'provider' | 'storage';

interface UseSettingsPageControllerParams {
  draft: SettingsDraft;
  settingsState: UseSettingsStateApi;
  activeProvider: ProviderKey;
  setActiveProvider: (provider: ProviderKey) => void;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  apiUrl: (endpoint: string) => string;
  providerLabelMap: Record<ProviderKey, string>;
}

function dialogScore(priority: DialogPriority) {
  if (priority === 'leave-page') return 3;
  if (priority === 'confirm') return 2;
  return 1;
}

function normalizeImportedDraft(raw: any, fallback: SettingsDraft): SettingsDraft {
  const next = JSON.parse(JSON.stringify(fallback)) as SettingsDraft;

  if (typeof raw?.ui?.language === 'string' && (raw.ui.language === 'zh' || raw.ui.language === 'en')) {
    next.ui.language = raw.ui.language;
  }
  if (typeof raw?.ui?.theme === 'string' && (raw.ui.theme === 'light' || raw.ui.theme === 'dark')) {
    next.ui.theme = raw.ui.theme;
  }
  if (typeof raw?.storage?.storagePath === 'string') {
    next.storage.storagePath = raw.storage.storagePath;
  }
  if (typeof raw?.storage?.documentStoragePath === 'string') {
    next.storage.documentStoragePath = raw.storage.documentStoragePath;
  }

  for (const provider of next.providers) {
    const source = raw?.providers?.[provider.providerId];
    if (!source) continue;
    if (typeof source.baseUrl === 'string') provider.baseUrl = source.baseUrl;
    if (typeof source.apiKey === 'string') provider.apiKey = source.apiKey;
    if (typeof source.llmModel === 'string') provider.llmModel = source.llmModel;
    if (typeof source.embeddingModel === 'string') provider.embeddingModel = source.embeddingModel;
  }

  return next;
}

function normalizeAllConfigDraft(raw: any, fallback: SettingsDraft): SettingsDraft {
  const next = JSON.parse(JSON.stringify(fallback)) as SettingsDraft;
  const uiSource = raw?.uiPreferences ?? raw?.ui;
  if (typeof uiSource?.language === 'string') {
    next.ui.language = uiSource.language.toLowerCase().startsWith('en') ? 'en' : 'zh';
  }
  if (typeof uiSource?.theme === 'string') {
    next.ui.theme = uiSource.theme === 'dark' ? 'dark' : 'light';
  }

  const providers = Array.isArray(raw?.providers)
    ? raw.providers
    : [];
  for (const provider of next.providers) {
    const source = providers.find((item: any) => item?.providerId === provider.providerId);
    if (!source) {
      continue;
    }
    if (typeof source.baseUrl === 'string') provider.baseUrl = source.baseUrl;
    if (typeof source.llmModel === 'string') provider.llmModel = source.llmModel;
    if (typeof source.embeddingModel === 'string') provider.embeddingModel = source.embeddingModel;
  }

  const storageSource = raw?.storagePreferences ?? raw?.storage;
  if (typeof storageSource?.storagePath === 'string') {
    next.storage.storagePath = storageSource.storagePath;
  }
  if (typeof storageSource?.documentStoragePath === 'string') {
    next.storage.documentStoragePath = storageSource.documentStoragePath;
  }

  return next;
}

function collectExpectedVersions(raw: any) {
  const providerVersions: Record<string, number> = {};
  const providers = Array.isArray(raw?.providers) ? raw.providers : [];
  for (const provider of providers) {
    if (typeof provider?.providerId === 'string' && Number.isInteger(provider?.version)) {
      providerVersions[provider.providerId] = provider.version;
    }
  }

  const storageSource = raw?.storagePreferences ?? raw?.storage;

  return {
    providers: providerVersions,
    storage: Number.isInteger(storageSource?.version) ? storageSource.version : 1,
  };
}

function readConfiguredToken(kind: 'session' | 'csrf') {
  const value = kind === 'session'
    ? import.meta.env.VITE_SETTINGS_SESSION_TOKEN
    : import.meta.env.VITE_SETTINGS_CSRF_TOKEN;

  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function generateSessionToken(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    const randomHex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${prefix}-${randomHex}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readSessionStorageToken(storageKey: string) {
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing && existing.trim()) {
      return existing;
    }
  } catch {
    // ignore sessionStorage read errors
  }
  return '';
}

function writeSessionStorageToken(storageKey: string, token: string) {
  try {
    window.sessionStorage.setItem(storageKey, token);
  } catch {
    // ignore sessionStorage write errors
  }
}

function clearSessionStorageToken(storageKey: string) {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // ignore sessionStorage remove errors
  }
}

function resolveSettingsToken(kind: 'session' | 'csrf') {
  const configuredToken = readConfiguredToken(kind);
  if (configuredToken) {
    return configuredToken;
  }

  const storageKey = kind === 'session' ? SETTINGS_SESSION_STORAGE_KEY : SETTINGS_CSRF_STORAGE_KEY;
  const storedToken = readSessionStorageToken(storageKey);
  if (storedToken) {
    return storedToken;
  }

  const runtimeToken = runtimeGeneratedTokens[kind] || generateSessionToken(kind === 'session' ? 'settings-session' : 'settings-csrf');
  runtimeGeneratedTokens[kind] = runtimeToken;
  writeSessionStorageToken(storageKey, runtimeToken);
  return runtimeToken;
}

function clearSettingsSecurityTokens() {
  runtimeGeneratedTokens.session = undefined;
  runtimeGeneratedTokens.csrf = undefined;
  clearSessionStorageToken(SETTINGS_SESSION_STORAGE_KEY);
  clearSessionStorageToken(SETTINGS_CSRF_STORAGE_KEY);
  settingsBootstrapPromise = null;
}

function hasResolvedSettingsToken(kind: 'session' | 'csrf') {
  return Boolean(
    readConfiguredToken(kind)
      || readSessionStorageToken(kind === 'session' ? SETTINGS_SESSION_STORAGE_KEY : SETTINGS_CSRF_STORAGE_KEY)
      || runtimeGeneratedTokens[kind],
  );
}

function downloadJsonFile(payload: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

async function bootstrapSettingsTokens(apiUrl: (endpoint: string) => string) {
  const response = await fetch(apiUrl(SETTINGS_AUTH_BOOTSTRAP_ENDPOINT), { method: 'GET' });
  if (!response.ok) {
    return false;
  }
  const payload = await response.json();
  const sessionToken = typeof payload?.sessionToken === 'string' ? payload.sessionToken.trim() : '';
  const csrfToken = typeof payload?.csrfToken === 'string' ? payload.csrfToken.trim() : '';
  if (!sessionToken || !csrfToken) {
    return false;
  }
  runtimeGeneratedTokens.session = sessionToken;
  runtimeGeneratedTokens.csrf = csrfToken;
  writeSessionStorageToken(SETTINGS_SESSION_STORAGE_KEY, sessionToken);
  writeSessionStorageToken(SETTINGS_CSRF_STORAGE_KEY, csrfToken);
  return true;
}

async function ensureSettingsTokens(apiUrl: (endpoint: string) => string) {
  if (hasResolvedSettingsToken('session') && hasResolvedSettingsToken('csrf')) {
    return true;
  }

  if (!settingsBootstrapPromise) {
    settingsBootstrapPromise = bootstrapSettingsTokens(apiUrl).finally(() => {
      settingsBootstrapPromise = null;
    });
  }

  try {
    return await settingsBootstrapPromise;
  } catch {
    return false;
  }
}

function isAuthFailureStatus(status: number) {
  return status === 401 || status === 403;
}

export function getSettingsSecurityHeaders(extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set(SETTINGS_SESSION_HEADER, resolveSettingsToken('session'));
  headers.set(SETTINGS_CSRF_HEADER, resolveSettingsToken('csrf'));
  return headers;
}

export async function settingsFetch(
  apiUrl: (endpoint: string) => string,
  endpoint: string,
  init: RequestInit,
) {
  await ensureSettingsTokens(apiUrl);

  const send = () => fetch(apiUrl(endpoint), {
    ...init,
    headers: getSettingsSecurityHeaders(init.headers),
  });

  const first = await send();
  if (!isAuthFailureStatus(first.status)) {
    return first;
  }

  clearSettingsSecurityTokens();
  try {
    await bootstrapSettingsTokens(apiUrl);
  } catch {
    // keep retry path resilient when bootstrap endpoint is unavailable
  }
  return send();
}

export function useSettingsPageController({
  draft,
  settingsState,
  activeProvider,
  setActiveProvider,
  setSettings,
  apiUrl,
  providerLabelMap,
}: UseSettingsPageControllerParams) {
  const [inlineStatus, setInlineStatus] = useState<{ tone: StatusTone; message: string } | null>(null);
  const [lastSaveStatusByCard, setLastSaveStatusByCard] = useState<Record<CardKey, 'success' | 'failure' | 'clean'>>({
    ui: 'clean',
    provider: 'clean',
    storage: 'clean',
  });
  const [dialogQueue, setDialogQueue] = useState<DialogRequest[]>([]);
  const [storageHint, setStorageHint] = useState('');
  const [expectedVersions, setExpectedVersions] = useState<{ providers: Record<string, number>; storage: number }>({
    providers: Object.fromEntries(Object.keys(providerLabelMap).map((providerId) => [providerId, 1])),
    storage: 1,
  });

  const refreshExpectedVersions = async () => {
    try {
      const res = await settingsFetch(apiUrl, '/api/config/all', {
        method: 'GET',
      });
      if (!res.ok) {
        return;
      }
      const payload = await res.json();
      setExpectedVersions((prev) => {
        const next = collectExpectedVersions(payload);
        return {
          providers: {
            ...prev.providers,
            ...next.providers,
          },
          storage: next.storage,
        };
      });
    } catch {
      // ignore refresh failures and keep current versions
    }
  };

  const providerDirty = Boolean(settingsState.getModuleSaveOperation({ module: 'provider', providerId: activeProvider }));
  const storageDirty = Boolean(settingsState.getModuleSaveOperation({ module: 'storage' }));
  const uiDirty = Boolean(settingsState.getModuleSaveOperation({ module: 'ui' }));
  const hasUnsavedChanges = settingsState.isDirty;

  const activeDialog = useMemo(() => {
    if (dialogQueue.length === 0) {
      return null;
    }
    return dialogQueue.slice().sort((a, b) => dialogScore(b.priority) - dialogScore(a.priority))[0];
  }, [dialogQueue]);

  useEffect(() => {
    if (!inlineStatus) {
      return;
    }
    if (inlineStatus.tone === 'error' || inlineStatus.tone === 'warning') {
      return;
    }
    const timer = window.setTimeout(() => {
      setInlineStatus(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [inlineStatus]);

  useEffect(() => {
    const handleBeforeUnload = (event: Event) => {
      if (!hasUnsavedChanges) {
        return;
      }
      event.preventDefault();
      (event as BeforeUnloadEvent).returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const queueDialog = (request: DialogRequest) => {
    setDialogQueue((prev) => {
      if (prev.some((item) => item.id === request.id)) {
        return prev;
      }
      return [...prev, request];
    });
  };

  const closeActiveDialog = () => {
    if (!activeDialog) {
      return;
    }
    setDialogQueue((prev) => prev.filter((item) => item.id !== activeDialog.id));
  };

  const resolveCardMarker = (card: CardKey, dirty: boolean): { text: string; tone: StatusTone } => {
    if (lastSaveStatusByCard[card] === 'failure') return { text: '保存失败', tone: 'error' };
    if (dirty) return { text: '已编辑', tone: 'warning' };
    if (lastSaveStatusByCard[card] === 'success') return { text: '保存成功', tone: 'success' };
    return { text: '未修改', tone: 'info' };
  };

  const syncDisplaySettings = (saved: Record<CardKey, boolean>, snapshot?: SaveOperation[]) => {
    const operationLookup = new Map<string, SaveOperation>();
    for (const operation of snapshot ?? []) {
      const key = operation.module === 'provider' ? `provider:${operation.providerId}` : operation.module;
      operationLookup.set(key, operation);
    }

    setSettings((prev) => {
      const next = { ...prev };
      if (saved.ui) {
        const uiOperation = operationLookup.get('ui');
        const nextLanguage = uiOperation?.module === 'ui'
          ? uiOperation.fields.language
          : undefined;
        if (typeof nextLanguage === 'string') {
          next.language = nextLanguage as 'zh' | 'en';
        }
      }
      if (saved.provider) {
        const providerOperation = operationLookup.get(`provider:${activeProvider}`);
        if (providerOperation?.module === 'provider') {
          if (typeof providerOperation.fields.baseUrl === 'string') {
            next.baseUrl = providerOperation.fields.baseUrl;
          }
          if (typeof providerOperation.fields.llmModel === 'string') {
            next.llmModel = providerOperation.fields.llmModel;
          }
          if (typeof providerOperation.fields.embeddingModel === 'string') {
            next.vectorModel = providerOperation.fields.embeddingModel;
          }
        }
      }
      if (saved.storage) {
        const storageOperation = operationLookup.get('storage');
        if (storageOperation?.module === 'storage' && typeof storageOperation.fields.storagePath === 'string') {
          next.storagePath = storageOperation.fields.storagePath;
        }
        if (storageOperation?.module === 'storage' && typeof storageOperation.fields.documentStoragePath === 'string') {
          next.documentStoragePath = storageOperation.fields.documentStoragePath;
        }
      }
      return next;
    });
  };

  const executeSaveOperation = async (operation: SaveOperation) => {
    const endpoint = operation.module === 'ui'
      ? '/api/config/ui'
      : operation.module === 'storage'
        ? '/api/config/storage'
        : `/api/config/provider/${encodeURIComponent(operation.providerId)}`;
    const payload = operation.module === 'provider'
      ? {
        ...operation.fields,
        expectedVersion: expectedVersions.providers[operation.providerId] ?? 1,
      }
      : operation.module === 'storage'
        ? {
          ...operation.fields,
          expectedVersion: expectedVersions.storage ?? 1,
        }
        : operation.fields;

    try {
      const res = await settingsFetch(apiUrl, endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return false;
      }
      const data = await res.json().catch(() => ({}));
      if (operation.module === 'provider' && Number.isInteger(data?.provider?.version)) {
        setExpectedVersions((prev) => ({
          ...prev,
          providers: {
            ...prev.providers,
            [operation.providerId]: data.provider.version,
          },
        }));
      }
      if (operation.module === 'storage' && Number.isInteger(data?.storage?.version)) {
        setExpectedVersions((prev) => ({
          ...prev,
          storage: data.storage.version,
        }));
      }
      settingsState.applySaveSuccess(operation);
      return true;
    } catch {
      return false;
    }
  };

  const requestProviderSwitch = (nextProvider: string) => {
    const target = nextProvider as ProviderKey;
    if (target === activeProvider) {
      return;
    }

    if (!providerDirty) {
      setActiveProvider(target);
      return;
    }

    const providerOperation = settingsState.getModuleSaveOperation({ module: 'provider', providerId: activeProvider });
    if (!providerOperation) {
      setActiveProvider(target);
      return;
    }

    queueDialog({
      id: 'provider-switch',
      priority: 'confirm',
      title: '未保存更改',
      description: '你有未保存的提供商配置。可先保存并切换，或放弃后切换。',
      confirmText: '保存并切换',
      cancelText: '放弃更改并切换',
      onConfirm: async () => {
        const ok = await executeSaveOperation(providerOperation);
        if (!ok) {
          setInlineStatus({ tone: 'error', message: '保存失败，请先修复后再切换提供商' });
          setLastSaveStatusByCard((prev) => ({ ...prev, provider: 'failure' }));
          return;
        }
        setLastSaveStatusByCard((prev) => ({ ...prev, provider: 'success' }));
        syncDisplaySettings({ ui: false, provider: true, storage: false }, [providerOperation]);
        setActiveProvider(target);
      },
      onCancel: () => {
        settingsState.resetModule({ module: 'provider', providerId: activeProvider });
        setLastSaveStatusByCard((prev) => ({ ...prev, provider: 'clean' }));
        setActiveProvider(target);
      },
    });
  };

  const importSettings = async (file: File) => {
    try {
      const rawText = await file.text();
      const parsedPayload = JSON.parse(rawText) as SettingsExportPayload;
      const body: SettingsImportRequest = {
        schemaVersion: typeof parsedPayload?.schemaVersion === 'string' ? parsedPayload.schemaVersion : '1.0.0',
        dryRun: false,
        payload: {
          uiPreferences: parsedPayload?.uiPreferences,
          providers: Array.isArray(parsedPayload?.providers) ? parsedPayload.providers.map((provider) => ({
            providerId: provider.providerId,
            baseUrl: provider.baseUrl,
            llmModel: provider.llmModel,
            embeddingModel: provider.embeddingModel,
          })) : [],
          storagePreferences: parsedPayload?.storagePreferences,
        },
      };

      const res = await settingsFetch(apiUrl, '/api/config/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setInlineStatus({ tone: 'error', message: '导入失败，请检查文件格式' });
        queueDialog({ id: 'import-error', priority: 'normal', title: '导入失败', description: '请检查导入文件后重试。', confirmText: '知道了' });
        return;
      }

      await res.json();

      const allRes = await settingsFetch(apiUrl, '/api/config/all', {
        method: 'GET',
      });
      if (!allRes.ok) {
        throw new Error('load all config after import failed');
      }
      const allData = await allRes.json();
      const nextDraft = normalizeAllConfigDraft(allData, draft);
      settingsState.replaceAll(nextDraft, { syncBaseline: true });
      setExpectedVersions((prev) => {
        const next = collectExpectedVersions(allData);
        return {
          providers: {
            ...prev.providers,
            ...next.providers,
          },
          storage: next.storage,
        };
      });

      const resolvedProviderId = ((Array.isArray(allData?.providers) && allData.providers[0]?.providerId)
        ? allData.providers[0].providerId
        : activeProvider) as ProviderKey;
      const resolvedProvider = nextDraft.providers.find((item) => item.providerId === resolvedProviderId) ?? nextDraft.providers[0];

      setActiveProvider(resolvedProviderId);
      setSettings((prev) => ({
        ...prev,
        language: nextDraft.ui.language as 'zh' | 'en',
        baseUrl: resolvedProvider?.baseUrl ?? prev.baseUrl,
        llmModel: resolvedProvider?.llmModel ?? prev.llmModel,
        vectorModel: resolvedProvider?.embeddingModel ?? prev.vectorModel,
        storagePath: nextDraft.storage.storagePath,
        documentStoragePath: nextDraft.storage.documentStoragePath,
      }));
      setInlineStatus({ tone: 'success', message: '导入成功，已应用到当前草稿' });
      setLastSaveStatusByCard({ ui: 'clean', provider: 'clean', storage: 'clean' });
    } catch {
      setInlineStatus({ tone: 'error', message: '导入失败，请检查文件格式' });
      queueDialog({ id: 'import-error', priority: 'normal', title: '导入失败', description: '请检查导入文件后重试。', confirmText: '知道了' });
    }
  };

  const exportSettings = async () => {
    try {
      const res = await settingsFetch(apiUrl, '/api/config/export', {
        method: 'GET',
      });
      if (!res.ok) {
        setInlineStatus({ tone: 'error', message: '导出失败，请稍后重试' });
        queueDialog({ id: 'export-error', priority: 'normal', title: '导出失败', description: '当前无法导出设置，请稍后重试。', confirmText: '知道了' });
        return;
      }
      const payload = await res.json();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadJsonFile(payload, `settings-export-${stamp}.json`);
      setInlineStatus({ tone: 'success', message: '导出成功' });
    } catch {
      setInlineStatus({ tone: 'error', message: '导出失败，请稍后重试' });
      queueDialog({ id: 'export-error', priority: 'normal', title: '导出失败', description: '当前无法导出设置，请稍后重试。', confirmText: '知道了' });
    }
  };

  const saveAllSettings = async () => {
    const operations = settingsState.getSaveAllOperations();
    if (operations.length === 0) {
      return;
    }

    const uiOperation = operations.find((operation) => operation.module === 'ui');
    const providerOperations = operations.filter((operation) => operation.module === 'provider');
    const storageOperation = operations.find((operation) => operation.module === 'storage');

    const requestBody = {
      uiPatch: uiOperation?.module === 'ui' ? uiOperation.fields : undefined,
      providerPatches: providerOperations.map((operation) => ({
        providerId: operation.providerId,
        expectedVersion: expectedVersions.providers[operation.providerId] ?? 1,
        fields: operation.fields,
      })),
      storagePatch: storageOperation?.module === 'storage'
        ? {
          ...storageOperation.fields,
          expectedVersion: expectedVersions.storage ?? 1,
        }
        : undefined,
      expectedVersions: {
        providers: expectedVersions.providers,
        storage: expectedVersions.storage ?? 1,
      },
    };

    let success = 0;
    let failed = 0;
    const successMap: Record<CardKey, boolean> = { ui: false, provider: false, storage: false };
    let responseFailedItems: Array<{ module: string; providerId?: string; field: string; code: string }> = [];

    const applyLegacyFallback = async () => {
      for (const operation of operations) {
        const ok = await executeSaveOperation(operation);
        if (ok) {
          success += 1;
          successMap[operation.module] = true;
        } else {
          failed += 1;
        }
      }
    };

    try {
      const response = await settingsFetch(apiUrl, '/api/config/save-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        await applyLegacyFallback();
      } else {
        const payload = await response.json();
        responseFailedItems = Array.isArray(payload?.failedItems) ? payload.failedItems : [];

        const failedKeySet = new Set(responseFailedItems.map((item) => `${item.module}:${item.providerId ?? ''}:${item.field}`));
        for (const operation of operations) {
          const operationKeys = operation.module === 'provider'
            ? Object.keys(operation.fields).map((field) => `provider:${operation.providerId}:${field}`)
            : operation.module === 'storage'
              ? Object.keys(operation.fields).map((field) => `storage::${field}`)
              : Object.keys(operation.fields).map((field) => `ui::${field}`);

          const operationFailed = operationKeys.some((key) => failedKeySet.has(key));
          if (operationFailed) {
            failed += 1;
            continue;
          }
          success += 1;
          successMap[operation.module] = true;
          settingsState.applySaveSuccess(operation);
        }
        await refreshExpectedVersions();
      }
    } catch {
      await applyLegacyFallback();
    }

    if (success > 0 && failed > 0) {
      const firstFailedCode = responseFailedItems[0]?.code;
      setInlineStatus({ tone: 'warning', message: firstFailedCode ? `部分保存成功（${firstFailedCode}）` : '部分保存成功' });
    } else if (failed > 0) {
      const firstFailedCode = responseFailedItems[0]?.code;
      setInlineStatus({ tone: 'error', message: firstFailedCode ? `保存失败（${firstFailedCode}）` : '保存失败，请重试' });
    } else {
      setInlineStatus({ tone: 'success', message: '全部保存成功' });
    }

    if (uiDirty && successMap.ui) {
      setLastSaveStatusByCard((prev) => ({ ...prev, ui: 'success' }));
    } else if (uiDirty) {
      setLastSaveStatusByCard((prev) => ({ ...prev, ui: 'failure' }));
    }
    if (providerDirty && successMap.provider) {
      setLastSaveStatusByCard((prev) => ({ ...prev, provider: 'success' }));
    } else if (providerDirty) {
      setLastSaveStatusByCard((prev) => ({ ...prev, provider: 'failure' }));
    }
    if (storageDirty && successMap.storage) {
      setLastSaveStatusByCard((prev) => ({ ...prev, storage: 'success' }));
    } else if (storageDirty) {
      setLastSaveStatusByCard((prev) => ({ ...prev, storage: 'failure' }));
    }

    syncDisplaySettings(successMap, operations);
  };

  useEffect(() => {
    let active = true;
    const loadExpectedVersions = async () => {
      try {
        const res = await settingsFetch(apiUrl, '/api/config/all', {
          method: 'GET',
        });
        if (!res.ok) {
          return;
        }
        const payload = await res.json();
        if (!active) {
          return;
        }
        setExpectedVersions((prev) => {
          const next = collectExpectedVersions(payload);
          return {
            providers: {
              ...prev.providers,
              ...next.providers,
            },
            storage: next.storage,
          };
        });
      } catch {
        // ignore
      }
    };

    loadExpectedVersions();
    return () => {
      active = false;
    };
  }, [apiUrl]);

  const pickDirectory = async (field: 'storagePath' | 'documentStoragePath' = 'storagePath') => {
    const pickerWindow = window as Window & { showDirectoryPicker?: () => Promise<{ name: string }> };
    if (typeof pickerWindow.showDirectoryPicker !== 'function') {
      setStorageHint('当前环境不支持目录选择器，请手动输入路径。');
      return;
    }

    try {
      const handle = await pickerWindow.showDirectoryPicker();
      settingsState.updateStorageField(field, `/picked/${handle.name}`);
      setStorageHint(field === 'documentStoragePath' ? '文档目录已选择。' : '向量目录已选择。');
    } catch {
      setStorageHint('目录选择已取消。');
    }
  };

  const resetAllDrafts = () => {
    settingsState.resetModule({ module: 'ui' });
    settingsState.resetModule({ module: 'provider', providerId: activeProvider });
    settingsState.resetModule({ module: 'storage' });
    setLastSaveStatusByCard({ ui: 'clean', provider: 'clean', storage: 'clean' });
    setInlineStatus({ tone: 'info', message: '已恢复为最近一次保存状态' });
  };

  const saveUiFieldImmediately = async (field: UiField, nextValue: string, previousValue: string) => {
    const operation: SaveOperation = {
      module: 'ui',
      fields: {
        [field]: nextValue,
      },
    };

    const ok = await executeSaveOperation(operation);
    if (ok) {
      setLastSaveStatusByCard((prev) => ({ ...prev, ui: 'success' }));
      syncDisplaySettings({ ui: true, provider: false, storage: false }, [operation]);
      return true;
    }

    settingsState.updateUiField(field, previousValue);
    setLastSaveStatusByCard((prev) => ({ ...prev, ui: 'failure' }));
    setInlineStatus({ tone: 'error', message: '界面设置保存失败，已回滚为上一次配置' });
    return false;
  };

  return {
    inlineStatus,
    setInlineStatus,
    storageHint,
    activeDialog,
    hasUnsavedChanges,
    uiDirty,
    providerDirty,
    storageDirty,
    resolveCardMarker,
    queueDialog,
    closeActiveDialog,
    requestProviderSwitch,
    importSettings,
    exportSettings,
    saveAllSettings,
    saveUiFieldImmediately,
    pickDirectory,
    resetAllDrafts,
  };
}
