// @vitest-environment node

import express from 'express';
import http from 'node:http';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LOCAL_ACTOR,
  SETTINGS_CSRF_HEADER,
  SETTINGS_REQUEST_ID_HEADER,
  SETTINGS_SESSION_HEADER,
} from './settings-auth.ts';
import { createKeySecurityService } from './key-security.ts';
import { registerSettingsRoutes } from '../server.ts';

const TEST_STORAGE_PATH = '/tmp/key-security-test';
const TEST_SESSION_TOKEN = 'session-token-key-security';
const TEST_CSRF_TOKEN = 'csrf-token-key-security';

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

function authHeaders(requestId?: string) {
  return {
    [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
    [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
    ...(requestId ? { [SETTINGS_REQUEST_ID_HEADER]: requestId } : {}),
  };
}

describe('key security routes', () => {
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

  it('issues one-time token with 60s ttl', async () => {
    process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
    process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;
    const db = await createLegacyDb();
    const app = express();
    app.use(express.json());
    registerSettingsRoutes(app, db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-token`, {
      method: 'POST',
      headers: authHeaders('req-token-1'),
    });

    expect(response.status).toBe(200);
    const payload: any = await response.json();
    expect(payload.token).toBeTypeOf('string');
    expect(payload.expiresInSeconds).toBe(60);
    expect(payload.requestId).toBe('req-token-1');

    await db.close();
  });

  it('returns KEY_TOKEN_USED after single use', async () => {
    process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
    process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;
    const db = await createLegacyDb();
    const app = express();
    app.use(express.json());
    registerSettingsRoutes(app, db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const tokenResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-token`, {
      method: 'POST',
      headers: authHeaders('req-used-token'),
    });
    const tokenPayload: any = await tokenResponse.json();

    const firstReveal = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-reveal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders('req-first-reveal'),
      },
      body: JSON.stringify({ token: tokenPayload.token, action: 'reveal' }),
    });
    expect(firstReveal.status).toBe(200);

    const secondReveal = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-reveal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders('req-second-reveal'),
      },
      body: JSON.stringify({ token: tokenPayload.token, action: 'reveal' }),
    });

    expect(secondReveal.status).toBe(409);
    await expect(secondReveal.json()).resolves.toMatchObject({ code: 'KEY_TOKEN_USED' });

    await db.close();
  });

  it('returns KEY_TOKEN_EXPIRED after ttl', async () => {
    process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
    process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;
    const nowRef = { value: Date.parse('2026-04-02T00:00:00.000Z') };
    const keySecurity = createKeySecurityService({ now: () => nowRef.value });
    const db = await createLegacyDb();
    const app = express();
    app.use(express.json());
    registerSettingsRoutes(app, db, { storagePath: TEST_STORAGE_PATH, keySecurity });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const tokenResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-token`, {
      method: 'POST',
      headers: authHeaders('req-expired-token'),
    });
    const tokenPayload: any = await tokenResponse.json();

    nowRef.value += 60_001;

    const revealResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-reveal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders('req-expired-reveal'),
      },
      body: JSON.stringify({ token: tokenPayload.token, action: 'reveal' }),
    });

    expect(revealResponse.status).toBe(410);
    await expect(revealResponse.json()).resolves.toMatchObject({ code: 'KEY_TOKEN_EXPIRED' });

    await db.close();
  });

  it('returns KEY_TOKEN_PROVIDER_MISMATCH on wrong provider', async () => {
    process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
    process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;
    const db = await createLegacyDb();
    const app = express();
    app.use(express.json());
    registerSettingsRoutes(app, db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const tokenResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-token`, {
      method: 'POST',
      headers: authHeaders('req-provider-token'),
    });
    const tokenPayload: any = await tokenResponse.json();

    const revealResponse = await fetch(`${baseUrl}/api/config/provider/openai/key-reveal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders('req-provider-mismatch'),
      },
      body: JSON.stringify({ token: tokenPayload.token, action: 'reveal' }),
    });

    expect(revealResponse.status).toBe(400);
    await expect(revealResponse.json()).resolves.toMatchObject({ code: 'KEY_TOKEN_PROVIDER_MISMATCH' });

    await db.close();
  });

  it('rejects invalid action with KEY_ACTION_INVALID', async () => {
    process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
    process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;
    const db = await createLegacyDb();
    const app = express();
    app.use(express.json());
    registerSettingsRoutes(app, db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const tokenResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-token`, {
      method: 'POST',
      headers: authHeaders('req-invalid-action-token'),
    });
    const tokenPayload: any = await tokenResponse.json();

    const revealResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-reveal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders('req-invalid-action'),
      },
      body: JSON.stringify({ token: tokenPayload.token, action: 'paste' }),
    });

    expect(revealResponse.status).toBe(400);
    await expect(revealResponse.json()).resolves.toMatchObject({ code: 'KEY_ACTION_INVALID' });

    await db.close();
  });

  it('rejects reveal when provider key is blank or missing', async () => {
    process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
    process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;
    const db = await createLegacyDb();
    const app = express();
    app.use(express.json());
    registerSettingsRoutes(app, db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const configResponse = await fetch(`${baseUrl}/api/config/all`, {
      method: 'GET',
      headers: authHeaders('req-config-all-openai'),
    });
    const configPayload: any = await configResponse.json();
    const openaiProvider = configPayload.providers.find((item: any) => item.providerId === 'openai');
    expect(openaiProvider.hasKey).toBe(false);

    const tokenResponse = await fetch(`${baseUrl}/api/config/provider/openai/key-token`, {
      method: 'POST',
      headers: authHeaders('req-blank-key-token'),
    });
    const tokenPayload: any = await tokenResponse.json();

    const revealResponse = await fetch(`${baseUrl}/api/config/provider/openai/key-reveal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders('req-blank-key-reveal'),
      },
      body: JSON.stringify({ token: tokenPayload.token, action: 'reveal' }),
    });

    expect(revealResponse.status).toBe(400);
    await expect(revealResponse.json()).resolves.toMatchObject({ code: 'KEY_NOT_CONFIGURED' });

    await db.close();
  });

  it('limits reveal/copy to 5 requests per provider per minute', async () => {
    process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
    process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;
    const db = await createLegacyDb();
    const app = express();
    app.use(express.json());
    registerSettingsRoutes(app, db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    for (let i = 0; i < 5; i += 1) {
      const tokenResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-token`, {
        method: 'POST',
        headers: authHeaders(`req-limit-token-${i}`),
      });
      const tokenPayload: any = await tokenResponse.json();

      const revealResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-reveal`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...authHeaders(`req-limit-reveal-${i}`),
        },
        body: JSON.stringify({ token: tokenPayload.token, action: i % 2 === 0 ? 'reveal' : 'copy' }),
      });
      expect(revealResponse.status).toBe(200);
    }

    const overTokenResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-token`, {
      method: 'POST',
      headers: authHeaders('req-limit-token-over'),
    });
    const overTokenPayload: any = await overTokenResponse.json();

    const overResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-reveal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders('req-limit-over'),
      },
      body: JSON.stringify({ token: overTokenPayload.token, action: 'copy' }),
    });

    expect(overResponse.status).toBe(429);
    await expect(overResponse.json()).resolves.toMatchObject({ code: 'KEY_REVEAL_RATE_LIMITED' });

    await db.close();
  });

  it('writes audit entry for reveal and copy actions with requestId/provider/actor/result', async () => {
    process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
    process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;
    const keySecurity = createKeySecurityService();
    const db = await createLegacyDb();
    const app = express();
    app.use(express.json());
    registerSettingsRoutes(app, db, { storagePath: TEST_STORAGE_PATH, keySecurity });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const revealTokenResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-token`, {
      method: 'POST',
      headers: authHeaders('req-audit-token-reveal'),
    });
    const revealTokenPayload: any = await revealTokenResponse.json();

    const revealResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-reveal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders('req-audit-reveal'),
      },
      body: JSON.stringify({ token: revealTokenPayload.token, action: 'reveal' }),
    });
    expect(revealResponse.status).toBe(200);

    const copyTokenResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-token`, {
      method: 'POST',
      headers: authHeaders('req-audit-token-copy'),
    });
    const copyTokenPayload: any = await copyTokenResponse.json();

    const copyResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-reveal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders('req-audit-copy'),
      },
      body: JSON.stringify({ token: copyTokenPayload.token, action: 'copy' }),
    });
    expect(copyResponse.status).toBe(200);

    const auditEvents = keySecurity.getAuditEvents();
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents[0]).toMatchObject({
      action: 'reveal',
      requestId: 'req-audit-reveal',
      providerId: 'siliconflow',
      actor: LOCAL_ACTOR,
      result: 'success',
    });
    expect(auditEvents[1]).toMatchObject({
      action: 'copy',
      requestId: 'req-audit-copy',
      providerId: 'siliconflow',
      actor: LOCAL_ACTOR,
      result: 'success',
    });

    await db.close();
  });

  it('writes error audit event with result:error and code', async () => {
    process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
    process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;
    const keySecurity = createKeySecurityService();
    const db = await createLegacyDb();
    const app = express();
    app.use(express.json());
    registerSettingsRoutes(app, db, { storagePath: TEST_STORAGE_PATH, keySecurity });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const tokenResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-token`, {
      method: 'POST',
      headers: authHeaders('req-audit-error-token'),
    });
    const tokenPayload: any = await tokenResponse.json();

    const mismatchResponse = await fetch(`${baseUrl}/api/config/provider/openai/key-reveal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders('req-audit-error'),
      },
      body: JSON.stringify({ token: tokenPayload.token, action: 'copy' }),
    });
    expect(mismatchResponse.status).toBe(400);

    const events = keySecurity.getAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      requestId: 'req-audit-error',
      providerId: 'openai',
      actor: LOCAL_ACTOR,
      action: 'copy',
      result: 'error',
      code: 'KEY_TOKEN_PROVIDER_MISMATCH',
    });

    await db.close();
  });

  it('returns key reveal payload with no-store/no-cache headers', async () => {
    process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
    process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;
    const db = await createLegacyDb();
    const app = express();
    app.use(express.json());
    registerSettingsRoutes(app, db, { storagePath: TEST_STORAGE_PATH });
    const { baseUrl, server } = await startServer(app);
    servers.push(server);

    const tokenResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-token`, {
      method: 'POST',
      headers: authHeaders('req-cache-token'),
    });
    const tokenPayload: any = await tokenResponse.json();

    const revealResponse = await fetch(`${baseUrl}/api/config/provider/siliconflow/key-reveal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders('req-cache-reveal'),
      },
      body: JSON.stringify({ token: tokenPayload.token, action: 'reveal' }),
    });

    expect(revealResponse.status).toBe(200);
    expect(revealResponse.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
    expect(revealResponse.headers.get('pragma')).toBe('no-cache');
    expect(revealResponse.headers.get('expires')).toBe('0');

    await db.close();
  });
});

