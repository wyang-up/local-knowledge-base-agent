// @vitest-environment node

import express from 'express';
import http from 'node:http';
import sqlite3 from 'sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { open } from 'sqlite';
import { registerSettingsRoutes } from '../server.ts';
import { SETTINGS_CSRF_HEADER, SETTINGS_SESSION_HEADER } from './settings-auth.ts';
import { createSettingsStore } from './settings-store.ts';

const TEST_STORAGE_PATH = '/tmp/settings-task10-test';
const TEST_SESSION_TOKEN = 'settings-task10-session-token';
const TEST_CSRF_TOKEN = 'settings-task10-csrf-token';

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
  });

  const server = await new Promise<http.Server>((resolve) => {
    const nextServer = app.listen(0, '127.0.0.1', () => resolve(nextServer));
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to resolve test server address');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

type ApiRequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  sessionToken?: string;
  csrfToken?: string;
};

function buildApiRequest(options: ApiRequestOptions = {}): RequestInit {
  const method = options.method ?? 'POST';
  const headers: Record<string, string> = {};

  if (typeof options.sessionToken === 'string') {
    headers[SETTINGS_SESSION_HEADER] = options.sessionToken;
  }

  if (typeof options.csrfToken === 'string') {
    headers[SETTINGS_CSRF_HEADER] = options.csrfToken;
  }

  if (typeof options.body !== 'undefined') {
    headers['content-type'] = 'application/json';
  }

  return {
    method,
    headers,
    body: typeof options.body === 'undefined' ? undefined : JSON.stringify(options.body),
  };
}

function buildProtectedRequest(body?: unknown): RequestInit {
  return buildApiRequest({
    method: 'POST',
    body,
    sessionToken: TEST_SESSION_TOKEN,
    csrfToken: TEST_CSRF_TOKEN,
  });
}

describe('config import/export/reset/save-all contracts', () => {
  const servers: http.Server[] = [];
  const dbs: any[] = [];
  const originalSessionToken = process.env.SETTINGS_SESSION_TOKEN;
  const originalCsrfToken = process.env.SETTINGS_CSRF_TOKEN;

  afterEach(async () => {
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

  it('export endpoint excludes plaintext keys', async () => {
    const db = await createLegacyDb();
    dbs.push(db);
    const { server, baseUrl } = await startTestServer(db);
    servers.push(server);

    const response = await fetch(
      `${baseUrl}/api/config/export`,
      buildApiRequest({ method: 'GET', sessionToken: TEST_SESSION_TOKEN, csrfToken: TEST_CSRF_TOKEN }),
    );
    expect(response.status).toBe(200);

    const payload: any = await response.json();
    expect(payload.schemaVersion).toBeTypeOf('string');
    expect(Array.isArray(payload.providers)).toBe(true);

    for (const provider of payload.providers) {
      expect(provider.apiKey).toBeUndefined();
      expect(provider.plainKey).toBeUndefined();
      expect(provider.maskedKey).toBeTypeOf('string');
    }
  });

  it('import handles schemaVersion and dryRun preview', async () => {
    const db = await createLegacyDb();
    dbs.push(db);
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { server, baseUrl } = await startTestServer(db);
    servers.push(server);

    const unsupportedResponse = await fetch(
      `${baseUrl}/api/config/import`,
      buildProtectedRequest({ schemaVersion: '2.0.0', dryRun: true, payload: {} }),
    );
    expect(unsupportedResponse.status).toBe(400);
    expect((await unsupportedResponse.json() as any).code).toBe('IMPORT_SCHEMA_UNSUPPORTED');

    const beforeUi = await db.get('SELECT language, theme FROM ui_preferences WHERE id = 1');

    const dryRunResponse = await fetch(
      `${baseUrl}/api/config/import`,
      buildProtectedRequest({
        schemaVersion: '1.2.0',
        dryRun: true,
        payload: {
          uiPreferences: {
            language: 'en-US',
            theme: 'dark',
          },
        },
      }),
    );

    expect(dryRunResponse.status).toBe(200);
    const dryRunPayload: any = await dryRunResponse.json();
    expect(dryRunPayload.valid).toBe(true);
    expect(Array.isArray(dryRunPayload.changesPreview)).toBe(true);
    expect(dryRunPayload.changesPreview.length).toBeGreaterThan(0);

    const afterUi = await db.get('SELECT language, theme FROM ui_preferences WHERE id = 1');
    expect(afterUi.language).toBe(beforeUi.language);
    expect(afterUi.theme).toBe(beforeUi.theme);
  });

  it('reset-default supports scope/target behavior', async () => {
    const db = await createLegacyDb();
    dbs.push(db);
    const store = await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    await store.patchUiConfig({ language: 'en-US', theme: 'dark' });
    await store.patchProviderConfig(
      'siliconflow',
      { llmModel: 'patched-llm', embeddingModel: 'patched-embed' },
      1,
    );

    const { server, baseUrl } = await startTestServer(db);
    servers.push(server);

    const moduleResetResponse = await fetch(
      `${baseUrl}/api/config/reset-default?scope=module&target=ui`,
      buildProtectedRequest(),
    );
    expect(moduleResetResponse.status).toBe(200);

    const afterModuleReset = await fetch(
      `${baseUrl}/api/config/all`,
      buildApiRequest({ method: 'GET', sessionToken: TEST_SESSION_TOKEN, csrfToken: TEST_CSRF_TOKEN }),
    );
    const afterModulePayload: any = await afterModuleReset.json();
    expect(afterModulePayload.ui.language).toBe('zh-CN');
    expect(afterModulePayload.ui.theme).toBe('system');
    const moduleProvider = afterModulePayload.providers.find((item: any) => item.providerId === 'siliconflow');
    expect(moduleProvider.llmModel).toBe('patched-llm');

    const allResetResponse = await fetch(
      `${baseUrl}/api/config/reset-default?scope=all`,
      buildProtectedRequest(),
    );
    expect(allResetResponse.status).toBe(200);

    const afterAllReset = await fetch(
      `${baseUrl}/api/config/all`,
      buildApiRequest({ method: 'GET', sessionToken: TEST_SESSION_TOKEN, csrfToken: TEST_CSRF_TOKEN }),
    );
    const afterAllPayload: any = await afterAllReset.json();
    const allProvider = afterAllPayload.providers.find((item: any) => item.providerId === 'siliconflow');
    expect(allProvider.llmModel).toBe('deepseek-ai/DeepSeek-V3');
  });

  it('save-all returns field-level failedItems payload', async () => {
    const db = await createLegacyDb();
    dbs.push(db);
    const { server, baseUrl } = await startTestServer(db);
    servers.push(server);

    const allResponse = await fetch(
      `${baseUrl}/api/config/all`,
      buildApiRequest({ method: 'GET', sessionToken: TEST_SESSION_TOKEN, csrfToken: TEST_CSRF_TOKEN }),
    );
    const allPayload: any = await allResponse.json();
    const provider = allPayload.providers.find((item: any) => item.providerId === 'siliconflow');

    const response = await fetch(
      `${baseUrl}/api/config/save-all`,
      buildProtectedRequest({
        uiPatch: { language: 'en-US' },
        providerPatches: [
          {
            providerId: 'siliconflow',
            expectedVersion: provider.version - 1,
            fields: {
              llmModel: 'stale-model',
            },
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    const payload: any = await response.json();
    expect(Array.isArray(payload.failedItems)).toBe(true);
    expect(payload.failedItems.length).toBeGreaterThan(0);
    expect(payload.failedItems[0]).toMatchObject({
      module: 'provider',
      providerId: 'siliconflow',
      field: 'llmModel',
      code: 'CONFIG_CONFLICT',
    });
    expect(Array.isArray(payload.successItems)).toBe(true);
    expect(payload.successItems.some((item: any) => item.module === 'ui' && item.field === 'language')).toBe(true);
  });

  it('requires auth and csrf for export/import/reset/save-all', async () => {
    const db = await createLegacyDb();
    dbs.push(db);
    const { server, baseUrl } = await startTestServer(db);
    servers.push(server);

    const protectedCases: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }> = [
      { method: 'GET', path: '/api/config/export' },
      { method: 'POST', path: '/api/config/import', body: { schemaVersion: '1.0.0', payload: {}, dryRun: true } },
      { method: 'POST', path: '/api/config/reset-default?scope=all' },
      { method: 'POST', path: '/api/config/save-all', body: { uiPatch: { language: 'en-US' } } },
    ];

    for (const entry of protectedCases) {
      const unauthorizedResponse = await fetch(
        `${baseUrl}${entry.path}`,
        buildApiRequest({ method: entry.method, body: entry.body }),
      );
      expect(unauthorizedResponse.status).toBe(401);
      expect((await unauthorizedResponse.json() as any).code).toBe('AUTH_UNAUTHORIZED');

      const csrfInvalidResponse = await fetch(
        `${baseUrl}${entry.path}`,
        buildApiRequest({
          method: entry.method,
          body: entry.body,
          sessionToken: TEST_SESSION_TOKEN,
          csrfToken: 'invalid-csrf-token',
        }),
      );
      expect(csrfInvalidResponse.status).toBe(403);
      expect((await csrfInvalidResponse.json() as any).code).toBe('CSRF_INVALID');
    }
  });

  it('rejects malformed schemaVersion values with IMPORT_SCHEMA_UNSUPPORTED', async () => {
    const db = await createLegacyDb();
    dbs.push(db);
    const { server, baseUrl } = await startTestServer(db);
    servers.push(server);

    const invalidVersions: unknown[] = [undefined, null, '', '1', '1.0', 'v1.0.0', '1.0.0.0', '1.x.0', 1.2, {}, []];

    for (const schemaVersion of invalidVersions) {
      const response = await fetch(
        `${baseUrl}/api/config/import`,
        buildProtectedRequest({ schemaVersion, dryRun: true, payload: {} }),
      );

      expect(response.status).toBe(400);
      const payload: any = await response.json();
      expect(payload.code).toBe('IMPORT_SCHEMA_UNSUPPORTED');
    }
  });

  it('rolls back importConfig writes when a mid-operation failure happens', async () => {
    const db = await createLegacyDb();
    dbs.push(db);
    await createSettingsStore(db, { storagePath: TEST_STORAGE_PATH });
    const { server, baseUrl } = await startTestServer(db);
    servers.push(server);

    const beforeAllResponse = await fetch(
      `${baseUrl}/api/config/all`,
      buildApiRequest({ method: 'GET', sessionToken: TEST_SESSION_TOKEN, csrfToken: TEST_CSRF_TOKEN }),
    );
    const beforeAllPayload: any = await beforeAllResponse.json();
    const beforeProvider = beforeAllPayload.providers.find((item: any) => item.providerId === 'siliconflow');

    const response = await fetch(
      `${baseUrl}/api/config/import`,
      buildProtectedRequest({
        schemaVersion: '1.0.0',
        dryRun: false,
        payload: {
          uiPreferences: {
            language: 'en-US',
          },
          providers: [
            {
              providerId: 'siliconflow',
              llmModel: 'rolled-back-model',
            },
          ],
          storagePreferences: {
            storagePath: '   ',
          },
        },
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json() as any).code).toBe('INVALID_STORAGE_PATH');

    const afterAllResponse = await fetch(
      `${baseUrl}/api/config/all`,
      buildApiRequest({ method: 'GET', sessionToken: TEST_SESSION_TOKEN, csrfToken: TEST_CSRF_TOKEN }),
    );
    const afterAllPayload: any = await afterAllResponse.json();
    const afterProvider = afterAllPayload.providers.find((item: any) => item.providerId === 'siliconflow');

    expect(afterAllPayload.ui.language).toBe(beforeAllPayload.ui.language);
    expect(afterProvider.llmModel).toBe(beforeProvider.llmModel);
  });
});
