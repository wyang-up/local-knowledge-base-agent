import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {Loader2} from 'lucide-react';
import { cn } from '../../shared/lib/utils';
import { parseMcpJsonLineBuffer } from '../../shared/lib/mcp-stream';
import { Document, Message, MessageSource, Settings as AppSettings, Chunk, Conversation } from '../../shared/types';
import { useSettingsState } from '../../features/settings/useSettingsState';
import type { ProviderModelItem } from '../../features/settings/components/ModelConfigCard';
import type { SettingsDraft } from '../../features/settings/types';
import { settingsFetch, useSettingsPageController } from '../../features/settings/useSettingsPageController';
import { AppShell } from './components/AppShell';
import { DocumentListPanel } from './components/DocumentListPanel';
import { DocumentDetailPanel } from './components/DocumentDetailPanel';
import { QAPagePanel } from './components/QAPagePanel';
import { SettingsPagePanel } from './components/SettingsPagePanel';
import { extractConversationTitle, formatRelativeTime, getConversationDisplayTitle, QA_EMPTY_TITLE } from './lib/conversation';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const apiUrl = (endpoint: string) => `${API_BASE_URL}${endpoint}`;
const QA_STORAGE_KEY = 'kb.qa.conversations.v1';
const QA_TAG_ALL = '__all__';

function safeStorageGet(key: string) {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return null;
    }
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
      return;
    }
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage write errors in restricted environments.
  }
}


function normalizeConversation(raw: any, index: number): Conversation {
  const id = typeof raw?.id === 'string' && raw.id ? raw.id : `${Date.now()}-${index}`;
  const messages = Array.isArray(raw?.messages)
    ? raw.messages.filter((message: any) => typeof message?.content === 'string' && (message?.role === 'user' || message?.role === 'assistant'))
    : [];

  const title = typeof raw?.title === 'string' && raw.title.trim()
    ? raw.title.trim()
    : (messages.find((message: any) => message.role === 'user')?.content?.slice(0, 18) || `${QA_EMPTY_TITLE}${index + 1}`);

  return {
    id,
    title,
    messages,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    pinned: Boolean(raw?.pinned),
    archived: Boolean(raw?.archived),
    tags: Array.isArray(raw?.tags) ? raw.tags.filter((tag: unknown) => typeof tag === 'string' && tag.trim()).map((tag: string) => tag.trim()) : [],
  };
}

function loadInitialQaState() {
  const raw = safeStorageGet(QA_STORAGE_KEY);
  if (!raw) {
    const fallback = createConversation('默认会话');
    return { conversations: [fallback], activeConversationId: fallback.id };
  }

  try {
    const parsed = JSON.parse(raw);
    const storedConversations = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.conversations) ? parsed.conversations : []);
    const conversations = storedConversations.map(normalizeConversation).filter(Boolean);
    if (conversations.length === 0) {
      const fallback = createConversation('默认会话');
      return { conversations: [fallback], activeConversationId: fallback.id };
    }

    const storedActiveId = typeof parsed?.activeConversationId === 'string' ? parsed.activeConversationId : conversations[0].id;
    const activeConversationId = conversations.some((item) => item.id === storedActiveId) ? storedActiveId : conversations[0].id;
    return { conversations, activeConversationId };
  } catch {
    const fallback = createConversation('默认会话');
    return { conversations: [fallback], activeConversationId: fallback.id };
  }
}

function createConversation(title = '新会话'): Conversation {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    messages: [],
    updatedAt: new Date().toISOString(),
    pinned: false,
    archived: false,
    tags: [],
  };
}

type ProviderDraft = {
  baseUrl: string;
  apiKey: string;
  llmModel: string;
  embeddingModel: string;
};

type ProviderKey = 'siliconflow' | 'openai' | 'gemini' | 'custom_compatible';

const providerLabelMap: Record<ProviderKey, string> = {
  siliconflow: 'SiliconFlow',
  openai: 'OpenAI',
  gemini: 'Gemini',
  custom_compatible: 'Custom Compatible',
};

const providerDefaults: Record<ProviderKey, ProviderDraft> = {
  siliconflow: {
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    llmModel: 'deepseek-ai/DeepSeek-V3',
    embeddingModel: 'BAAI/bge-m3',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    llmModel: 'gpt-4.1-mini',
    embeddingModel: 'text-embedding-3-large',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: '',
    llmModel: 'gemini-2.5-pro',
    embeddingModel: 'text-embedding-004',
  },
  custom_compatible: {
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    llmModel: 'custom-llm',
    embeddingModel: 'custom-embedding',
  },
};

