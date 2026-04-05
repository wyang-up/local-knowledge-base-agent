// @vitest-environment node

import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { registerDocumentPreviewRoutes } from './server.ts';

async function createTestDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      name TEXT,
      size INTEGER,
      type TEXT,
      uploadTime TEXT,
      status TEXT,
      chunkCount INTEGER,
      description TEXT,
      md5 TEXT,
      filePath TEXT
    );
  `);
  return db;
}

async function startPreviewServer(db: any) {
  const app = express();
  registerDocumentPreviewRoutes(app, db);

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

describe('server preview content routes', () => {
  const dbs: any[] = [];
  const servers: http.Server[] = [];
  const tempDirs: string[] = [];
  const originalModalFlag = process.env.ENABLE_NEW_PREVIEW_MODAL;
  const originalByTypeFlag = process.env.ENABLE_NEW_PREVIEW_BY_TYPE;

  function trackDb<T>(db: T): T {
    dbs.push(db);
    return db;
  }

  function trackServer(server: http.Server) {
    servers.push(server);
    return server;
  }

  function trackTempDir(tempDir: string) {
    tempDirs.push(tempDir);
    return tempDir;
  }

  async function insertDocument(db: any, payload: { id: string; type: string; filePath: string; size?: number }) {
    await db.run(
      'INSERT INTO documents (id, name, size, type, uploadTime, status, chunkCount, md5, filePath) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [payload.id, `${payload.id}${payload.type}`, payload.size ?? 0, payload.type, new Date().toISOString(), 'completed', 0, `${payload.id}-md5`, payload.filePath],
    );
  }

  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })),
    );
    servers.length = 0;

    await Promise.all(dbs.map((db) => db.close()));
    dbs.length = 0;

    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs.length = 0;

    process.env.ENABLE_NEW_PREVIEW_MODAL = originalModalFlag;
    process.env.ENABLE_NEW_PREVIEW_BY_TYPE = originalByTypeFlag;
  });

  it('returns 206 with Content-Range for valid range request', async () => {
    const db = trackDb(await createTestDb());
    const tempDir = trackTempDir(fs.mkdtempSync(path.join(os.tmpdir(), 'preview-content-')));
    const filePath = path.join(tempDir, 'sample.txt');
    fs.writeFileSync(filePath, 'abcdefghij', 'utf8');
    await insertDocument(db, { id: 'doc-206', type: '.txt', filePath, size: 10 });

    const { server, baseUrl } = await startPreviewServer(db);
    trackServer(server);

    const response = await fetch(`${baseUrl}/api/documents/doc-206/content`, {
      headers: {
        Range: 'bytes=2-5',
      },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Length')).toBe('4');
    expect(await response.text()).toBe('cdef');
  });

  it('returns 200 full content when Range header is missing', async () => {
    const db = trackDb(await createTestDb());
    const tempDir = trackTempDir(fs.mkdtempSync(path.join(os.tmpdir(), 'preview-content-')));
    const filePath = path.join(tempDir, 'sample.txt');
    fs.writeFileSync(filePath, 'abcdefghij', 'utf8');
    await insertDocument(db, { id: 'doc-200', type: '.txt', filePath, size: 10 });

    const { server, baseUrl } = await startPreviewServer(db);
    trackServer(server);

    const response = await fetch(`${baseUrl}/api/documents/doc-200/content`);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe('10');
    expect(await response.text()).toBe('abcdefghij');
  });

  it('returns 416 with bytes */total for out-of-bounds range', async () => {
    const db = trackDb(await createTestDb());
    const tempDir = trackTempDir(fs.mkdtempSync(path.join(os.tmpdir(), 'preview-content-')));
    const filePath = path.join(tempDir, 'sample.txt');
    fs.writeFileSync(filePath, 'abcdefghij', 'utf8');
    await insertDocument(db, { id: 'doc-416', type: '.txt', filePath, size: 10 });

    const { server, baseUrl } = await startPreviewServer(db);
    trackServer(server);

    const response = await fetch(`${baseUrl}/api/documents/doc-416/content`, {
      headers: {
        Range: 'bytes=20-30',
      },
    });
    const payload: any = await response.json();

    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */10');
    expect(payload.error).toMatchObject({
      code: 'RANGE_NOT_SATISFIABLE',
      message: 'Invalid Range header',
      retriable: false,
    });
  });

  it('returns 416 + machine-readable error for syntactically invalid range', async () => {
    const db = trackDb(await createTestDb());
    const tempDir = trackTempDir(fs.mkdtempSync(path.join(os.tmpdir(), 'preview-content-')));
    const filePath = path.join(tempDir, 'sample.txt');
    fs.writeFileSync(filePath, 'abcdefghij', 'utf8');
    await insertDocument(db, { id: 'doc-416-invalid-syntax', type: '.txt', filePath, size: 10 });

    const { server, baseUrl } = await startPreviewServer(db);
    trackServer(server);

    const response = await fetch(`${baseUrl}/api/documents/doc-416-invalid-syntax/content`, {
      headers: {
        Range: 'bytes=10-',
      },
    });
    const payload: any = await response.json();

    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */10');
    expect(payload.error).toMatchObject({
      code: 'RANGE_NOT_SATISFIABLE',
      message: 'Invalid Range header',
      retriable: false,
    });
  });

  it('returns machine-readable errors for 404, 415, and 500', async () => {
    const db = trackDb(await createTestDb());

    await insertDocument(db, {
      id: 'doc-415',
      type: '.exe',
      filePath: '/tmp/not-used.exe',
      size: 1024,
    });
    await insertDocument(db, {
      id: 'doc-500',
      type: '.txt',
      filePath: '/tmp/definitely-not-existing-preview-file.txt',
      size: 12,
    });

    const { server, baseUrl } = await startPreviewServer(db);
    trackServer(server);

    const notFoundResponse = await fetch(`${baseUrl}/api/documents/missing-doc/content`);
    const unsupportedResponse = await fetch(`${baseUrl}/api/documents/doc-415/content`);
    const readFailedResponse = await fetch(`${baseUrl}/api/documents/doc-500/content`);

    const notFoundJson: any = await notFoundResponse.json();
    const unsupportedJson: any = await unsupportedResponse.json();
    const readFailedJson: any = await readFailedResponse.json();

    expect(notFoundResponse.status).toBe(404);
    expect(notFoundJson.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Document not found',
      retriable: false,
    });

    expect(unsupportedResponse.status).toBe(415);
    expect(unsupportedJson.error).toMatchObject({
      code: 'UNSUPPORTED_TYPE',
      message: 'Preview is not supported for this file type',
      retriable: false,
    });

    expect(readFailedResponse.status).toBe(500);
    expect(readFailedJson.error).toMatchObject({
      code: 'READ_FAILED',
      message: 'Failed to read document content',
      retriable: true,
    });
  });

  it('parses preview flags from environment variables', async () => {
    process.env.ENABLE_NEW_PREVIEW_MODAL = 'false';
    process.env.ENABLE_NEW_PREVIEW_BY_TYPE = 'pdf:true,table:true,json:false,text:true';

    const db = trackDb(await createTestDb());
    const { server, baseUrl } = await startPreviewServer(db);
    trackServer(server);

    const response = await fetch(`${baseUrl}/api/settings/preview-flags`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      enableNewPreviewModal: false,
      enableNewPreviewByType: {
        pdf: true,
        table: true,
        json: false,
        text: true,
      },
    });
  });
});
