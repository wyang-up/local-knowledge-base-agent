import type express from 'express';
import axios from 'axios';
import { createSettingsAuditContext, createSettingsSecurityMiddleware, getSettingsAuthBootstrapTokens } from './settings-auth.ts';
import { createKeySecurityService, type KeySecurityService, type RevealAction } from './key-security.ts';
import { getSettingsStore, handleSettingsRouteError, parseExpectedVersion, parseOptionalStoragePath } from './settings-store.ts';
import { clearStorageCache, collectStorageStats, openDirectoryInSystem, persistStorageStats, resolvePersistedStoragePath } from '../storage/storage-bridge.ts';
import { PROVIDER_IDS, type ProviderId } from './settings-types.ts';
import { validateProviderSettings } from './settings-validators.ts';

type RuntimeConfig = {
  baseUrl: string;
  embeddingModel: string;
  llmModel: string;
  apiKey: string;
  storagePath: string;
  documentStoragePath: string;
};

const PROVIDER_TEST_TIMEOUT_MS = 10_000;
const PROVIDER_TEST_BACKOFF_MS = 500;
const PROVIDER_TEST_ATTEMPTS = 2;
const PROVIDER_MODELS_TIMEOUT_MS = 10_000;

export type RegisterSettingsRoutesOptions = {
  storagePath: string;
  documentStoragePath?: string;
  getRuntimeConfig: (db: any) => Promise<RuntimeConfig>;
  keySecurity?: KeySecurityService;
};

