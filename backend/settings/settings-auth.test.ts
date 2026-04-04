// @vitest-environment node

import express from 'express';
import http from 'node:http';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LOCAL_ACTOR,
  SETTINGS_CSRF_HEADER,
  SETTINGS_PROTECTED_ROUTE_MATRIX,
  SETTINGS_SESSION_HEADER,
  createSettingsAuditContext,
  createSettingsSecurityMiddleware,
} from './settings-auth.ts';
import { registerSettingsRoutes } from './settings-routes.ts';
import { registerSettingsRoutes as registerServerSettingsRoutes } from '../server.ts';

const TEST_STORAGE_PATH = '/tmp/settings-auth-test';
const TEST_SESSION_TOKEN = 'session-token-very-secret';
const TEST_CSRF_TOKEN = 'csrf-token-very-secret';

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

async function startServer(app: express.Express) {
  const server = await new Promise<http.Server>((resolve) => {
    const next = app.listen(0, '127.0.0.1', () => resolve(next));
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

describe('settings auth guards', () => {
  const servers: http.Server[] = [];
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
    process.env.SETTINGS_SESSION_TOKEN = originalSessionToken;
    process.env.SETTINGS_CSRF_TOKEN = originalCsrfToken;
  });

  it('blocks protected settings route without session token', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createSettingsSecurityMiddleware({
        sessionToken: TEST_SESSION_TOKEN,
        csrfToken: TEST_CSRF_TOKEN,
      }),
    );
    app.patch('/api/config/provider/:providerId', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/config/provider/siliconflow`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
      },
      body: JSON.stringify({ llmModel: 'x' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTH_UNAUTHORIZED' });
  });

  it('blocks protected settings route without csrf token', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createSettingsSecurityMiddleware({
        sessionToken: TEST_SESSION_TOKEN,
        csrfToken: TEST_CSRF_TOKEN,
      }),
    );
    app.patch('/api/config/storage', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/config/storage`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
      },
      body: JSON.stringify({ storagePath: '/tmp/x' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'CSRF_INVALID' });
  });

  it('attaches requestId and actor info to audit context', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createSettingsSecurityMiddleware({
        sessionToken: TEST_SESSION_TOKEN,
        csrfToken: TEST_CSRF_TOKEN,
      }),
    );
    app.post('/api/config/import', (req, res) => {
      const audit = createSettingsAuditContext(req);
      res.status(200).json({ audit });
    });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/config/import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
        [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
      },
      body: JSON.stringify({ schemaVersion: 1 }),
    });

    expect(response.status).toBe(200);
    const payload: any = await response.json();
    expect(payload.audit.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.audit.actor).toBe(LOCAL_ACTOR);
  });

  it('rejects wrong tokens for protected route', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createSettingsSecurityMiddleware({
        sessionToken: TEST_SESSION_TOKEN,
        csrfToken: TEST_CSRF_TOKEN,
      }),
    );
    app.post('/api/config/import', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const wrongSessionResponse = await fetch(`${baseUrl}/api/config/import`, {
      method: 'POST',
      headers: {
        [SETTINGS_SESSION_HEADER]: 'wrong-session-token',
        [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
      },
    });
    expect(wrongSessionResponse.status).toBe(401);

    const wrongCsrfResponse = await fetch(`${baseUrl}/api/config/import`, {
      method: 'POST',
      headers: {
        [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
        [SETTINGS_CSRF_HEADER]: 'wrong-csrf-token',
      },
    });
    expect(wrongCsrfResponse.status).toBe(403);
  });

  it('passes through unprotected routes without tokens', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createSettingsSecurityMiddleware({
        sessionToken: TEST_SESSION_TOKEN,
        csrfToken: TEST_CSRF_TOKEN,
      }),
    );
    app.get('/api/config/model', (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/config/model`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it('includes protected read and provider utility routes in auth matrix', () => {
    const routeKeys = SETTINGS_PROTECTED_ROUTE_MATRIX.map((route) => `${route.method} ${route.path}`);

    expect(routeKeys).toContain('GET /api/config/all');
    expect(routeKeys).toContain('GET /api/config/provider/:providerId/models');
    expect(routeKeys).toContain('POST /api/config/provider/:providerId/test');
  });

  it('enforces auth+csrf on all protected routes from spec matrix', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createSettingsSecurityMiddleware({
        sessionToken: TEST_SESSION_TOKEN,
        csrfToken: TEST_CSRF_TOKEN,
      }),
    );

    app.post('/api/config/apikey', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.get('/api/config/export', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.get('/api/config/all', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.patch('/api/config/ui', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.patch('/api/config/provider/:providerId', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.post('/api/config/provider/:providerId/key-token', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.post('/api/config/provider/:providerId/key-reveal', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.get('/api/config/provider/:providerId/models', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.post('/api/config/provider/:providerId/test', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.patch('/api/config/storage', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.post('/api/config/save-all', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.post('/api/config/import', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.post('/api/config/reset-default', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.post('/api/storage/open', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.post('/api/storage/docs/open', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });
    app.post('/api/storage/cache/clear', (req, res) => {
      res.status(200).json({ audit: createSettingsAuditContext(req) });
    });

    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    for (const route of SETTINGS_PROTECTED_ROUTE_MATRIX) {
      const unauthorized = await fetch(`${baseUrl}${route.examplePath}`, {
        method: route.method,
      });
      expect(unauthorized.status).toBe(401);

      const forbidden = await fetch(`${baseUrl}${route.examplePath}`, {
        method: route.method,
        headers: {
          [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
        },
      });
      expect(forbidden.status).toBe(403);

      const ok = await fetch(`${baseUrl}${route.examplePath}`, {
        method: route.method,
        headers: {
          [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
          [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
        },
      });
      expect(ok.status).toBe(200);
      const payload: any = await ok.json();
      expect(payload.audit.requestId).toBeTypeOf('string');
      expect(payload.audit.actor).toBe(LOCAL_ACTOR);
    }
  });

  it('registerSettingsRoutes applies guard on protected config routes', async () => {
    const db = await createLegacyDb();
    process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
    process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;
    const app = express();
    app.use(express.json());
    registerServerSettingsRoutes(app, db, {
      storagePath: TEST_STORAGE_PATH,
    });

    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const all = await fetch(`${baseUrl}/api/config/all`, {
      method: 'GET',
      headers: {
        [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
        [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
      },
    });
    const allPayload: any = await all.json();
    const provider = allPayload.providers.find((item: any) => item.providerId === 'siliconflow');

    const apikeyResponse = await fetch(`${baseUrl}/api/config/apikey`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ apiKey: 'sk-updated-key-1234' }),
    });
    expect(apikeyResponse.status).toBe(401);

    const allResponse = await fetch(`${baseUrl}/api/config/all`, {
      method: 'GET',
    });
    expect(allResponse.status).toBe(401);

    const uiResponse = await fetch(`${baseUrl}/api/config/ui`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ language: 'en-US', theme: 'dark' }),
    });
    expect(uiResponse.status).toBe(401);

    const providerResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expectedVersion: provider.version, llmModel: 'blocked-model' }),
    });
    expect(providerResponse.status).toBe(401);

    const storageResponse = await fetch(`${baseUrl}/api/config/storage`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expectedVersion: allPayload.storage.version, storagePath: '/tmp/new-path' }),
    });
    expect(storageResponse.status).toBe(401);

    const modelsResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/models`, {
      method: 'GET',
    });
    expect(modelsResponse.status).toBe(401);

    const providerTestResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/test`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        baseUrl: 'https://api.siliconflow.cn/v1',
        apiKey: 'sk-1234567890',
        llmModel: 'deepseek-ai/DeepSeek-V3',
        embeddingModel: 'BAAI/bge-m3',
      }),
    });
    expect(providerTestResponse.status).toBe(401);

    await db.close();
  });

  it('registerSettingsRoutes emits audit context in real mutation handlers', async () => {
    const db = await createLegacyDb();
    process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
    process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;
    const app = express();
    app.use(express.json());
    registerServerSettingsRoutes(app, db, {
      storagePath: TEST_STORAGE_PATH,
    });

    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const authHeaders = {
      'content-type': 'application/json',
      [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
      [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
    };

    const apikeyResponse = await fetch(`${baseUrl}/api/config/apikey`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ apiKey: 'sk-updated-key-00009999' }),
    });
    expect(apikeyResponse.status).toBe(200);
    const apikeyPayload: any = await apikeyResponse.json();
    expect(apikeyPayload.audit.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(apikeyPayload.audit.actor).toBe(LOCAL_ACTOR);

    const uiResponse = await fetch(`${baseUrl}/api/config/ui`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ language: 'en-US', theme: 'dark' }),
    });
    expect(uiResponse.status).toBe(200);
    const uiPayload: any = await uiResponse.json();
    expect(uiPayload.audit.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(uiPayload.audit.actor).toBe(LOCAL_ACTOR);

    const allBeforeProvider = await fetch(`${baseUrl}/api/config/all`, {
      method: 'GET',
      headers: {
        [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
        [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
      },
    });
    const allBeforeProviderPayload: any = await allBeforeProvider.json();
    const provider = allBeforeProviderPayload.providers.find((item: any) => item.providerId === 'siliconflow');

    const providerResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ expectedVersion: provider.version, llmModel: 'patched-with-audit' }),
    });
    expect(providerResponse.status).toBe(200);
    const providerPayload: any = await providerResponse.json();
    expect(providerPayload.audit.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(providerPayload.audit.actor).toBe(LOCAL_ACTOR);

    const allAfterProvider = await fetch(`${baseUrl}/api/config/all`, {
      method: 'GET',
      headers: {
        [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
        [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
      },
    });
    const allAfterProviderPayload: any = await allAfterProvider.json();

    const storageResponse = await fetch(`${baseUrl}/api/config/storage`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ expectedVersion: allAfterProviderPayload.storage.version, storagePath: '/tmp/with-audit' }),
    });
    expect(storageResponse.status).toBe(200);
    const storagePayload: any = await storageResponse.json();
    expect(storagePayload.audit.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(storagePayload.audit.actor).toBe(LOCAL_ACTOR);

    await db.close();
  });

  it('accepts bootstrap tokens for protected config endpoints in local mode', async () => {
    const db = await createLegacyDb();
    process.env.SETTINGS_SESSION_TOKEN = '';
    process.env.SETTINGS_CSRF_TOKEN = '';

    const app = express();
    app.use(express.json());
    registerServerSettingsRoutes(app, db, {
      storagePath: TEST_STORAGE_PATH,
    });

    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const bootstrapResponse = await fetch(`${baseUrl}/api/settings/auth/bootstrap`);
    expect(bootstrapResponse.status).toBe(200);
    const bootstrapPayload: any = await bootstrapResponse.json();
    expect(typeof bootstrapPayload.sessionToken).toBe('string');
    expect(typeof bootstrapPayload.csrfToken).toBe('string');
    expect(bootstrapPayload.sessionToken.length).toBeGreaterThan(0);
    expect(bootstrapPayload.csrfToken.length).toBeGreaterThan(0);

    const authHeaders = {
      'content-type': 'application/json',
      [SETTINGS_SESSION_HEADER]: bootstrapPayload.sessionToken,
      [SETTINGS_CSRF_HEADER]: bootstrapPayload.csrfToken,
    };

    const exportResponse = await fetch(`${baseUrl}/api/config/export`, {
      method: 'GET',
      headers: {
        [SETTINGS_SESSION_HEADER]: bootstrapPayload.sessionToken,
        [SETTINGS_CSRF_HEADER]: bootstrapPayload.csrfToken,
      },
    });
    expect(exportResponse.status).toBe(200);

    const allResponse = await fetch(`${baseUrl}/api/config/all`, {
      method: 'GET',
      headers: {
        [SETTINGS_SESSION_HEADER]: bootstrapPayload.sessionToken,
        [SETTINGS_CSRF_HEADER]: bootstrapPayload.csrfToken,
      },
    });
    expect(allResponse.status).toBe(200);

    const modelsResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/models`, {
      method: 'GET',
      headers: {
        [SETTINGS_SESSION_HEADER]: bootstrapPayload.sessionToken,
        [SETTINGS_CSRF_HEADER]: bootstrapPayload.csrfToken,
      },
    });
    expect(modelsResponse.status).toBe(200);

    const importResponse = await fetch(`${baseUrl}/api/config/import`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ schemaVersion: '1.0.0', dryRun: true, payload: {} }),
    });
    expect(importResponse.status).toBe(200);

    const resetResponse = await fetch(`${baseUrl}/api/config/reset-default?scope=all`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    expect(resetResponse.status).toBe(200);

    const saveAllResponse = await fetch(`${baseUrl}/api/config/save-all`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ uiPatch: { language: 'en-US' } }),
    });
    expect(saveAllResponse.status).toBe(200);

    const providerTestResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/test`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        baseUrl: 'not-a-valid-url',
        apiKey: 'sk-valid-123456',
        llmModel: 'deepseek-ai/DeepSeek-V3',
        embeddingModel: 'BAAI/bge-m3',
      }),
    });
    expect(providerTestResponse.status).toBe(400);
    expect((await providerTestResponse.json() as any).code).toBe('CONFIG_URL_INVALID');

    await db.close();
  });
});
