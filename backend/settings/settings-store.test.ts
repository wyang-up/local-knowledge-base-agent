// @vitest-environment node

import express from 'express';
import http from 'node:http';
import sqlite3 from 'sqlite3';
import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { open } from 'sqlite';
import { SETTINGS_CSRF_HEADER, SETTINGS_SESSION_HEADER } from './settings-auth.ts';
import { createSettingsStore } from './settings-store.ts';
import { registerSettingsRoutes } from './settings-routes.ts';

const TEST_STORAGE_PATH = '/tmp/settings-store-test';
const TEST_SESSION_TOKEN = 'settings-store-test-session-token';
const TEST_CSRF_TOKEN = 'settings-store-test-csrf-token';

type MutationRequestOptions = {
  method: string;
  body?: unknown;
};

async function createLegacyDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE model_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      base_url TEXT NOT NULL,
      llm_model TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      api_key TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );
  `);

  await db.run(
    `INSERT INTO model_config (id, base_url, llm_model, embedding_model, api_key, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)`,
    ['https://api.siliconflow.cn/v1', 'deepseek-ai/DeepSeek-V3', 'BAAI/bge-m3', 'sk-legacy-1234567890', '2026-04-02T00:00:00.000Z'],
  );

  return db;
}

async function startTestServer(db: any) {
  process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
  process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;

  const app = express();
  app.use(express.json());
  registerSettingsRoutes(app, db, {
    storagePath: TEST_STORAGE_PATH,
    getRuntimeConfig: async () => ({
      baseUrl: 'https://api.siliconflow.cn/v1',
      embeddingModel: 'BAAI/bge-m3',
      llmModel: 'deepseek-ai/DeepSeek-V3',
      apiKey: '',
      storagePath: TEST_STORAGE_PATH,
      documentStoragePath: TEST_STORAGE_PATH,
    }),
  });

  const server = await new Promise<http.Server>((resolve) => {
    const nextServer = app.listen(0, '127.0.0.1', () => resolve(nextServer));
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to resolve test server address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const warmupResponse = await fetch(`${baseUrl}/api/config/all`, {
    method: 'GET',
    headers: {
      [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
      [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
    },
  });
  if (!warmupResponse.ok) {
    throw new Error(`settings routes warmup failed: ${warmupResponse.status}`);
  }

  return {
    server,
    baseUrl,
  };
}

function buildMutationRequestOptions(options: MutationRequestOptions): RequestInit {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
    [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
  };

  return {
    method: options.method,
    headers,
    body: typeof options.body === 'undefined' ? undefined : JSON.stringify(options.body),
  };
}

function buildProtectedReadRequestOptions(): RequestInit {
  return {
    method: 'GET',
    headers: {
      [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
      [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
    },
  };
}

function findProvider(payload: any, providerId: string) {
  return payload.providers.find((item: any) => item.providerId === providerId);
}

describe('settings-store migration, masking, and versioning', () => {
  it('migrates model_config to provider_configs and preferences tables', async () => {
    const db = await createLegacyDb();
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });

    const provider = await db.get('SELECT * FROM provider_configs WHERE provider_id = ?', ['siliconflow']);
    const ui = await db.get('SELECT * FROM ui_preferences WHERE id = 1');
    const storage = await db.get('SELECT * FROM storage_preferences WHERE id = 1');

    expect(provider).toBeTruthy();
    expect(provider.base_url).toBe('https://api.siliconflow.cn/v1');
    expect(provider.llm_model).toBe('deepseek-ai/DeepSeek-V3');
    expect(provider.embedding_model).toBe('BAAI/bge-m3');
    expect(provider.api_key).toBe('sk-legacy-1234567890');
    expect(ui).toBeTruthy();
    expect(storage).toBeTruthy();

    await db.close();
  });

  it('returns /api/config/all with maskedKey only', async () => {
    const db = await createLegacyDb();
    const store = await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });

    const all = await store.getAllConfig();
    const provider = findProvider(all, 'siliconflow');
    expect(provider.hasKey).toBe(true);
    expect(provider.maskedKey).toBeTypeOf('string');
    expect(provider.apiKey).toBeUndefined();

    await db.close();
  });

  it('returns maskedKey in format: first3 + fixed-mask + last2', async () => {
    const db = await createLegacyDb();
    const store = await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });

    const all = await store.getAllConfig();
    const provider = findProvider(all, 'siliconflow');
    expect(provider.maskedKey).toBe('sk-******90');

    await db.close();
  });

  it('enforces version bump and 409 conflict on stale version', async () => {
    const db = await createLegacyDb();
    const store = await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const all = await store.getAllConfig();
    const provider = findProvider(all, 'siliconflow');

    const updated = await store.patchProviderConfig('siliconflow', { llmModel: 'updated-model' }, provider.version);
    expect(updated.version).toBe(provider.version + 1);

    await expect(
      store.patchProviderConfig('siliconflow', { llmModel: 'stale-model' }, provider.version),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFIG_CONFLICT',
    });

    await db.close();
  });
});

describe('settings config routes', () => {
  const servers: http.Server[] = [];
  const dbs: any[] = [];
  const originalSessionToken = process.env.SETTINGS_SESSION_TOKEN;
  const originalCsrfToken = process.env.SETTINGS_CSRF_TOKEN;

  function trackDb<T>(db: T): T {
    dbs.push(db);
    return db;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          }),
      ),
    );
    servers.length = 0;

    await Promise.all(dbs.map((db) => db.close()));
    dbs.length = 0;

    process.env.SETTINGS_SESSION_TOKEN = originalSessionToken;
    process.env.SETTINGS_CSRF_TOKEN = originalCsrfToken;
  });

  it('patches /api/config/ui and persists language/theme immediately', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/config/ui`, {
      ...buildMutationRequestOptions({ method: 'PATCH', body: { language: 'en-US', theme: 'dark' } }),
    });

    expect(response.status).toBe(200);
    const payload: any = await response.json();
    expect(payload.ui.language).toBe('en-US');
    expect(payload.ui.theme).toBe('dark');

    const ui = await db.get('SELECT language, theme FROM ui_preferences WHERE id = 1');
    expect(ui.language).toBe('en-US');
    expect(ui.theme).toBe('dark');

  });

  it('patches /api/config/provider/:providerId with version checks', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const configResponse = await fetch(`${baseUrl}/api/config/all`, buildProtectedReadRequestOptions());
    const configPayload: any = await configResponse.json();
    const provider = findProvider(configPayload, 'siliconflow');

    const successResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow`, {
      ...buildMutationRequestOptions({
        method: 'PATCH',
        body: { expectedVersion: provider.version, llmModel: 'patched-model' },
      }),
    });

    expect(successResponse.status).toBe(200);
    const successPayload: any = await successResponse.json();
    expect(successPayload.provider.version).toBe(provider.version + 1);

    const conflictResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow`, {
      ...buildMutationRequestOptions({
        method: 'PATCH',
        body: { expectedVersion: provider.version, llmModel: 'stale-write' },
      }),
    });
    expect(conflictResponse.status).toBe(409);
    const conflictPayload: any = await conflictResponse.json();
    expect(conflictPayload.code).toBe('CONFIG_CONFLICT');

    const providerConfig = await db.get('SELECT api_key FROM provider_configs WHERE provider_id = ?', ['siliconflow']);
    expect(providerConfig.api_key).toBe('sk-legacy-1234567890');

  });

  it('/api/config/apikey keeps provider config and /api/config/all consistent', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const updateResponse = await fetch(`${baseUrl}/api/config/apikey`, {
      ...buildMutationRequestOptions({ method: 'POST', body: { apiKey: 'sk-updated-key-00001111' } }),
    });
    expect(updateResponse.status).toBe(200);

    const allResponse = await fetch(`${baseUrl}/api/config/all`, buildProtectedReadRequestOptions());
    expect(allResponse.status).toBe(200);
    const allPayload: any = await allResponse.json();
    const siliconflow = findProvider(allPayload, 'siliconflow');

    expect(siliconflow.hasKey).toBe(true);
    expect(siliconflow.maskedKey).toBe('sk-******11');
    expect(siliconflow.apiKey).toBeUndefined();
    for (const provider of allPayload.providers) {
      expect(provider.apiKey).toBeUndefined();
    }

    const providerRow = await db.get('SELECT api_key FROM provider_configs WHERE provider_id = ?', ['siliconflow']);
    expect(providerRow.api_key).toBe('sk-updated-key-00001111');

  });

  it('returns 400 INVALID_VERSION for bad expectedVersion payloads', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const providerInvalid = await fetch(`${baseUrl}/api/config/provider/siliconflow`, {
      ...buildMutationRequestOptions({ method: 'PATCH', body: { expectedVersion: '1', llmModel: 'x' } }),
    });
    expect(providerInvalid.status).toBe(400);
    expect((await providerInvalid.json() as any).code).toBe('INVALID_VERSION');

    const providerMissing = await fetch(`${baseUrl}/api/config/provider/siliconflow`, {
      ...buildMutationRequestOptions({ method: 'PATCH', body: { llmModel: 'x' } }),
    });
    expect(providerMissing.status).toBe(400);
    expect((await providerMissing.json() as any).code).toBe('INVALID_VERSION');

    const storageInvalid = await fetch(`${baseUrl}/api/config/storage`, {
      ...buildMutationRequestOptions({ method: 'PATCH', body: { expectedVersion: -2, storagePath: '/tmp/a' } }),
    });
    expect(storageInvalid.status).toBe(400);
    expect((await storageInvalid.json() as any).code).toBe('INVALID_VERSION');

  });

  it('returns 404 for unknown providerId', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/config/provider/not-exists`, {
      ...buildMutationRequestOptions({ method: 'PATCH', body: { expectedVersion: 1, llmModel: 'x' } }),
    });
    expect(response.status).toBe(404);
    const payload: any = await response.json();
    expect(payload.code).toBe('PROVIDER_NOT_FOUND');

  });

  it('patches /api/config/storage with version checks', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const configResponse = await fetch(`${baseUrl}/api/config/all`, buildProtectedReadRequestOptions());
    const configPayload: any = await configResponse.json();

    const successResponse = await fetch(`${baseUrl}/api/config/storage`, {
      ...buildMutationRequestOptions({
        method: 'PATCH',
        body: { expectedVersion: configPayload.storage.version, storagePath: '/tmp/new-storage' },
      }),
    });

    expect(successResponse.status).toBe(200);
    const successPayload: any = await successResponse.json();
    expect(successPayload.storage.version).toBe(configPayload.storage.version + 1);

    const conflictResponse = await fetch(`${baseUrl}/api/config/storage`, {
      ...buildMutationRequestOptions({
        method: 'PATCH',
        body: { expectedVersion: configPayload.storage.version, storagePath: '/tmp/stale-storage' },
      }),
    });

    expect(conflictResponse.status).toBe(409);
    const conflictPayload: any = await conflictResponse.json();
    expect(conflictPayload.code).toBe('CONFIG_CONFLICT');

  });

  it('returns 400 when storagePath patch is empty or not a string', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const configResponse = await fetch(`${baseUrl}/api/config/all`, buildProtectedReadRequestOptions());
    const configPayload: any = await configResponse.json();

    const emptyPath = await fetch(`${baseUrl}/api/config/storage`, {
      ...buildMutationRequestOptions({
        method: 'PATCH',
        body: { expectedVersion: configPayload.storage.version, storagePath: '   ' },
      }),
    });
    expect(emptyPath.status).toBe(400);
    expect((await emptyPath.json() as any).code).toBe('INVALID_STORAGE_PATH');

    const numberPath = await fetch(`${baseUrl}/api/config/storage`, {
      ...buildMutationRequestOptions({
        method: 'PATCH',
        body: { expectedVersion: configPayload.storage.version, storagePath: 12345 },
      }),
    });
    expect(numberPath.status).toBe(400);
    expect((await numberPath.json() as any).code).toBe('INVALID_STORAGE_PATH');

  });

  it('route payloads never expose raw apiKey', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const configResponse = await fetch(`${baseUrl}/api/config/all`, buildProtectedReadRequestOptions());
    const configPayload: any = await configResponse.json();
    const provider = findProvider(configPayload, 'siliconflow');

    const providerPatchResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow`, {
      ...buildMutationRequestOptions({
        method: 'PATCH',
        body: { expectedVersion: provider.version, apiKey: 'sk-new-key-99887766' },
      }),
    });
    expect(providerPatchResponse.status).toBe(200);
    const providerPatchPayload: any = await providerPatchResponse.json();
    expect(providerPatchPayload.provider.apiKey).toBeUndefined();
    expect(providerPatchPayload.provider.maskedKey).toBe('sk-******66');

    const allResponse = await fetch(`${baseUrl}/api/config/all`, buildProtectedReadRequestOptions());
    const allPayload: any = await allResponse.json();
    for (const item of allPayload.providers) {
      expect(item.apiKey).toBeUndefined();
    }

  });

  it('validates url/key/model payload before provider test-connection request', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const invalidUrl = await fetch(`${baseUrl}/api/config/provider/siliconflow/test`, {
      ...buildMutationRequestOptions({
        method: 'POST',
        body: {
          baseUrl: 'not-a-url',
          apiKey: 'sk-valid-key-1234567890',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          embeddingModel: 'BAAI/bge-m3',
        },
      }),
    });
    expect(invalidUrl.status).toBe(400);
    expect((await invalidUrl.json() as any).code).toBe('CONFIG_URL_INVALID');

    const invalidKey = await fetch(`${baseUrl}/api/config/provider/siliconflow/test`, {
      ...buildMutationRequestOptions({
        method: 'POST',
        body: {
          baseUrl: 'https://api.siliconflow.cn/v1',
          apiKey: '',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          embeddingModel: 'BAAI/bge-m3',
        },
      }),
    });
    expect(invalidKey.status).toBe(400);
    expect((await invalidKey.json() as any).code).toBe('API_KEY_INVALID_FORMAT');

    const missingSelection = await fetch(`${baseUrl}/api/config/provider/siliconflow/test`, {
      ...buildMutationRequestOptions({
        method: 'POST',
        body: {
          baseUrl: 'https://api.siliconflow.cn/v1',
          apiKey: 'sk-valid-key-1234567890',
          llmModel: '',
          embeddingModel: 'BAAI/bge-m3',
        },
      }),
    });
    expect(missingSelection.status).toBe(400);
    expect((await missingSelection.json() as any).code).toBe('MODEL_NOT_FOUND');

  });

  it('uses timeout=10s and retries once with 500ms backoff before succeeding', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const axiosGet = vi
      .spyOn(axios, 'get')
      .mockRejectedValueOnce(Object.assign(new Error('upstream failed'), { response: { status: 500 } }))
      .mockResolvedValueOnce({ data: { data: [] } } as any);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const requestPromise = fetch(`${baseUrl}/api/config/provider/siliconflow/test`, {
      ...buildMutationRequestOptions({
        method: 'POST',
        body: {
          baseUrl: 'https://api.siliconflow.cn/v1',
          apiKey: 'sk-valid-key-1234567890',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          embeddingModel: 'BAAI/bge-m3',
        },
      }),
    });
    const response = await requestPromise;
    expect(response.status).toBe(200);
    expect((await response.json() as any).success).toBe(true);

    expect(axiosGet).toHaveBeenCalledTimes(2);
    expect(axiosGet.mock.calls[0]?.[1]).toMatchObject({ timeout: 10_000 });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);

  });

  it('maps retry exhaustion timeout to PROVIDER_TIMEOUT', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const axiosGet = vi.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('timeout of 10000ms exceeded'), {
        code: 'ECONNABORTED',
      }),
    );

    const requestPromise = fetch(`${baseUrl}/api/config/provider/siliconflow/test`, {
      ...buildMutationRequestOptions({
        method: 'POST',
        body: {
          baseUrl: 'https://api.siliconflow.cn/v1',
          apiKey: 'sk-valid-key-1234567890',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          embeddingModel: 'BAAI/bge-m3',
        },
      }),
    });
    const response = await requestPromise;
    expect(response.status).toBe(408);
    expect((await response.json() as any).code).toBe('PROVIDER_TIMEOUT');
    expect(axiosGet).toHaveBeenCalledTimes(2);

  });

  it('maps retry exhaustion 404 to MODEL_NOT_FOUND', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const axiosGet = vi.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('model endpoint not found'), {
        response: { status: 404 },
      }),
    );

    const requestPromise = fetch(`${baseUrl}/api/config/provider/siliconflow/test`, {
      ...buildMutationRequestOptions({
        method: 'POST',
        body: {
          baseUrl: 'https://api.siliconflow.cn/v1',
          apiKey: 'sk-valid-key-1234567890',
          llmModel: 'deepseek-ai/DeepSeek-V3',
          embeddingModel: 'BAAI/bge-m3',
        },
      }),
    });
    const response = await requestPromise;
    expect(response.status).toBe(404);
    expect((await response.json() as any).code).toBe('MODEL_NOT_FOUND');
    expect(axiosGet).toHaveBeenCalledTimes(1);

  });

  it('returns provider models from remote with metadata and non-stale source', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const axiosGet = vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        data: [
          {
            id: 'deepseek-ai/DeepSeek-V3',
            object: 'model',
            description: 'general purpose llm',
          },
          {
            id: 'BAAI/bge-m3',
            object: 'embedding',
            description: 'embedding model',
          },
        ],
      },
    } as any);

    const response = await fetch(`${baseUrl}/api/config/provider/siliconflow/models`, buildProtectedReadRequestOptions());
    expect(response.status).toBe(200);

    const payload: any = await response.json();
    expect(payload.source).toBe('remote');
    expect(payload.isStale).toBe(false);
    expect(Array.isArray(payload.models)).toBe(true);
    expect(payload.models).toHaveLength(2);

    const firstModel = payload.models[0];
    expect(firstModel.modelId).toBe('deepseek-ai/DeepSeek-V3');
    expect(firstModel.displayName).toBe('deepseek-ai/DeepSeek-V3');
    expect(firstModel.modelType).toBe('llm');
    expect(firstModel.description).toBe('general purpose llm');
    expect(firstModel.isOnline).toBe(true);
    expect(typeof firstModel.lastCheckedAt).toBe('string');

    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(axiosGet.mock.calls[0]?.[0]).toBe('https://api.siliconflow.cn/v1/models');
  });

  it('does not send Authorization header when provider apiKey is empty', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    const axiosGet = vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        data: [
          {
            id: 'gpt-4o-mini',
            object: 'model',
            description: 'openai llm',
          },
        ],
      },
    } as any);

    const response = await fetch(`${baseUrl}/api/config/provider/openai/models`, buildProtectedReadRequestOptions());
    expect(response.status).toBe(200);
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(axiosGet.mock.calls[0]?.[1]).toMatchObject({ timeout: 10_000 });
    expect(axiosGet.mock.calls[0]?.[1]?.headers?.Authorization).toBeUndefined();
  });

  it('falls back to cache metadata when provider models remote is unavailable', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    vi.spyOn(axios, 'get').mockRejectedValue(new Error('network down'));

    const response = await fetch(`${baseUrl}/api/config/provider/siliconflow/models`, buildProtectedReadRequestOptions());
    expect(response.status).toBe(200);

    const payload: any = await response.json();
    expect(payload.source).toBe('cache');
    expect(payload.isStale).toBe(true);
    expect(payload.degradedReason).toBe('REMOTE_UNAVAILABLE');
    expect(payload.errorCode).toBe('REMOTE_REQUEST_FAILED');
    expect(payload.models).toEqual([
      {
        modelId: 'deepseek-ai/DeepSeek-V3',
        displayName: 'deepseek-ai/DeepSeek-V3',
        modelType: 'llm',
        description: 'Cached fallback model',
        isOnline: false,
        lastCheckedAt: null,
      },
      {
        modelId: 'BAAI/bge-m3',
        displayName: 'BAAI/bge-m3',
        modelType: 'embedding',
        description: 'Cached fallback model',
        isOnline: false,
        lastCheckedAt: null,
      },
    ]);
  });

  it('exposes degraded error signal when provider models remote returns 401', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    vi.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('unauthorized'), {
        response: { status: 401 },
      }),
    );

    const response = await fetch(`${baseUrl}/api/config/provider/siliconflow/models`, buildProtectedReadRequestOptions());
    expect(response.status).toBe(200);
    const payload: any = await response.json();
    expect(payload.source).toBe('cache');
    expect(payload.isStale).toBe(true);
    expect(payload.degradedReason).toBe('REMOTE_UNAVAILABLE');
    expect(payload.errorCode).toBe('REMOTE_AUTH_UNAUTHORIZED');
  });

  it('exposes degraded error signal when provider models remote returns 403', async () => {
    const db = trackDb(await createLegacyDb());
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startTestServer(db);
    servers.push(server);

    vi.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('forbidden'), {
        response: { status: 403 },
      }),
    );

    const response = await fetch(`${baseUrl}/api/config/provider/siliconflow/models`, buildProtectedReadRequestOptions());
    expect(response.status).toBe(200);
    const payload: any = await response.json();
    expect(payload.source).toBe('cache');
    expect(payload.isStale).toBe(true);
    expect(payload.degradedReason).toBe('REMOTE_UNAVAILABLE');
    expect(payload.errorCode).toBe('REMOTE_AUTH_FORBIDDEN');
  });
});
