// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { storeEmbeddedChunks } from './document-storage-writer.ts';

describe('document-storage-writer', () => {
  it('stores metadata and vectors through a single writer channel', async () => {
    const addToVectorStore = vi.fn().mockResolvedValue(undefined);
    const saveMetadata = vi.fn().mockResolvedValue(undefined);

    const result = await storeEmbeddedChunks({
      documentId: 'doc-1',
      chunks: [{ chunkId: 'c1', content: 'a', embedding: [0.1, 0.2] }],
      addToVectorStore,
      saveMetadata,
    });

    expect(addToVectorStore).toHaveBeenCalledTimes(1);
    expect(saveMetadata).toHaveBeenCalledTimes(1);
    expect(result.storedCount).toBe(1);
  });

  it('keeps embedding artifacts reusable when storing fails', async () => {
    const addToVectorStore = vi.fn().mockRejectedValue(new Error('locked'));
    const saveMetadata = vi.fn();

    await expect(storeEmbeddedChunks({
      documentId: 'doc-1',
      chunks: [{ chunkId: 'c1', content: 'a', embedding: [0.1, 0.2] }],
      addToVectorStore,
      saveMetadata,
    })).rejects.toThrow('locked');

    expect(saveMetadata).not.toHaveBeenCalled();
  });

  it('passes through persisted metadata including batch diagnostics', async () => {
    const addToVectorStore = vi.fn().mockResolvedValue(undefined);
    const saveMetadata = vi.fn().mockResolvedValue(undefined);
    const chunks = [{
      chunkId: 'c1',
      content: 'a',
      embedding: [0.1, 0.2],
      metadata: {
        chunkId: 'c1',
        documentId: 'doc-1',
        fileName: 'english.pdf',
        fileType: 'pdf',
        sourcePath: '/tmp/english.pdf',
        sourceUnit: 'body',
        sourceLabel: 'Chapter 1',
        chunkIndex: 0,
        tokenCount: 120,
        charCount: 240,
        overlapTokenCount: 80,
        qualityStatus: 'merged',
        qualityNote: 'merged_adjacent_short_segments',
        cleaningApplied: ['collapse_blank_lines'],
        embeddingModel: 'BAAI/bge-m3',
        vectorDimension: 1024,
        storageStatus: 'stored',
        originStart: 'p1',
        originEnd: 'p2',
        createdAt: '2026-04-03T16:00:00.000Z',
        updatedAt: '2026-04-03T16:00:00.000Z',
      },
      batch: {
        batchIndex: 0,
        batchSize: 4,
        failedBatchCount: 0,
        failedBatchRatio: 0,
        retryCount: 0,
        retryTriggeredAt: null,
        lastError: null,
        status: 'succeeded',
      },
    }];

    await storeEmbeddedChunks({
      documentId: 'doc-1',
      chunks,
      addToVectorStore,
      saveMetadata,
    });

    expect(saveMetadata).toHaveBeenCalledWith('doc-1', chunks);
  });
});
