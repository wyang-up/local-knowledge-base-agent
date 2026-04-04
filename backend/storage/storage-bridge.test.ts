// @vitest-environment node

import express from 'express';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { open } from 'sqlite';
import { SETTINGS_CSRF_HEADER, SETTINGS_SESSION_HEADER } from '../settings/settings-auth.ts';
import { createSettingsStore } from '../settings/settings-store.ts';
import { registerSettingsRoutes } from '../settings/settings-routes.ts';

const TEST_SESSION_TOKEN = 'storage-bridge-session-token';
const TEST_CSRF_TOKEN = 'storage-bridge-csrf-token';

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
    ['https://api.siliconflow.cn/v1', 'deepseek-ai/DeepSeek-V3', 'BAAI/bge-m3', '', '2026-04-02T00:00:00.000Z'],
  );

  return db;
}

async function startTestServer(db: any, storagePath: string) {
  process.env.SETTINGS_SESSION_TOKEN = TEST_SESSION_TOKEN;
  process.env.SETTINGS_CSRF_TOKEN = TEST_CSRF_TOKEN;

  const app = express();
  app.use(express.json());
  registerSettingsRoutes(app, db, {
    storagePath,
    getRuntimeConfig: async () => ({
      baseUrl: 'https://api.siliconflow.cn/v1',
      embeddingModel: 'BAAI/bge-m3',
      llmModel: 'deepseek-ai/DeepSeek-V3',
      apiKey: '',
      storagePath,
      documentStoragePath: storagePath,
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

function buildAuthRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: {
      'content-type': 'application/json',
      [SETTINGS_SESSION_HEADER]: TEST_SESSION_TOKEN,
      [SETTINGS_CSRF_HEADER]: TEST_CSRF_TOKEN,
    },
    body: typeof body === 'undefined' ? undefined : JSON.stringify(body),
  };
}

describe('storage bridge routes', () => {
  const servers: http.Server[] = [];
  const dbs: any[] = [];
  const tempDirs: string[] = [];
  const originalSessionToken = process.env.SETTINGS_SESSION_TOKEN;
  const originalCsrfToken = process.env.SETTINGS_CSRF_TOKEN;

  afterEach(async () => {
    vi.restoreAllMocks();
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

    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;

    process.env.SETTINGS_SESSION_TOKEN = originalSessionToken;
    process.env.SETTINGS_CSRF_TOKEN = originalCsrfToken;
  });

  it('POST /api/storage/open opens valid persisted storage path only', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-bridge-open-'));
    tempDirs.push(storageRoot);

    const db = await createLegacyDb();
    dbs.push(db);
    await createSettingsStore(db, { storagePath: storageRoot });

    const { baseUrl, server } = await startTestServer(db, storageRoot);
    servers.push(server);

    const validResponse = await fetch(`${baseUrl}/api/storage/open`, buildAuthRequest('POST'));
    expect(validResponse.status).toBe(200);
    expect(await validResponse.json()).toMatchObject({
      success: true,
      openedPath: storageRoot,
    });

    const mismatchResponse = await fetch(
      `${baseUrl}/api/storage/open`,
      buildAuthRequest('POST', { storagePath: `${storageRoot}-other` }),
    );
    expect(mismatchResponse.status).toBe(409);
    expect(await mismatchResponse.json()).toMatchObject({
      code: 'STORAGE_PATH_MISMATCH',
    });
  });

  it('POST /api/storage/open accepts equivalent normalized path forms', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-bridge-open-equivalent-'));
    tempDirs.push(storageRoot);

    const db = await createLegacyDb();
    dbs.push(db);
    await createSettingsStore(db, { storagePath: storageRoot });

    const { baseUrl, server } = await startTestServer(db, storageRoot);
    servers.push(server);

    const response = await fetch(
      `${baseUrl}/api/storage/open`,
      buildAuthRequest('POST', { storagePath: `${storageRoot}/` }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      openedPath: storageRoot,
    });
  });

  it('POST /api/storage/open rejects invalid persisted path states', async () => {
    const nonAbsoluteDb = await createLegacyDb();
    dbs.push(nonAbsoluteDb);
    await createSettingsStore(nonAbsoluteDb, { storagePath: 'relative/storage' });
    const nonAbsoluteServer = await startTestServer(nonAbsoluteDb, 'relative/storage');
    servers.push(nonAbsoluteServer.server);

    const nonAbsoluteResponse = await fetch(`${nonAbsoluteServer.baseUrl}/api/storage/open`, buildAuthRequest('POST'));
    expect(nonAbsoluteResponse.status).toBe(400);
    expect(await nonAbsoluteResponse.json()).toMatchObject({ code: 'INVALID_STORAGE_PATH' });

    const missingPath = path.join(os.tmpdir(), `storage-bridge-missing-${Date.now()}`);
    const missingDb = await createLegacyDb();
    dbs.push(missingDb);
    await createSettingsStore(missingDb, { storagePath: missingPath });
    const missingServer = await startTestServer(missingDb, missingPath);
    servers.push(missingServer.server);

    const missingResponse = await fetch(`${missingServer.baseUrl}/api/storage/open`, buildAuthRequest('POST'));
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toMatchObject({ code: 'STORAGE_PATH_NOT_FOUND' });

    const containerDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-bridge-not-dir-'));
    tempDirs.push(containerDir);
    const filePath = path.join(containerDir, 'not-a-dir.txt');
    await fs.writeFile(filePath, 'x');

    const fileDb = await createLegacyDb();
    dbs.push(fileDb);
    await createSettingsStore(fileDb, { storagePath: filePath });
    const fileServer = await startTestServer(fileDb, filePath);
    servers.push(fileServer.server);

    const fileResponse = await fetch(`${fileServer.baseUrl}/api/storage/open`, buildAuthRequest('POST'));
    expect(fileResponse.status).toBe(400);
    expect(await fileResponse.json()).toMatchObject({ code: 'INVALID_STORAGE_PATH' });
  });

  it('POST /api/storage/cache/clear clears cache safely and reports reclaimed bytes', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-bridge-cache-'));
    tempDirs.push(storageRoot);

    const cacheDir = path.join(storageRoot, 'cache');
    await fs.mkdir(path.join(cacheDir, 'nested'), { recursive: true });
    await fs.writeFile(path.join(cacheDir, 'a.bin'), Buffer.alloc(48));
    await fs.writeFile(path.join(cacheDir, 'nested', 'b.bin'), Buffer.alloc(24));
    await fs.writeFile(path.join(storageRoot, 'keep.txt'), 'must-survive');

    const db = await createLegacyDb();
    dbs.push(db);
    await createSettingsStore(db, { storagePath: storageRoot });

    const { baseUrl, server } = await startTestServer(db, storageRoot);
    servers.push(server);

    const clearResponse = await fetch(`${baseUrl}/api/storage/cache/clear`, buildAuthRequest('POST'));
    expect(clearResponse.status).toBe(200);
    const payload: any = await clearResponse.json();
    expect(payload).toMatchObject({
      success: true,
      reclaimedBytes: 72,
      stats: {
        cacheSizeBytes: 0,
      },
    });

    const cacheEntries = await fs.readdir(cacheDir);
    expect(cacheEntries).toEqual([]);
    expect(await fs.readFile(path.join(storageRoot, 'keep.txt'), 'utf8')).toBe('must-survive');
  });

  it('POST /api/storage/cache/clear rejects symlink cache dir and preserves external data', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-bridge-cache-symlink-'));
    tempDirs.push(storageRoot);

    const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-bridge-external-'));
    tempDirs.push(externalRoot);

    const externalFile = path.join(externalRoot, 'external.bin');
    await fs.writeFile(externalFile, Buffer.alloc(32));

    await fs.symlink(externalRoot, path.join(storageRoot, 'cache'), 'dir');

    const db = await createLegacyDb();
    dbs.push(db);
    await createSettingsStore(db, { storagePath: storageRoot });

    const { baseUrl, server } = await startTestServer(db, storageRoot);
    servers.push(server);

    const clearResponse = await fetch(`${baseUrl}/api/storage/cache/clear`, buildAuthRequest('POST'));
    expect(clearResponse.status).toBe(400);
    expect(await clearResponse.json()).toMatchObject({
      code: 'STORAGE_CACHE_SYMLINK_FORBIDDEN',
    });

    const preserved = await fs.readFile(externalFile);
    expect(preserved.byteLength).toBe(32);
  });
});
