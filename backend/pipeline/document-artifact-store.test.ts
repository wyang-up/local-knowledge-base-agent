// @vitest-environment node

import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createDocumentArtifactStore } from './document-artifact-store.ts';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-artifacts-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('document-artifact-store', () => {
  it('stores parsing cleaning chunking and embedding artifacts separately', async () => {
    const dir = await makeTempDir();
    const store = createDocumentArtifactStore(dir);

    await store.saveArtifact('doc-1', 'parsing', { units: [{ text: 'raw' }] });
    await store.saveArtifact('doc-1', 'cleaning', { text: 'cleaned' });
    await store.saveArtifact('doc-1', 'chunking', { chunks: [{ id: 'c1' }] });
    await store.saveArtifact('doc-1', 'embedding', { vectors: [{ chunkId: 'c1' }] });

    expect(await store.loadArtifact('doc-1', 'cleaning')).toMatchObject({ text: 'cleaned' });

    await store.invalidateFromStage('doc-1', 'cleaning');

    expect(await store.loadArtifact('doc-1', 'cleaning')).toBeNull();
    expect(await store.loadArtifact('doc-1', 'parsing')).toMatchObject({ units: [{ text: 'raw' }] });
  });

  it('stores artifact fingerprint so resume validity can be checked', async () => {
    const dir = await makeTempDir();
    const store = createDocumentArtifactStore(dir);

    await store.saveArtifact('doc-2', 'parsing', { units: [] }, { md5: 'abc', fileSize: 10 });

    expect(await store.readArtifactMeta('doc-2', 'parsing')).toMatchObject({ md5: 'abc', fileSize: 10 });
  });
});