export function registerSettingsRoutes(app: express.Express, db: any, options: RegisterSettingsRoutesOptions) {
  const settingsStorePromise = getSettingsStore(db, {
    storagePath: options.storagePath,
    documentStoragePath: options.documentStoragePath ?? options.storagePath,
  });
  const keySecurity = options.keySecurity ?? createKeySecurityService();
  app.use(createSettingsSecurityMiddleware());

  app.get('/api/settings/auth/bootstrap', (_req, res) => {
    const tokens = getSettingsAuthBootstrapTokens();
    if (!tokens) {
      res.status(404).json({ code: 'NOT_FOUND' });
      return;
    }
    res.json(tokens);
  });

  app.get('/api/config/model', async (req, res) => {
    const config = await options.getRuntimeConfig(db);
    res.json({
      baseUrl: config.baseUrl,
      embeddingModel: config.embeddingModel,
      llmModel: config.llmModel,
      storagePath: config.storagePath,
      documentStoragePath: config.documentStoragePath,
      readOnly: true,
      hasApiKey: Boolean(config.apiKey),
    });
  });

  app.post('/api/config/apikey', async (req, res) => {
    try {
      const audit = createSettingsAuditContext(req);
      const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
      if (!apiKey) {
        return res.status(400).json({ error: 'API Key 不能为空' });
      }

      await db.run('UPDATE model_config SET api_key = ?, updated_at = ? WHERE id = 1', [apiKey, new Date().toISOString()]);
      const settingsStore = await settingsStorePromise;
      await settingsStore.syncLegacyApiKey(apiKey);
      res.json({ success: true, audit });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });

  app.get('/api/config/all', async (req, res) => {
    try {
      const settingsStore = await settingsStorePromise;
      const payload = await settingsStore.getAllConfig();
      res.json(payload);
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });

  app.patch('/api/config/ui', async (req, res) => {
    try {
      const audit = createSettingsAuditContext(req);
      const settingsStore = await settingsStorePromise;
      const ui = await settingsStore.patchUiConfig({
        language: req.body?.language,
        theme: req.body?.theme,
      });
      res.json({ ui, audit });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });

  app.patch('/api/config/provider/:providerId', async (req, res) => {
    try {
      const audit = createSettingsAuditContext(req);
      const settingsStore = await settingsStorePromise;
      const expectedVersion = parseExpectedVersion(req.body?.expectedVersion);
      const provider = await settingsStore.patchProviderConfig(
        req.params.providerId,
        {
          baseUrl: req.body?.baseUrl,
          llmModel: req.body?.llmModel,
          embeddingModel: req.body?.embeddingModel,
          apiKey: req.body?.apiKey,
        },
        expectedVersion,
      );
      res.json({ provider, audit });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });

  app.post('/api/config/provider/:providerId/test', async (req, res) => {
    try {
      const providerId = parseProviderId(req.params.providerId);
      const baseUrl = readTrimmedString(req.body?.baseUrl);
      const apiKey = readTrimmedString(req.body?.apiKey);
      const llmModel = readTrimmedString(req.body?.llmModel);
      const embeddingModel = readTrimmedString(req.body?.embeddingModel);

      if (!llmModel || !embeddingModel) {
        const error: any = new Error('llmModel and embeddingModel are required');
        error.status = 400;
        error.code = 'MODEL_NOT_FOUND';
        throw error;
      }

      const validation = await validateProviderSettings({
        providerId,
        baseUrl,
        apiKey,
      });

      if (!validation.valid) {
        const firstError = validation.errors[0];
        const error: any = new Error(firstError?.message || 'provider configuration is invalid');
        error.status = 400;
        error.code = firstError?.code || 'INTERNAL_ERROR';
        throw error;
      }

      await runProviderConnectivityTest({
        baseUrl,
        apiKey,
      });

      res.json({ success: true });
    } catch (error) {
      handleSettingsRouteError(mapProviderTestConnectionError(error), res);
    }
  });

  app.get('/api/config/provider/:providerId/models', async (req, res) => {
    try {
      const providerId = parseProviderId(req.params.providerId);
      const settingsStore = await settingsStorePromise;
      const all = await settingsStore.getAllConfig();
      const provider = all.providers.find((item) => item.providerId === providerId);
      if (!provider) {
        const error: any = new Error(`provider not found: ${providerId}`);
        error.status = 404;
        error.code = 'PROVIDER_NOT_FOUND';
        throw error;
      }

      const remoteModels = await fetchProviderModelsRemote(
        provider.baseUrl,
        provider.hasKey ? await loadProviderApiKey(db, providerId) : '',
      );
      if (remoteModels.length > 0) {
        const checkedAt = new Date().toISOString();
        const syncedModels = remoteModels.map((model) => ({
          ...model,
          lastCheckedAt: checkedAt,
        }));
        await settingsStore.replaceProviderModelCatalog(providerId, syncedModels, checkedAt);
        res.json({
          models: syncedModels,
          source: 'remote',
          isStale: false,
        });
        return;
      }

      throw new Error('provider models payload is empty');
    } catch (error) {
      if (isMappedRouteError(error)) {
        handleSettingsRouteError(error, res);
        return;
      }

      const degraded = mapProviderModelsDegradedState(error);

      try {
        const providerId = parseProviderId(req.params.providerId);
        const settingsStore = await settingsStorePromise;
        const cachedModels = await settingsStore.getProviderModelCatalog(providerId);
        if (cachedModels.length > 0) {
          res.json({
            models: cachedModels,
            source: 'cache',
            isStale: true,
            degradedReason: degraded.degradedReason,
            errorCode: degraded.errorCode,
          });
          return;
        }

        const all = await settingsStore.getAllConfig();
        const provider = all.providers.find((item) => item.providerId === providerId);
        if (!provider) {
          const providerMissing: any = new Error(`provider not found: ${providerId}`);
          providerMissing.status = 404;
          providerMissing.code = 'PROVIDER_NOT_FOUND';
          throw providerMissing;
        }

        res.json({
          models: buildDeterministicFallbackModels(provider),
          source: 'cache',
          isStale: true,
          degradedReason: degraded.degradedReason,
          errorCode: degraded.errorCode,
        });
      } catch (fallbackError) {
        handleSettingsRouteError(fallbackError, res);
      }
    }
  });

  app.post('/api/config/provider/:providerId/key-token', async (req, res) => {
    try {
      const audit = createSettingsAuditContext(req);
      const providerId = req.params.providerId;
      const settingsStore = await settingsStorePromise;
      const all = await settingsStore.getAllConfig();
      const provider = all.providers.find((item) => item.providerId === providerId);
      if (!provider) {
        const error: any = new Error(`provider not found: ${providerId}`);
        error.status = 404;
        error.code = 'PROVIDER_NOT_FOUND';
        throw error;
      }

      const tokenPayload = keySecurity.issueToken(providerId);
      res.json({
        ...tokenPayload,
        requestId: audit.requestId,
      });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });

  app.post('/api/config/provider/:providerId/key-reveal', async (req, res) => {
    try {
      const audit = createSettingsAuditContext(req);
      const providerId = req.params.providerId;
      const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
      if (!token) {
        const error: any = new Error('token is required');
        error.status = 400;
        error.code = 'KEY_TOKEN_REQUIRED';
        throw error;
      }

      const rawAction = req.body?.action;
      if (rawAction !== 'reveal' && rawAction !== 'copy') {
        const error: any = new Error('action must be reveal or copy');
        error.status = 400;
        error.code = 'KEY_ACTION_INVALID';
        throw error;
      }

      const action: RevealAction = rawAction;
      const payload = await keySecurity.revealKey({
        providerId,
        token,
        action,
        requestId: audit.requestId,
        actor: audit.actor,
        loadProviderKey: async () => {
          const row = await db.get('SELECT api_key FROM provider_configs WHERE provider_id = ?', [providerId]);
          if (!row) {
            const error: any = new Error(`provider not found: ${providerId}`);
            error.status = 404;
            error.code = 'PROVIDER_NOT_FOUND';
            throw error;
          }

          const apiKey = typeof row.api_key === 'string' ? row.api_key.trim() : '';
          if (!apiKey) {
            const error: any = new Error('provider key is not configured');
            error.status = 400;
            error.code = 'KEY_NOT_CONFIGURED';
            throw error;
          }

          return apiKey;
        },
      });

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.json({
        plainKey: payload.plainKey,
        requestId: audit.requestId,
      });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });

  app.patch('/api/config/storage', async (req, res) => {
    try {
      const audit = createSettingsAuditContext(req);
      const settingsStore = await settingsStorePromise;
      const expectedVersion = parseExpectedVersion(req.body?.expectedVersion);
      const storage = await settingsStore.patchStorageConfig(
        {
          storagePath: parseOptionalStoragePath(req.body?.storagePath),
          documentStoragePath: parseOptionalStoragePath(req.body?.documentStoragePath),
        },
        expectedVersion,
      );
      res.json({ storage, audit });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });

  app.post('/api/storage/open', async (req, res) => {
    try {
      const settingsStore = await settingsStorePromise;
      const requestedStoragePath = parseOptionalStoragePath(req.body?.storagePath);
      const openedPath = await resolvePersistedStoragePath(settingsStore, requestedStoragePath);
      const openedInSystem = await openDirectoryInSystem(openedPath);

      const stats = await collectStorageStats(openedPath);
      await persistStorageStats(db, stats);

      res.json({
        success: true,
        openedPath,
        openedInSystem,
        stats,
      });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });

  app.post('/api/storage/docs/open', async (req, res) => {
    try {
      const settingsStore = await settingsStorePromise;
      const requestedStoragePath = parseOptionalStoragePath(req.body?.storagePath);
      const openedPath = await resolvePersistedStoragePath(settingsStore, requestedStoragePath, 'document');
      const openedInSystem = await openDirectoryInSystem(openedPath);
      const stats = await collectStorageStats(openedPath);

      res.json({
        success: true,
        openedPath,
        openedInSystem,
        stats,
      });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });

  app.post('/api/storage/cache/clear', async (req, res) => {
    try {
      const settingsStore = await settingsStorePromise;
      const storagePath = await resolvePersistedStoragePath(settingsStore);
      const result = await clearStorageCache(storagePath);
      await persistStorageStats(db, result.stats);

      res.json({
        success: true,
        reclaimedBytes: result.reclaimedBytes,
        stats: result.stats,
      });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });
}

function readTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseProviderId(rawProviderId: string): ProviderId {
  if ((PROVIDER_IDS as readonly string[]).includes(rawProviderId)) {
    return rawProviderId as ProviderId;
  }

  const error: any = new Error(`provider not found: ${rawProviderId}`);
  error.status = 404;
  error.code = 'PROVIDER_NOT_FOUND';
  throw error;
}

async function runProviderConnectivityTest(params: { baseUrl: string; apiKey: string }) {
  const endpoint = `${params.baseUrl.replace(/\/$/, '')}/models`;

  for (let attempt = 0; attempt < PROVIDER_TEST_ATTEMPTS; attempt += 1) {
    try {
      await axios.get(endpoint, {
        timeout: PROVIDER_TEST_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
        },
      });
      return;
    } catch (error) {
      const shouldRetry = attempt < PROVIDER_TEST_ATTEMPTS - 1 && isTransientProviderTestError(error);
      if (shouldRetry) {
        await sleep(PROVIDER_TEST_BACKOFF_MS);
        continue;
      }

      throw error;
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mapProviderTestConnectionError(error: any) {
  if (isMappedRouteError(error)) {
    return error;
  }

  const upstreamStatus = Number(error?.response?.status);
  if (upstreamStatus === 404) {
    const mapped: any = new Error('selected model endpoint not found');
    mapped.status = 404;
    mapped.code = 'MODEL_NOT_FOUND';
    return mapped;
  }

  if (error?.code === 'ECONNABORTED') {
    const mapped: any = new Error('provider request timed out');
    mapped.status = 408;
    mapped.code = 'PROVIDER_TIMEOUT';
    return mapped;
  }

  const fallback: any = new Error('provider test connection failed');
  fallback.status = 500;
  fallback.code = 'INTERNAL_ERROR';
  return fallback;
}

function isTransientProviderTestError(error: any) {
  const upstreamStatus = Number(error?.response?.status);
  if (Number.isFinite(upstreamStatus)) {
    return upstreamStatus === 429 || upstreamStatus >= 500;
  }

  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'ECONNABORTED') {
    return true;
  }

  return Boolean(code) && !error?.response;
}

function isMappedRouteError(error: any) {
  const code = typeof error?.code === 'string' ? error.code : '';
  return (
    code === 'PROVIDER_NOT_FOUND' ||
    code === 'CONFIG_URL_INVALID' ||
    code === 'API_KEY_INVALID_FORMAT' ||
    code === 'MODEL_NOT_FOUND'
  );
}

async function fetchProviderModelsRemote(baseUrl: string, apiKey: string) {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/models`;
  const requestConfig: any = {
    timeout: PROVIDER_MODELS_TIMEOUT_MS,
  };
  if (apiKey) {
    requestConfig.headers = {
      Authorization: `Bearer ${apiKey}`,
    };
  }

  const response = await axios.get(endpoint, requestConfig);
  const modelEntries = normalizeProviderModelPayload(response?.data);
  return modelEntries.map((model) => ({
    modelId: model.modelId,
    displayName: model.displayName,
    modelType: model.modelType,
    description: model.description,
    isOnline: true,
    lastCheckedAt: null,
  }));
}

function normalizeProviderModelPayload(payload: any) {
  const rawModels = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : [];

  const mapped = rawModels
    .map((item: any) => {
      const modelId = readTrimmedString(item?.id || item?.modelId || item?.name);
      if (!modelId) {
        return null;
      }
      return {
        modelId,
        displayName: readTrimmedString(item?.display_name || item?.displayName) || modelId,
        modelType: inferModelType(item, modelId),
        description: readTrimmedString(item?.description),
      };
    })
    .filter((item: any) => item !== null);

  mapped.sort((left: any, right: any) => {
    if (left.modelType !== right.modelType) {
      const modelTypeOrder: Record<string, number> = { llm: 0, embedding: 1 };
      return (modelTypeOrder[left.modelType] ?? 99) - (modelTypeOrder[right.modelType] ?? 99);
    }
    return left.modelId.localeCompare(right.modelId);
  });
  return mapped;
}

function inferModelType(model: any, modelId: string): 'llm' | 'embedding' {
  const explicitType = readTrimmedString(model?.modelType || model?.type || model?.object).toLowerCase();
  if (explicitType === 'embedding') {
    return 'embedding';
  }
  if (explicitType === 'llm') {
    return 'llm';
  }

  const normalizedModelId = modelId.toLowerCase();
  if (normalizedModelId.includes('embedding') || normalizedModelId.includes('bge')) {
    return 'embedding';
  }
  return 'llm';
}

async function loadProviderApiKey(db: any, providerId: string) {
  const row = await db.get('SELECT api_key FROM provider_configs WHERE provider_id = ?', [providerId]);
  if (!row) {
    const error: any = new Error(`provider not found: ${providerId}`);
    error.status = 404;
    error.code = 'PROVIDER_NOT_FOUND';
    throw error;
  }
  return readTrimmedString(row.api_key);
}

function buildDeterministicFallbackModels(provider: any) {
  const models = [
    {
      modelId: provider.llmModel,
      displayName: provider.llmModel,
      modelType: 'llm',
      description: 'Cached fallback model',
      isOnline: false,
      lastCheckedAt: provider.lastModelSyncAt ?? null,
    },
    {
      modelId: provider.embeddingModel,
      displayName: provider.embeddingModel,
      modelType: 'embedding',
      description: 'Cached fallback model',
      isOnline: false,
      lastCheckedAt: provider.lastModelSyncAt ?? null,
    },
  ];

  return models.filter((item) => item.modelId);
}

function mapProviderModelsDegradedState(error: any) {
  const upstreamStatus = Number(error?.response?.status);
  if (upstreamStatus === 401) {
    return {
      degradedReason: 'REMOTE_UNAVAILABLE',
      errorCode: 'REMOTE_AUTH_UNAUTHORIZED',
    };
  }

  if (upstreamStatus === 403) {
    return {
      degradedReason: 'REMOTE_UNAVAILABLE',
      errorCode: 'REMOTE_AUTH_FORBIDDEN',
    };
  }

  return {
    degradedReason: 'REMOTE_UNAVAILABLE',
    errorCode: 'REMOTE_REQUEST_FAILED',
  };
}