describe('key security retention', () => {
  it('purges audit events older than 180 days and keeps newer events', async () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const nowRef = { value: Date.parse('2026-01-01T00:00:00.000Z') };
    const keySecurity = createKeySecurityService({ now: () => nowRef.value });

    const oldToken = keySecurity.issueToken('siliconflow');
    await keySecurity.revealKey({
      providerId: 'siliconflow',
      token: oldToken.token,
      action: 'reveal',
      requestId: 'req-old',
      actor: LOCAL_ACTOR,
      loadProviderKey: async () => 'sk-old-key-11111111',
    });
    expect(keySecurity.getAuditEvents()).toHaveLength(1);

    nowRef.value += 181 * DAY_MS;

    const freshToken = keySecurity.issueToken('openai');
    await keySecurity.revealKey({
      providerId: 'openai',
      token: freshToken.token,
      action: 'copy',
      requestId: 'req-fresh',
      actor: LOCAL_ACTOR,
      loadProviderKey: async () => 'sk-fresh-key-22222222',
    });

    const events = keySecurity.getAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      providerId: 'openai',
      requestId: 'req-fresh',
      action: 'copy',
      result: 'success',
    });
  });

  it('purges expired tokens from store while keeping expired error behavior', async () => {
    const nowRef = { value: Date.parse('2026-01-01T00:00:00.000Z') };
    const keySecurity = createKeySecurityService({ now: () => nowRef.value });

    const expiredToken = keySecurity.issueToken('siliconflow');
    expect(keySecurity.getTokenStoreSize()).toBe(1);

    nowRef.value += 60_001;
    const freshToken = keySecurity.issueToken('siliconflow');
    expect(freshToken.token).toBeTypeOf('string');
    expect(keySecurity.getTokenStoreSize()).toBe(1);

    await expect(
      keySecurity.revealKey({
        providerId: 'siliconflow',
        token: expiredToken.token,
        action: 'reveal',
        requestId: 'req-expired-cleanup',
        actor: LOCAL_ACTOR,
        loadProviderKey: async () => 'sk-siliconflow-key-1234567890',
      }),
    ).rejects.toMatchObject({ code: 'KEY_TOKEN_EXPIRED', status: 410 });
  });
});