const fallbackProviderModelsMap: Record<ProviderKey, ProviderModelItem[]> = {
  siliconflow: [
    { id: 'deepseek-ai/DeepSeek-V3', displayName: 'DeepSeek V3', modelType: 'llm', description: '通用推理模型，适合中文问答。', isOnline: true },
    { id: 'Qwen/Qwen2.5-7B-Instruct', displayName: 'Qwen2.5 7B Instruct', modelType: 'llm', description: '轻量模型，响应速度快。', isOnline: false },
    { id: 'BAAI/bge-m3', displayName: 'BAAI bge-m3', modelType: 'embedding', description: '默认语义向量模型。', isOnline: true },
    { id: 'BAAI/bge-large-zh-v1.5', displayName: 'BAAI bge-large-zh-v1.5', modelType: 'embedding', description: '更高维度中文向量模型。', isOnline: false },
  ],
  openai: [
    { id: 'gpt-4.1-mini', displayName: 'GPT-4.1 mini', modelType: 'llm', description: '平衡成本与效果，适合大多数场景。', isOnline: true },
    { id: 'gpt-4.1', displayName: 'GPT-4.1', modelType: 'llm', description: '高质量输出，成本更高。', isOnline: true },
    { id: 'text-embedding-3-large', displayName: 'text-embedding-3-large', modelType: 'embedding', description: '高质量向量检索模型。', isOnline: true },
    { id: 'text-embedding-3-small', displayName: 'text-embedding-3-small', modelType: 'embedding', description: '轻量向量模型。', isOnline: true },
  ],
  gemini: [
    { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', modelType: 'llm', description: '大上下文能力，适合复杂分析。', isOnline: true },
    { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', modelType: 'llm', description: '高吞吐模型，适合实时交互。', isOnline: true },
    { id: 'text-embedding-004', displayName: 'text-embedding-004', modelType: 'embedding', description: 'Gemini 默认向量模型。', isOnline: true },
    { id: 'text-embedding-005', displayName: 'text-embedding-005', modelType: 'embedding', description: '新一代向量模型。', isOnline: false },
  ],
  custom_compatible: [
    { id: 'custom-llm', displayName: 'custom-llm', modelType: 'llm', description: '兼容 OpenAI 协议的自定义模型。', isOnline: false },
    { id: 'custom-llm-lite', displayName: 'custom-llm-lite', modelType: 'llm', description: '轻量自定义模型。', isOnline: false },
    { id: 'custom-embedding', displayName: 'custom-embedding', modelType: 'embedding', description: '兼容 OpenAI 协议的自定义向量模型。', isOnline: false },
    { id: 'custom-embedding-lite', displayName: 'custom-embedding-lite', modelType: 'embedding', description: '轻量自定义向量模型。', isOnline: false },
  ],
};

function inferModelType(modelType: unknown, modelId: string): 'llm' | 'embedding' {
  if (modelType === 'embedding') {
    return 'embedding';
  }
  if (modelType === 'llm') {
    return 'llm';
  }
  const normalized = modelId.toLowerCase();
  if (normalized.includes('embedding') || normalized.includes('bge')) {
    return 'embedding';
  }
  return 'llm';
}

function mapRemoteProviderModels(payload: any): ProviderModelItem[] {
  const models = Array.isArray(payload?.models) ? payload.models : [];
  return models
    .map((model: any) => {
      const id = typeof model?.modelId === 'string'
        ? model.modelId
        : typeof model?.id === 'string'
          ? model.id
          : '';
      if (!id) {
        return null;
      }
      return {
        id,
        displayName: typeof model?.displayName === 'string' && model.displayName.trim() ? model.displayName : id,
        modelType: inferModelType(model?.modelType, id),
        description: typeof model?.description === 'string' && model.description.trim() ? model.description : id,
        isOnline: Boolean(model?.isOnline),
      };
    })
    .filter((item: ProviderModelItem | null): item is ProviderModelItem => Boolean(item));
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function cloneProviderState(state: Record<ProviderKey, ProviderDraft>) {
  return JSON.parse(JSON.stringify(state)) as Record<ProviderKey, ProviderDraft>;
}

function buildSettingsDraftFromProviderState(
  state: Record<ProviderKey, ProviderDraft>,
  language: 'zh' | 'en',
  theme: 'light' | 'dark',
  storagePath: string,
  documentStoragePath: string,
): SettingsDraft {
  return {
    ui: { language, theme },
    providers: (Object.keys(state) as ProviderKey[]).map((providerId) => ({
      providerId,
      ...state[providerId],
    })),
    storage: {
      storagePath,
      documentStoragePath,
    },
  };
}


export default function App() {
  const [initialQaState] = useState(loadInitialQaState);
  const [activeTab, setActiveTab] = useState('documents');
  const [currentView, setCurrentView] = useState('list');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [highlightedSource, setHighlightedSource] = useState<{chunkId?: string; chunkIndex?: number} | null>(null);
  const [previewSource, setPreviewSource] = useState<MessageSource | null>(null);
  const [previewSourceDoc, setPreviewSourceDoc] = useState<Document | null>(null);
  const [detailBackTab, setDetailBackTab] = useState<'documents' | 'qa'>('documents');
  const qaScrollPositionsRef = useRef<Record<string, number>>({});
  const [settings, setSettings] = useState<AppSettings>({
    language: 'zh',
    baseUrl: 'https://api.siliconflow.cn/v1',
    vectorModel: 'BAAI/bge-m3',
    llmModel: 'deepseek-ai/DeepSeek-V3',
    storagePath: './data/lance',
    documentStoragePath: './data/uploads',
  });
  const [initialSettingsDraft] = useState<SettingsDraft>(() => buildSettingsDraftFromProviderState(
    cloneProviderState(providerDefaults),
    'zh',
    'light',
    './data/lance',
    './data/uploads',
  ));
  const settingsState = useSettingsState(initialSettingsDraft);
  const { draft, updateUiField, updateProviderField, updateStorageField, getModuleSaveOperation } = settingsState;
  const [activeProvider, setActiveProvider] = useState<ProviderKey>('siliconflow');
  const [providerModelsByProvider, setProviderModelsByProvider] = useState<Record<ProviderKey, ProviderModelItem[]>>(fallbackProviderModelsMap);
  const [providerActionHint, setProviderActionHint] = useState('');
  const [hasAnyApiKeyConfigured, setHasAnyApiKeyConfigured] = useState(false);
  const [revealedApiKeys, setRevealedApiKeys] = useState<Partial<Record<ProviderKey, string>>>({});
  const [revealedProviderSet, setRevealedProviderSet] = useState<Set<ProviderKey>>(new Set());
  const [storageStats, setStorageStats] = useState<{ cacheSizeBytes: number; freeSpaceBytes: number } | null>(null);
  const [documentStorageStats, setDocumentStorageStats] = useState<{ cacheSizeBytes: number; freeSpaceBytes: number } | null>(null);
  const [vectorStorageHint, setVectorStorageHint] = useState('');
  const [documentStorageHint, setDocumentStorageHint] = useState('');
  const [storagePathLocked, setStoragePathLocked] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(initialQaState.conversations);
  const [activeConversationId, setActiveConversationId] = useState<string>(initialQaState.activeConversationId);
  const activeProviderDraft = draft.providers.find((provider) => provider.providerId === activeProvider) ?? draft.providers[0];
  const activeProviderHasStoredKey =
    (typeof activeProviderDraft?.apiKey === 'string' && activeProviderDraft.apiKey.trim().length > 0)
    || hasAnyApiKeyConfigured;
  const activeProviderApiKey = revealedProviderSet.has(activeProvider)
    ? (revealedApiKeys[activeProvider] ?? activeProviderDraft?.apiKey ?? '')
    : (activeProviderDraft?.apiKey ?? '');
  const settingsController = useSettingsPageController({
    draft,
    settingsState,
    activeProvider,
    setActiveProvider,
    setSettings,
    apiUrl,
    providerLabelMap,
  });
  const latestDraftRef = useRef(draft);
  const isSettingsDirtyRef = useRef(settingsState.isDirty);
  const uiSaveQueueRef = useRef(Promise.resolve());
  const vectorHintTimerRef = useRef<number | null>(null);
  const documentHintTimerRef = useRef<number | null>(null);
  latestDraftRef.current = draft;
  isSettingsDirtyRef.current = settingsState.isDirty;

  const showVectorHint = (message: string, autoHide = true) => {
    setVectorStorageHint(message);
    if (vectorHintTimerRef.current !== null) {
      window.clearTimeout(vectorHintTimerRef.current);
      vectorHintTimerRef.current = null;
    }
    if (autoHide) {
      vectorHintTimerRef.current = window.setTimeout(() => {
        setVectorStorageHint('');
        vectorHintTimerRef.current = null;
      }, 3000);
    }
  };

  const showDocumentHint = (message: string, autoHide = true) => {
    setDocumentStorageHint(message);
    if (documentHintTimerRef.current !== null) {
      window.clearTimeout(documentHintTimerRef.current);
      documentHintTimerRef.current = null;
    }
    if (autoHide) {
      documentHintTimerRef.current = window.setTimeout(() => {
        setDocumentStorageHint('');
        documentHintTimerRef.current = null;
      }, 3000);
    }
  };

  const updateUiFieldWithImmediateSave = (field: 'language' | 'theme', value: string) => {
    const previousValue = draft.ui[field];
    if (previousValue === value) {
      return;
    }

    updateUiField(field, value);
    uiSaveQueueRef.current = uiSaveQueueRef.current
      .catch(() => undefined)
      .then(() => settingsController.saveUiFieldImmediately(field, value, previousValue))
      .then(() => undefined);
  };

  const secureGet = async (endpoint: string) => {
    return settingsFetch(apiUrl, endpoint, {
      method: 'GET',
    });
  };

  const securePost = async (endpoint: string, body: Record<string, unknown> = {}) => {
    return settingsFetch(apiUrl, endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const requestProviderPlainKey = async (providerId: ProviderKey, action: 'reveal' | 'copy') => {
    const tokenRes = await securePost(`/api/config/provider/${encodeURIComponent(providerId)}/key-token`);
    if (!tokenRes.ok) {
      throw new Error('token request failed');
    }
    const tokenData = await tokenRes.json();
    const revealRes = await securePost(`/api/config/provider/${encodeURIComponent(providerId)}/key-reveal`, {
      token: tokenData?.token,
      action,
    });
    if (!revealRes.ok) {
      throw new Error('key reveal request failed');
    }
    const revealData = await revealRes.json();
    return typeof revealData?.plainKey === 'string' ? revealData.plainKey : '';
  };

  const testProviderConnection = async () => {
    if (!activeProviderDraft) {
      return;
    }
    setProviderActionHint(locale.providerTesting);
    try {
      const response = await securePost(`/api/config/provider/${encodeURIComponent(activeProvider)}/test`, {
        baseUrl: activeProviderDraft.baseUrl,
        apiKey: activeProviderDraft.apiKey,
        llmModel: activeProviderDraft.llmModel,
        embeddingModel: activeProviderDraft.embeddingModel,
      });
      if (!response.ok) {
        throw new Error('provider test failed');
      }
      setProviderActionHint(locale.providerTestSuccess);
      settingsController.setInlineStatus({ tone: 'success', message: locale.providerTestSuccess });
    } catch {
      setProviderActionHint(locale.providerTestFailed);
      settingsController.setInlineStatus({ tone: 'error', message: locale.providerTestFailed });
    }
  };

  const toggleProviderApiKeyReveal = async () => {
    if (revealedProviderSet.has(activeProvider)) {
      setRevealedProviderSet((prev) => {
        const next = new Set(prev);
        next.delete(activeProvider);
        return next;
      });
      setProviderActionHint(locale.providerKeyHidden);
      return;
    }

    try {
      const plainKey = await requestProviderPlainKey(activeProvider, 'reveal');
      setRevealedApiKeys((prev) => ({ ...prev, [activeProvider]: plainKey }));
      setRevealedProviderSet((prev) => {
        const next = new Set(prev);
        next.add(activeProvider);
        return next;
      });
      setProviderActionHint(locale.providerKeyShown);
    } catch {
      setProviderActionHint(locale.providerKeyShowFailed);
      settingsController.setInlineStatus({ tone: 'error', message: locale.providerKeyShowFailed });
    }
  };

  const copyProviderApiKey = async () => {
    try {
      const plainKey = await requestProviderPlainKey(activeProvider, 'copy');
      if (typeof navigator?.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(plainKey);
      }
      setProviderActionHint(locale.providerKeyCopied);
      settingsController.setInlineStatus({ tone: 'success', message: locale.providerKeyCopied });
    } catch {
      setProviderActionHint(locale.providerKeyCopyFailed);
      settingsController.setInlineStatus({ tone: 'error', message: locale.providerKeyCopyFailed });
    }
  };

  const pickStorageDirectory = async (field: 'storagePath' | 'documentStoragePath') => {
    const pickerWindow = window as Window & { showDirectoryPicker?: () => Promise<{ name: string }> };
    if (typeof pickerWindow.showDirectoryPicker !== 'function') {
      if (field === 'documentStoragePath') {
        showDocumentHint(locale.dirPickerUnsupported, false);
      } else {
        showVectorHint(locale.dirPickerUnsupported, false);
      }
      return;
    }

    try {
      const handle = await pickerWindow.showDirectoryPicker();
      updateStorageField(field, `/picked/${handle.name}`);
      if (field === 'documentStoragePath') {
        showDocumentHint(locale.documentDirSelected);
      } else {
        showVectorHint(locale.vectorDirSelected);
      }
    } catch {
      if (field === 'documentStoragePath') {
        showDocumentHint(locale.dirPickCancelled);
      } else {
        showVectorHint(locale.dirPickCancelled);
      }
    }
  };

  const openStoragePath = async () => {
    try {
      const response = await securePost('/api/storage/open', { storagePath: draft.storage.storagePath });
      if (!response.ok) {
        throw new Error('open storage failed');
      }
      const payload = await response.json();
      if (payload?.stats) {
        setStorageStats(payload.stats);
      }
      if (!payload?.openedInSystem && payload?.openedPath) {
        window.open(`file://${payload.openedPath}`, '_blank');
      }
      showVectorHint(locale.vectorDirOpened);
    } catch {
      showVectorHint(locale.vectorDirOpenFailed, false);
    }
  };

  const openDocumentStoragePath = async () => {
    try {
      const response = await securePost('/api/storage/docs/open', { storagePath: draft.storage.documentStoragePath });
      if (!response.ok) {
        throw new Error('open docs storage failed');
      }
      const payload = await response.json();
      if (payload?.stats) {
        setDocumentStorageStats(payload.stats);
      }
      if (!payload?.openedInSystem && payload?.openedPath) {
        window.open(`file://${payload.openedPath}`, '_blank');
      }
      showDocumentHint(locale.documentDirOpened);
    } catch {
      showDocumentHint(locale.documentDirOpenFailed, false);
    }
  };

  const clearStorageCacheAction = async () => {
    try {
      const response = await securePost('/api/storage/cache/clear');
      if (!response.ok) {
        throw new Error('clear cache failed');
      }
      const payload = await response.json();
      if (payload?.stats) {
        setStorageStats(payload.stats);
      }
      showVectorHint(locale.vectorCacheCleared);
    } catch {
      showVectorHint(locale.vectorCacheClearFailed, false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      safeStorageSet(QA_STORAGE_KEY, JSON.stringify({ conversations, activeConversationId }));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [conversations, activeConversationId]);

  useEffect(() => {
    return () => {
      if (vectorHintTimerRef.current !== null) {
        window.clearTimeout(vectorHintTimerRef.current);
      }
      if (documentHintTimerRef.current !== null) {
        window.clearTimeout(documentHintTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeConversationId && conversations[0]?.id) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId]);

  useEffect(() => {
    let active = true;

    async function loadProviderModels() {
      try {
        const response = await secureGet(`/api/config/provider/${encodeURIComponent(activeProvider)}/models`);
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        if (!active) {
          return;
        }
        const mapped = mapRemoteProviderModels(payload);
        if (mapped.length === 0) {
          return;
        }
        setProviderModelsByProvider((prev) => ({
          ...prev,
          [activeProvider]: mapped,
        }));
      } catch {
        // Keep fallback models when remote loading is unavailable.
      }
    }

    loadProviderModels();
    return () => {
      active = false;
    };
  }, [activeProvider]);

  useEffect(() => {
    let active = true;

    async function loadStorageStats() {
      try {
        const response = await secureGet('/api/config/all');
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        const cacheSizeBytes = Number(payload?.storage?.cacheSizeBytes);
        const freeSpaceBytes = Number(payload?.storage?.freeSpaceBytes);
        const docsCacheSizeBytes = Number(payload?.storage?.documentCacheSizeBytes);
        const docsFreeSpaceBytes = Number(payload?.storage?.documentFreeSpaceBytes);
        if (!active || !Number.isFinite(cacheSizeBytes) || !Number.isFinite(freeSpaceBytes)) {
          return;
        }
        setStorageStats({ cacheSizeBytes, freeSpaceBytes });
        if (Number.isFinite(docsCacheSizeBytes) && Number.isFinite(docsFreeSpaceBytes)) {
          setDocumentStorageStats({ cacheSizeBytes: docsCacheSizeBytes, freeSpaceBytes: docsFreeSpaceBytes });
        }
      } catch {
        // Ignore stats loading failures in settings panel.
      }
    }

    loadStorageStats();
    return () => {
      active = false;
    };
  }, []);

  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaAttachedFiles, setQaAttachedFiles] = useState<File[]>([]);
  const [qaSearch, setQaSearch] = useState('');
  const [qaTagFilter, setQaTagFilter] = useState(QA_TAG_ALL);
  const [activeMenuConversationId, setActiveMenuConversationId] = useState('');
  const qaScrollRef = useRef<HTMLDivElement>(null);
  const qaFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeMenuConversationId) return;
    const closeMenu = () => setActiveMenuConversationId('');
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [activeMenuConversationId]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0] ?? null;
  const qaMessages = activeConversation?.messages ?? [];
  const allTags: string[] = Array.from(new Set(conversations.flatMap((conversation) => conversation.tags || [])));
  const visibleConversations = conversations
    .filter((conversation) => !conversation.archived)
    .filter((conversation) => {
      if (!qaSearch.trim()) return true;
      const keyword = qaSearch.trim().toLowerCase();
      const titleHit = conversation.title.toLowerCase().includes(keyword);
      const messageHit = conversation.messages.some((message) => message.content.toLowerCase().includes(keyword));
      return titleHit || messageHit;
    })
    .filter((conversation) => qaTagFilter === QA_TAG_ALL || (conversation.tags || []).includes(qaTagFilter))
    .sort((a, b) => {
      const pinDelta = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinDelta !== 0) return pinDelta;
      const bTime = Number.isFinite(new Date(b.updatedAt).getTime()) ? new Date(b.updatedAt).getTime() : 0;
      const aTime = Number.isFinite(new Date(a.updatedAt).getTime()) ? new Date(a.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

  const upsertConversation = (conversationId: string, updater: (conversation: Conversation) => Conversation) => {
    setConversations((prev) => prev.map((conversation) => (
      conversation.id === conversationId ? updater(conversation) : conversation
    )));
  };

  const createNewConversation = () => {
    const next = createConversation(locale.qaNewConversation);
    setConversations((prev) => [next, ...prev]);
    setActiveConversationId(next.id);
    setQaInput('');
  };

  const renameConversation = (conversationId: string) => {
    const target = conversations.find((conversation) => conversation.id === conversationId);
    if (!target) return;
    const title = prompt(locale.qaRenamePrompt, target.title)?.trim();
    if (!title) return;
    upsertConversation(conversationId, (conversation) => ({ ...conversation, title, updatedAt: new Date().toISOString() }));
  };

  const deleteConversation = (conversationId: string) => {
    if (!confirm(locale.qaDeleteConfirm)) return;
    setConversations((prev) => {
      const remain = prev.filter((conversation) => conversation.id !== conversationId);
      if (remain.length === 0) {
        const fallback = createConversation(locale.qaDefaultConversation);
        setActiveConversationId(fallback.id);
        return [fallback];
      }
      if (conversationId === activeConversationId) {
        setActiveConversationId(remain[0].id);
      }
      return remain;
    });
  };

  const togglePinConversation = (conversationId: string) => {
    upsertConversation(conversationId, (conversation) => ({
      ...conversation,
      pinned: !conversation.pinned,
      updatedAt: new Date().toISOString(),
    }));
  };

  const toggleArchiveConversation = (conversationId: string) => {
    setConversations((prev) => {
      const nextConversations = prev.map((conversation) => (
        conversation.id === conversationId
          ? { ...conversation, archived: !conversation.archived, updatedAt: new Date().toISOString() }
          : conversation
      ));

      if (conversationId === activeConversationId) {
        const next = nextConversations.find((conversation) => conversation.id !== conversationId && !conversation.archived);
        if (next) {
          setActiveConversationId(next.id);
        } else {
          const fallback = createConversation(locale.qaNewConversation);
          setActiveConversationId(fallback.id);
          return [fallback, ...nextConversations];
        }
      }

      return nextConversations;
    });
  };

  const addTagToConversation = (conversationId: string) => {
    const value = prompt(locale.qaAddTagPrompt)?.trim();
    if (!value) return;
    upsertConversation(conversationId, (conversation) => ({
      ...conversation,
      tags: Array.from(new Set([...(conversation.tags || []), value])),
      updatedAt: new Date().toISOString(),
    }));
  };

  useEffect(() => {
    if (activeTab !== 'qa' || currentView !== 'list') {
      return;
    }

    const node = qaScrollRef.current;
    if (!node || !activeConversationId) {
      return;
    }

    const current = qaScrollRef.current;
    if (!current) {
      return;
    }

    const nearBottom = Math.abs((current.scrollTop + current.clientHeight) - current.scrollHeight) < 24;
    const hasRemembered = typeof qaScrollPositionsRef.current[activeConversationId] === 'number';
    if (nearBottom || !hasRemembered) {
      current.scrollTop = current.scrollHeight;
      qaScrollPositionsRef.current[activeConversationId] = current.scrollTop;
    }
  }, [qaMessages]);

  useLayoutEffect(() => {
    const node = qaScrollRef.current;
    if (!node || !activeConversationId) {
      return;
    }

    const handleScroll = () => {
      qaScrollPositionsRef.current[activeConversationId] = node.scrollTop;
    };

    node.addEventListener('scroll', handleScroll, {passive: true});
    return () => {
      node.removeEventListener('scroll', handleScroll);
    };
  }, [activeConversationId, activeTab, currentView]);

  useEffect(() => {
    if (activeTab !== 'qa' || currentView !== 'list') {
      return;
    }

    const node = qaScrollRef.current;
    if (!node) {
      return;
    }

    const remembered = activeConversationId ? qaScrollPositionsRef.current[activeConversationId] : undefined;
    const target = typeof remembered === 'number' ? remembered : node.scrollHeight;

    node.scrollTop = target;
  }, [activeTab, currentView, activeConversationId]);

  useEffect(() => {
    if (activeTab !== 'documents' || currentView !== 'list' || !previewSource?.docId) {
      return;
    }

    let cancelled = false;
    fetch(apiUrl('/api/documents'))
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const docs = await response.json();
        if (cancelled || !Array.isArray(docs)) {
          return;
        }

        const matched = docs.find((doc: any) => doc?.id === previewSource.docId);
        if (!matched) {
          return;
        }

        setSelectedDoc({
          id: matched.id,
          name: typeof matched.name === 'string' ? matched.name : (previewSource.docName || '未知文档'),
          size: typeof matched.size === 'number' ? matched.size : 0,
          type: typeof matched.type === 'string' ? matched.type : '.txt',
          uploadTime: typeof matched.uploadTime === 'string' ? matched.uploadTime : new Date().toISOString(),
          status: matched.status === 'processing' || matched.status === 'failed' || matched.status === 'cancelled' ? matched.status : 'completed',
          chunkCount: typeof matched.chunkCount === 'number' ? matched.chunkCount : 0,
          description: typeof matched.description === 'string' ? matched.description : '',
        });
      })
      .catch(() => {
        // ignore hydration failure for preview source
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, currentView, previewSource]);

  const goToDetail = (doc: Document, highlight?: {chunkId?: string; chunkIndex?: number}) => {
    setDetailBackTab('documents');
    setHighlightedSource(highlight ?? null);
    setPreviewSource(null);
    setPreviewSourceDoc(null);
    setSelectedDoc(doc);
    setCurrentView('detail');
  };

  const goToList = () => {
    setSelectedDoc(null);
    setHighlightedSource(null);
    setPreviewSource(null);
    setPreviewSourceDoc(null);
    setCurrentView('list');
    setActiveTab(detailBackTab);
  };

  const openSourceInDetail = (source: MessageSource) => {
    if (!source.docId) return;

    setDetailBackTab('qa');
    setHighlightedSource(null);
    setSelectedDoc(null);
    fetch(apiUrl(`/api/documents/${source.docId}`))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('preview source doc load failed');
        }
        return response.json();
      })
      .then((data) => {
        setPreviewSourceDoc({
          id: typeof data?.id === 'string' ? data.id : source.docId!,
          name: typeof data?.name === 'string' ? data.name : (source.docName || '未知文档'),
          size: typeof data?.size === 'number' ? data.size : 0,
          type: typeof data?.type === 'string' ? data.type : '.txt',
          uploadTime: typeof data?.uploadTime === 'string' ? data.uploadTime : new Date().toISOString(),
          status: data?.status === 'processing' || data?.status === 'failed' || data?.status === 'cancelled' ? data.status : 'completed',
          chunkCount: typeof data?.chunkCount === 'number' ? data.chunkCount : 0,
          description: typeof data?.description === 'string' ? data.description : '',
        });
        setPreviewSource(source);
        setActiveTab('documents');
        setCurrentView('list');
      })
      .catch(() => {
        window.alert('对应文档不存在或已删除，无法定位溯源。');
      });
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setCurrentView('list');
  };

  const backToQaFromDetail = () => {
    setActiveTab('qa');
    setCurrentView('list');
  };

  const backToQaFromPreview = () => {
    setPreviewSource(null);
    setPreviewSourceDoc(null);
    setActiveTab('qa');
    setCurrentView('list');
  };

  const removeSourcesForDocument = (docId: string) => {
    const shouldResetDetail = selectedDoc?.id === docId;

    setConversations((prev) => prev.map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) => ({
        ...message,
        sources: message.sources?.filter((source) => source.docId !== docId) ?? message.sources,
      })),
    })));

    setPreviewSource((prev) => (prev?.docId === docId ? null : prev));
    setPreviewSourceDoc((prev) => (prev?.id === docId ? null : prev));
    setHighlightedSource(null);
    setSelectedDoc((prev) => (prev?.id === docId ? null : prev));

    if (shouldResetDetail) {
      setCurrentView('list');
      setActiveTab('documents');
    }
  };

  useEffect(() => {
    let active = true;

    async function loadModelConfig() {
      try {
        const res = await secureGet('/api/config/model');
        if (!res.ok) return;

        const data = await res.json();
        if (!active) return;
        if (isSettingsDirtyRef.current) return;

        const latestDraft = latestDraftRef.current;

        const nextProvider = {
          ...providerDefaults.siliconflow,
          baseUrl: typeof data.baseUrl === 'string' ? data.baseUrl : providerDefaults.siliconflow.baseUrl,
          llmModel: typeof data.llmModel === 'string' ? data.llmModel : providerDefaults.siliconflow.llmModel,
          embeddingModel: typeof data.embeddingModel === 'string' ? data.embeddingModel : providerDefaults.siliconflow.embeddingModel,
        };
        const nextStorage = typeof data.storagePath === 'string' ? data.storagePath : './data/lance';
        const nextDocumentStorage = typeof data.documentStoragePath === 'string' ? data.documentStoragePath : latestDraft.storage.documentStoragePath;
        const nextStorageLocked = data.storagePathLocked === true;
        const nextHasApiKey = data.hasApiKey === true;

        const nextDraft: SettingsDraft = {
          ...latestDraft,
          providers: latestDraft.providers.map((provider) => (
            provider.providerId === 'siliconflow'
              ? { ...provider, ...nextProvider }
              : provider
          )),
          storage: {
            storagePath: nextStorage,
            documentStoragePath: nextDocumentStorage,
          },
        };
        settingsState.replaceAll(nextDraft, { syncBaseline: true });

        setSettings((prev) => ({
          ...prev,
          baseUrl: nextProvider.baseUrl,
          vectorModel: nextProvider.embeddingModel,
          llmModel: nextProvider.llmModel,
          storagePath: nextStorage,
          documentStoragePath: nextDocumentStorage,
        }));
        setStoragePathLocked(nextStorageLocked);
        setHasAnyApiKeyConfigured(nextHasApiKey);

        if (nextStorageLocked) {
          setVectorStorageHint('向量库路径已由系统锁定到当前项目 data/lance，不可修改。');
          setDocumentStorageHint('文档目录路径已由系统锁定，不可修改。');
        }
      } catch {
        // Keep local fallback defaults when backend config is unavailable.
      }
    }

    loadModelConfig();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = draft.ui.language;
    document.documentElement.dataset.theme = draft.ui.theme;
  }, [draft.ui.language, draft.ui.theme]);

  const isDarkTheme = draft.ui.theme === 'dark';
  const locale = draft.ui.language === 'en'
    ? {
      appTitle: 'Knowledge Base',
      tabDocs: 'Docs',
      tabQa: 'Q&A',
      tabSettings: 'Settings',
      uploadDoc: 'Upload Document',
      uploadFeatureHint: 'instant upload/resume',
      uploadHint: 'Click or drag files here',
      uploadSupport: 'Supports .xlsx, .csv, .pdf, .docx, .json and more',
      colName: 'Name',
      colSize: 'Size',
      colType: 'Type',
      colUploadTime: 'Uploaded',
      colStatus: 'Status',
      colActions: 'Actions',
      detailAction: 'Details',
      backToDocs: 'Back to Docs',
      previewAction: 'Preview',
      deleteAction: 'Delete',
      noDocuments: 'No documents yet',
      statusProcessing: 'Processing...',
      statusCompleted: 'Completed',
      statusFailed: 'Failed',
      previewTitle: 'Document Preview',
      previewMetaSize: 'Size',
      previewMetaType: 'Type',
      previewMetaChunks: 'Chunks',
      previewNoChunks: 'No chunks yet for this document',
      previewMoreChunks: 'more chunks available, open Details to view all',
      openDetails: 'Open Details',
      close: 'Close',
      previewLocateChunk: 'Locate chunk',
      previewDownloadAction: 'Download',
      previewCloseAriaLabel: 'Close preview',
      previewLoadError: 'Failed to load preview. Please try again.',
      previewLoading: 'Loading preview...',
      previewLegacyFallback: 'This type is not available in the new preview yet. Falling back to legacy preview.',
      detailParsed: 'Parsed',
      detailDescriptionLabel: 'Document Description (Editable)',
      detailDescriptionPlaceholder: 'Add document notes...',
      detailOutlineTitle: 'Outline',
      detailNoOutline: 'No outline',
      detailSectionPrefix: 'Section',
      detailChunkTitle: 'Vector Chunks',
      detailChunkHint: 'Source jump auto-scrolls and highlights target chunk',
      detailExpand: 'Expand',
      detailCollapse: 'Collapse',
      detailChunkTag: 'Chunk',
      detailSummaryLabel: 'Summary',
      detailSectionLabel: 'Section',
      detailCopyAction: 'Copy',
      detailCopySuccess: 'Copied',
      detailDownloadAction: 'Download',
      detailShareAction: 'Share',
      detailPrintAction: 'Print',
      detailInfoTitle: 'Document Info',
      detailInfoSize: 'Size',
      detailInfoType: 'Type',
      detailInfoUploadTime: 'Uploaded',
      detailInfoChunkCount: 'Chunks',
      detailInfoCharCount: 'Characters',
      qaConversations: 'Conversations',
      qaSearchPlaceholder: 'Search sessions or messages',
      qaTagAll: 'All',
      qaNoConversationResult: 'No matching session. Try another keyword or tag.',
      qaMenuRename: 'Rename',
      qaMenuPin: 'Pin',
      qaMenuUnpin: 'Unpin',
      qaMenuArchive: 'Archive',
      qaMenuUnarchive: 'Unarchive',
      qaMenuAddTag: 'Add tag',
      qaMenuDelete: 'Delete',
      qaNewConversation: 'New Conversation',
      qaDefaultConversation: 'Default Conversation',
      qaEmptyHint: 'Start a new session, or use one of these prompts:',
      qaStarterPrompts: [
        'Summarize key points from my latest uploads',
        'What topics are mentioned most in this knowledge base?',
        'Create a 3-step learning plan based on these docs',
      ],
      qaSourcePrefix: 'Source',
      qaSourceSectionTitle: 'Related document sources',
      qaSourceExpand: 'Expand sources',
      qaSourceCollapse: 'Collapse sources',
      qaSourceUnknownDoc: 'Unknown document',
      qaThinking: 'AI is thinking...',
      qaUploadAttachment: 'Upload attachment',
      qaDragHint: 'You can also drag files into the input area',
      qaInputPlaceholder: 'Type your question, press Enter to send...',
      qaTitlePlaceholder: 'Edit conversation title',
      qaVectorStatus: 'Vector Retrieval: Idle',
      qaLlmStatus: 'LLM: Healthy',
      qaMcpStatusStreaming: 'MCP Stream: Streaming',
      qaMcpStatusIdle: 'MCP Stream: Idle',
      qaRenamePrompt: 'Enter a new session title',
      qaDeleteConfirm: 'Delete this session?',
      qaAddTagPrompt: 'Enter a tag (e.g. work/study/test)',
      streamFallbackNoAnswer: 'Sorry, I could not answer this question.',
      streamFallbackError: 'Sorry, the service is currently unavailable. Please check model settings and API key.',
      uploadExists: 'File already exists',
      deleteDocConfirm: 'Delete this document?',
      retryAction: 'Retry',
      providerTesting: 'Testing connection...',
      providerTestSuccess: 'Connection successful',
      providerTestFailed: 'Connection failed',
      providerKeyHidden: 'API key hidden',
      providerKeyShown: 'API key visible',
      providerKeyShowFailed: 'Failed to show API key',
      providerKeyCopied: 'API key copied',
      providerKeyCopyFailed: 'Failed to copy API key',
      dirPickerUnsupported: 'Directory picker is not supported in this environment. Please input a path manually.',
      documentDirSelected: 'Document directory selected.',
      vectorDirSelected: 'Vector directory selected.',
      dirPickCancelled: 'Directory selection cancelled.',
      vectorDirOpened: 'Vector directory opened.',
      vectorDirOpenFailed: 'Failed to open vector directory. Check path or system permission.',
      documentDirOpened: 'Document directory opened.',
      documentDirOpenFailed: 'Failed to open document directory. Check path or system permission.',
      vectorCacheCleared: 'Vector cache cleared.',
      vectorCacheClearFailed: 'Failed to clear vector cache. Please try again.',
    }
    : {
      appTitle: '本地知识库',
      tabDocs: '文档库',
      tabQa: '问答',
      tabSettings: '设置',
      uploadDoc: '上传文档',
      uploadFeatureHint: '支持秒传/断点续传',
      uploadHint: '点击或将文件拖拽到这里上传',
      uploadSupport: '支持 .xlsx, .csv, .pdf, .docx, .json 等格式',
      colName: '文件名',
      colSize: '文件大小',
      colType: '类型',
      colUploadTime: '上传时间',
      colStatus: '状态',
      colActions: '操作',
      detailAction: '详情',
      backToDocs: '返回文档库',
      previewAction: '预览',
      deleteAction: '删除',
      noDocuments: '暂无文档',
      statusProcessing: '解析中...',
      statusCompleted: '已完成',
      statusFailed: '失败',
      previewTitle: '文档预览',
      previewMetaSize: '大小',
      previewMetaType: '类型',
      previewMetaChunks: '分块',
      previewNoChunks: '该文档暂无分块数据',
      previewMoreChunks: '个分块，点击「详情」查看全部',
      openDetails: '查看详情',
      close: '关闭',
      previewLocateChunk: '定位分块',
      previewDownloadAction: '下载',
      previewCloseAriaLabel: '关闭预览',
      previewLoadError: '预览加载失败，请稍后重试。',
      previewLoading: '预览加载中...',
      previewLegacyFallback: '当前类型暂不支持新预览，已回退到旧版预览。',
      detailParsed: '已解析',
      detailDescriptionLabel: '文档描述 (可编辑)',
      detailDescriptionPlaceholder: '添加文档描述...',
      detailOutlineTitle: '目录大纲',
      detailNoOutline: '暂无目录',
      detailSectionPrefix: '章节',
      detailChunkTitle: '向量分块列表',
      detailChunkHint: '点击溯源后将自动定位并高亮对应分块',
      detailExpand: '展开全文',
      detailCollapse: '收起',
      detailChunkTag: '分块',
      detailSummaryLabel: '摘要',
      detailSectionLabel: '所属章节',
      detailCopyAction: '复制',
      detailCopySuccess: '复制成功',
      detailDownloadAction: '下载',
      detailShareAction: '分享',
      detailPrintAction: '打印',
      detailInfoTitle: '文档信息',
      detailInfoSize: '大小',
      detailInfoType: '类型',
      detailInfoUploadTime: '上传时间',
      detailInfoChunkCount: '分块总数',
      detailInfoCharCount: '字数统计',
      qaConversations: '会话列表',
      qaSearchPlaceholder: '搜索会话或内容',
      qaTagAll: '全部',
      qaNoConversationResult: '没有匹配的会话，试试换个关键词或标签。',
      qaMenuRename: '重命名',
      qaMenuPin: '置顶会话',
      qaMenuUnpin: '取消置顶',
      qaMenuArchive: '归档会话',
      qaMenuUnarchive: '取消归档',
      qaMenuAddTag: '添加标签',
      qaMenuDelete: '删除会话',
      qaNewConversation: '新建会话',
      qaDefaultConversation: '默认会话',
      qaEmptyHint: '开始一个新会话吧，或者直接点一个快捷问题：',
      qaStarterPrompts: ['帮我总结最近上传的文档重点', '这个知识库里最常被提到的主题是什么', '给我列一个 3 步学习计划'],
      qaSourcePrefix: '源',
      qaSourceSectionTitle: '📚 相关文档来源',
      qaSourceExpand: '展开溯源',
      qaSourceCollapse: '收起溯源',
      qaSourceUnknownDoc: '未知文档',
      qaThinking: 'AI 正在思考中...',
      qaUploadAttachment: '上传附件',
      qaDragHint: '将文件拖拽至输入框也可直接解析',
      qaInputPlaceholder: '请输入问题，按 Enter 发送...',
      qaTitlePlaceholder: '编辑会话标题',
      qaVectorStatus: '向量检索: 待机',
      qaLlmStatus: 'LLM 连接: 正常',
      qaMcpStatusStreaming: 'MCP 流式状态: 传输中',
      qaMcpStatusIdle: 'MCP 流式状态: 空闲',
      qaRenamePrompt: '请输入新的会话标题',
      qaDeleteConfirm: '确定删除该会话吗？',
      qaAddTagPrompt: '输入标签（例如：工作/学习/测试）',
      streamFallbackNoAnswer: '抱歉，我无法回答这个问题。',
      streamFallbackError: '抱歉，服务出现错误，请检查硅基流动配置与 API Key。',
      uploadExists: '文件已存在',
      deleteDocConfirm: '确定删除此文档吗？',
      retryAction: '重试',
      providerTesting: '连接测试中...',
      providerTestSuccess: '连接测试成功',
      providerTestFailed: '连接测试失败',
      providerKeyHidden: '已隐藏 API Key',
      providerKeyShown: '已显示 API Key',
      providerKeyShowFailed: '显示 API Key 失败',
      providerKeyCopied: 'API Key 已复制',
      providerKeyCopyFailed: 'API Key 复制失败',
      dirPickerUnsupported: '当前环境不支持目录选择器，请手动输入路径。',
      documentDirSelected: '文档目录已选择。',
      vectorDirSelected: '向量目录已选择。',
      dirPickCancelled: '目录选择已取消。',
      vectorDirOpened: '向量目录已打开。',
      vectorDirOpenFailed: '打开向量目录失败，请检查路径或系统权限。',
      documentDirOpened: '文档目录已打开。',
      documentDirOpenFailed: '打开文档目录失败，请检查路径或系统权限。',
      vectorCacheCleared: '向量缓存已清理。',
      vectorCacheClearFailed: '清理向量缓存失败，请稍后重试。',
    };

  // --- Page: Document List ---
  const DocumentList = () => (
      <DocumentListPanel
      isDarkTheme={isDarkTheme}
      language={draft.ui.language as 'zh' | 'en'}
      locale={locale}
      apiUrl={apiUrl}
      onOpenDetail={goToDetail}
      onBackToQa={detailBackTab === 'qa' ? backToQaFromPreview : undefined}
        previewRequest={previewSource}
        previewRequestDoc={previewSourceDoc}
        onPreviewRequestHandled={() => {
          setPreviewSource(null);
          setPreviewSourceDoc(null);
        }}
        onDocumentDeleted={removeSourcesForDocument}
      />
  );

  // --- Page: Document Detail ---
  const DocumentDetail = () => {
    const [details, setDetails] = useState<Document & { chunks: Chunk[] } | null>(null);

    useEffect(() => {
      if (selectedDoc) {
        fetch(apiUrl(`/api/documents/${selectedDoc.id}`))
          .then(res => res.json())
          .then(setDetails);
      }
    }, [selectedDoc?.id]);

    if (!details) return <div className={cn('flex-1 flex items-center justify-center', isDarkTheme ? 'bg-slate-950 text-slate-200' : '')}><Loader2 className="animate-spin" /></div>;

    const saveDescription = async (description: string) => {
      try {
        const res = await fetch(apiUrl(`/api/documents/${details.id}/description`), {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({description}),
        });
        if (!res.ok) {
          throw new Error('save description failed');
        }
        setDetails((prev) => (prev ? {...prev, description} : prev));
        setSelectedDoc((prev) => (prev ? {...prev, description} : prev));
      } catch (e) {
        console.error(e);
      }
    };

    const handleRechunk = async () => {
      try {
        const res = await fetch(apiUrl(`/api/documents/${details.id}/rechunk`), { method: 'POST' });
        if (!res.ok) throw new Error('rechunk failed');
        const refreshed = await fetch(apiUrl(`/api/documents/${details.id}`)).then((r) => r.json());
        setDetails(refreshed);
      } catch (error) {
        console.error(error);
      }
    };

    const handleExportChunks = async () => {
      try {
        const res = await fetch(apiUrl(`/api/documents/${details.id}/chunks/export`));
        if (!res.ok) throw new Error('export failed');
        const payload = await res.json();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${details.name.replace(/\.[^.]+$/, '')}-chunks.json`;
        link.click();
        URL.revokeObjectURL(link.href);
      } catch (error) {
        console.error(error);
      }
    };

    return (
      <DocumentDetailPanel
        isDarkTheme={isDarkTheme}
        details={details}
        locale={{
          backToDocs: locale.backToDocs,
          tabSettings: locale.tabSettings,
          detailParsed: locale.detailParsed,
          previewMetaChunks: locale.previewMetaChunks,
          detailDescriptionLabel: locale.detailDescriptionLabel,
          detailDescriptionPlaceholder: locale.detailDescriptionPlaceholder,
          detailOutlineTitle: locale.detailOutlineTitle,
          detailNoOutline: locale.detailNoOutline,
          detailSectionPrefix: locale.detailSectionPrefix,
          detailChunkTitle: locale.detailChunkTitle,
          detailChunkHint: locale.detailChunkHint,
          detailChunkTag: locale.detailChunkTag,
          detailExpand: locale.detailExpand,
          detailCollapse: locale.detailCollapse,
          detailSummaryLabel: locale.detailSummaryLabel,
          detailSectionLabel: locale.detailSectionLabel,
          detailCopyAction: locale.detailCopyAction,
          detailCopySuccess: locale.detailCopySuccess,
          detailDownloadAction: locale.detailDownloadAction,
          detailShareAction: locale.detailShareAction,
          detailPrintAction: locale.detailPrintAction,
          detailInfoTitle: locale.detailInfoTitle,
          detailInfoSize: locale.detailInfoSize,
          detailInfoType: locale.detailInfoType,
          detailInfoUploadTime: locale.detailInfoUploadTime,
          detailInfoChunkCount: locale.detailInfoChunkCount,
          detailInfoCharCount: locale.detailInfoCharCount,
        }}
        highlightedChunkId={highlightedSource?.chunkId ?? null}
        highlightedChunkIndex={highlightedSource?.chunkIndex ?? null}
        onSaveDescription={saveDescription}
        onBack={goToList}
        onOpenSettings={() => handleTabChange('settings')}
        onRechunk={handleRechunk}
        onExportChunks={handleExportChunks}
        onBackToQa={detailBackTab === 'qa' ? backToQaFromDetail : undefined}
      />
    );
  };

  // --- Page: Q&A ---
  const QAPage = () => {
    const handleQAFileUpload = async (files: FileList) => {
      for (const file of Array.from(files)) {
        setQaAttachedFiles((prev) => [...prev, file]);
        const formData = new FormData();
        formData.append('file', file);
        try {
          await fetch(apiUrl('/api/upload'), { method: 'POST', body: formData });
        } catch (e) {
          console.error(e);
        }
      }
    };

    const handleSend = async () => {
      if (!qaInput.trim() || qaLoading || !activeConversation) return;

      const currentConversationId = activeConversation.id;
      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: qaInput,
        timestamp: new Date().toISOString(),
      };
      const assistantId = `${Date.now() + 1}`;
      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        sources: [],
      };

      const history = activeConversation.messages.map((message) => ({ role: message.role, content: message.content }));
      upsertConversation(currentConversationId, (conversation) => {
        const nextMessages = [...conversation.messages, userMsg, assistantMsg];
        const shouldAutoRename = conversation.messages.length === 0 || conversation.title === QA_EMPTY_TITLE || conversation.title === locale.qaNewConversation;
        const nextTitle = shouldAutoRename ? extractConversationTitle(userMsg.content) : conversation.title;
        return {
          ...conversation,
          title: nextTitle || conversation.title,
          messages: nextMessages,
          updatedAt: new Date().toISOString(),
        };
      });

      const userInput = qaInput;
      setQaInput('');
      setQaLoading(true);

      let buffer = '';
      let hasContent = false;
      let pendingDelta = '';
      let flushTimer: number | null = null;
      let hasStreamFailure = false;

      const updateAssistant = (updater: (message: Message) => Message, touchUpdatedAt = false) => {
        upsertConversation(currentConversationId, (conversation) => ({
          ...conversation,
          messages: conversation.messages.map((message) => (message.id === assistantId ? updater(message) : message)),
          updatedAt: touchUpdatedAt ? new Date().toISOString() : conversation.updatedAt,
        }));
      };

      const flushPendingDelta = (touchUpdatedAt = false) => {
        if (!pendingDelta) return;
        const delta = pendingDelta;
        pendingDelta = '';
        updateAssistant((message) => ({ ...message, content: `${message.content}${delta}` }), touchUpdatedAt);
      };

      const finalizeStreamState = (commitPendingDelta: boolean) => {
        if (flushTimer !== null) {
          window.clearTimeout(flushTimer);
          flushTimer = null;
        }

        if (commitPendingDelta) {
          flushPendingDelta(true);
          return;
        }

        pendingDelta = '';
      };

      const scheduleDeltaFlush = () => {
        if (flushTimer !== null) return;
        flushTimer = window.setTimeout(() => {
          flushTimer = null;
          if (hasStreamFailure) {
            pendingDelta = '';
            return;
          }
          flushPendingDelta();
        }, 32);
      };

      try {
        const res = await fetch(apiUrl('/api/mcp'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: assistantId,
            method: 'chat.stream',
            params: { message: userInput, history },
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error('stream unavailable');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;

          buffer += decoder.decode(value, { stream: true });
          const parsed = parseMcpJsonLineBuffer(buffer);
          buffer = parsed.rest;

          for (const event of parsed.messages) {
            if (event?.method === 'chat.delta' && typeof event.params?.content === 'string') {
              hasContent = true;
              pendingDelta += event.params.content;
              scheduleDeltaFlush();
            }
            if (event?.method === 'chat.sources' && Array.isArray(event.params?.sources)) {
              flushPendingDelta();
              updateAssistant((message) => ({ ...message, sources: event.params.sources }), true);
            }
            if (event?.method === 'chat.error') {
              throw new Error(typeof event.params?.message === 'string' ? event.params.message : 'stream failed');
            }
          }
        }

        buffer += decoder.decode();
        if (buffer) {
          const parsed = parseMcpJsonLineBuffer(`${buffer}\n`);
          for (const event of parsed.messages) {
            if (event?.method === 'chat.delta' && typeof event.params?.content === 'string') {
              hasContent = true;
              pendingDelta += event.params.content;
            }
            if (event?.method === 'chat.sources' && Array.isArray(event.params?.sources)) {
              flushPendingDelta();
              updateAssistant((message) => ({ ...message, sources: event.params.sources }), true);
            }
          }
        }

        finalizeStreamState(true);

        if (!hasContent) {
          updateAssistant((message) => ({ ...message, content: locale.streamFallbackNoAnswer }), true);
        }
      } catch {
        hasStreamFailure = true;
        upsertConversation(currentConversationId, (conversation) => ({
          ...conversation,
          messages: conversation.messages.map((message) => (
            message.id === assistantId
              ? { ...message, content: locale.streamFallbackError }
              : message
          )),
          updatedAt: new Date().toISOString(),
        }));
      } finally {
        finalizeStreamState(!hasStreamFailure);
        setQaLoading(false);
      }
    };

    return (
      <QAPagePanel
        isDarkTheme={isDarkTheme}
        language={draft.ui.language as 'zh' | 'en'}
        locale={locale}
        activeConversationId={activeConversationId}
        qaSearch={qaSearch}
        qaTagFilter={qaTagFilter}
        activeConversationTitle={activeConversation?.title || locale.qaNewConversation}
        allTags={allTags}
        visibleConversations={visibleConversations}
        activeMenuConversationId={activeMenuConversationId}
        qaMessages={qaMessages}
        qaLoading={qaLoading}
        qaInput={qaInput}
        qaAttachedFiles={qaAttachedFiles}
        llmModel={settings.llmModel}
        hasActiveConversation={Boolean(activeConversation)}
        qaFileInputRef={qaFileInputRef}
        qaScrollRef={qaScrollRef}
        onSetQaSearch={setQaSearch}
        onSetQaTagFilter={setQaTagFilter}
        onUpdateActiveConversationTitle={() => {}}
        onSelectConversation={setActiveConversationId}
        onToggleConversationMenu={(conversationId) => setActiveMenuConversationId((prev) => (prev === conversationId ? '' : conversationId))}
        onRenameConversation={(conversationId) => { renameConversation(conversationId); setActiveMenuConversationId(''); }}
        onTogglePinConversation={(conversationId) => { togglePinConversation(conversationId); setActiveMenuConversationId(''); }}
        onToggleArchiveConversation={(conversationId) => { toggleArchiveConversation(conversationId); setActiveMenuConversationId(''); }}
        onAddTagToConversation={(conversationId) => { addTagToConversation(conversationId); setActiveMenuConversationId(''); }}
        onDeleteConversation={(conversationId) => { deleteConversation(conversationId); setActiveMenuConversationId(''); }}
        onCreateNewConversation={createNewConversation}
        onSetQaInput={setQaInput}
        onRemoveAttachedFile={(index) => setQaAttachedFiles((prev) => prev.filter((_, idx) => idx !== index))}
        onHandleQAFileUpload={handleQAFileUpload}
        onOpenSource={openSourceInDetail}
        onSend={handleSend}
      />
    );
  };

  // --- Page: Settings ---
  const SettingsPage = () => {
    const vectorStorageStatsText = storageStats
      ? (draft.ui.language === 'en'
        ? `Cache usage: ${formatBytes(storageStats.cacheSizeBytes)} · Free space: ${formatBytes(storageStats.freeSpaceBytes)}`
        : `缓存占用: ${formatBytes(storageStats.cacheSizeBytes)} · 可用空间: ${formatBytes(storageStats.freeSpaceBytes)}`)
      : (draft.ui.language === 'en' ? 'Cache usage: --' : '缓存占用: --');
    const docsStorageStatsText = documentStorageStats
      ? (draft.ui.language === 'en'
        ? `Directory usage: ${formatBytes(documentStorageStats.cacheSizeBytes)} · Free space: ${formatBytes(documentStorageStats.freeSpaceBytes)}`
        : `目录占用: ${formatBytes(documentStorageStats.cacheSizeBytes)} · 可用空间: ${formatBytes(documentStorageStats.freeSpaceBytes)}`)
      : (draft.ui.language === 'en' ? 'Directory usage: --' : '目录占用: --');

    return (
      <SettingsPagePanel
        draft={draft}
        activeProvider={activeProvider}
        providerLabelMap={providerLabelMap}
        activeProviderDraft={activeProviderDraft}
        activeProviderApiKey={activeProviderApiKey}
        hasApiKeyConfigured={activeProviderHasStoredKey}
        providerModelsByProvider={providerModelsByProvider}
        fallbackProviderModelsMap={fallbackProviderModelsMap}
        revealedProviderSet={revealedProviderSet as Set<string>}
        providerActionHint={providerActionHint}
        vectorStorageHint={vectorStorageHint}
        documentStorageHint={documentStorageHint}
        vectorStorageStatsText={vectorStorageStatsText}
        docsStorageStatsText={docsStorageStatsText}
        storageLocked={storagePathLocked}
        settingsController={settingsController}
        updateUiFieldWithImmediateSave={updateUiFieldWithImmediateSave}
        updateProviderField={updateProviderField as any}
        updateStorageField={updateStorageField}
        pickStorageDirectory={pickStorageDirectory}
        openStoragePath={openStoragePath}
        openDocumentStoragePath={openDocumentStoragePath}
        clearStorageCacheAction={clearStorageCacheAction}
        testProviderConnection={testProviderConnection}
        toggleProviderApiKeyReveal={toggleProviderApiKeyReveal}
        copyProviderApiKey={copyProviderApiKey}
      />
    );
  };

  return (
    <AppShell
      activeTab={activeTab}
      currentView={currentView}
      isDarkTheme={isDarkTheme}
      locale={{
        appTitle: locale.appTitle,
        tabDocs: locale.tabDocs,
        tabQa: locale.tabQa,
        tabSettings: locale.tabSettings,
      }}
      onTabChange={handleTabChange}
    >
      {currentView === 'detail' && <DocumentDetail />}
      {currentView === 'list' && activeTab === 'documents' && DocumentList()}
      {currentView === 'list' && activeTab === 'qa' && QAPage()}
      {currentView === 'list' && activeTab === 'settings' && SettingsPage()}

    </AppShell>
  );
}
