// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { embedChunksWithRetry, resolveEmbeddingBatchSize } from './document-embedding.ts';

describe('document-embedding', () => {
  it('reports processedUnits totalUnits stageProgress and retryCount while retrying failed batches only', async () => {
    const progressEvents: Array<{ processedUnits: number; totalUnits: number; retryCount: number }> = [];
    const embedder = vi.fn()
      .mockResolvedValueOnce([[0.1, 0.2]])
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce([[0.3, 0.4]]);

    const result = await embedChunksWithRetry({
      chunks: [
        { chunkId: 'c1', content: 'a' },
        { chunkId: 'c2', content: 'b' },
      ],
      batchSize: 1,
      maxRetries: 2,
      embedBatch: embedder,
      onProgress: (event) => progressEvents.push(event),
      sleep: async () => undefined,
    });

    expect(result.embeddedChunks).toHaveLength(2);
    expect(result.retryCount).toBe(1);
    expect(progressEvents.at(-1)).toMatchObject({ processedUnits: 2, totalUnits: 2, retryCount: 1 });
    expect(embedder).toHaveBeenCalledTimes(3);
  });

  it('embeds chunks in grouped batches', async () => {
    const batchSizes: number[] = [];

    await embedChunksWithRetry({
      chunks: Array.from({ length: 10 }, (_, index) => ({ chunkId: `c${index}`, content: `chunk ${index}` })),
      batchSize: 4,
      maxRetries: 0,
      embedBatch: async (batch) => {
        batchSizes.push(batch.length);
        return batch.map(() => [1, 2, 3]);
      },
    });

    expect(batchSizes).toEqual([4, 4, 2]);
  });

  it('resolves dynamic batch size from chunk lengths', () => {
    expect(resolveEmbeddingBatchSize([{ content: 'short text' }])).toBe(8);
    expect(resolveEmbeddingBatchSize([{ content: 'x'.repeat(1200) }])).toBe(4);
    expect(resolveEmbeddingBatchSize([{ content: 'x'.repeat(4000) }])).toBe(1);
  });

  it('retries only the failed batch instead of rerunning successful batches', async () => {
    const embedder = vi.fn()
      .mockResolvedValueOnce([[1], [2]])
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce([[3], [4]]);

    const result = await embedChunksWithRetry({
      chunks: [
        { chunkId: 'c1', content: 'chunk-1' },
        { chunkId: 'c2', content: 'chunk-2' },
        { chunkId: 'c3', content: 'chunk-3' },
        { chunkId: 'c4', content: 'chunk-4' },
      ],
      batchSize: 2,
      maxRetries: 3,
      embedBatch: embedder,
      sleep: async () => undefined,
    });

    expect(result.embeddedChunks).toHaveLength(4);
    expect(embedder.mock.calls.map(([batch]) => batch.map((item: { chunkId: string }) => item.chunkId))).toEqual([
      ['c1', 'c2'],
      ['c3', 'c4'],
      ['c3', 'c4'],
    ]);
  });

  it('captures batch observability data', async () => {
    const result = await embedChunksWithRetry({
      chunks: [
        { chunkId: 'c1', content: 'chunk-1' },
        { chunkId: 'c2', content: 'chunk-2' },
        { chunkId: 'c3', content: 'chunk-3' },
      ],
      batchSize: 2,
      maxRetries: 0,
      embedBatch: async (batch) => batch.map(() => [1, 2, 3]),
    });

    expect(result.batchSize).toBe(2);
    expect(result.batchResults).toHaveLength(2);
    expect(result.batchResults[0]).toMatchObject({ batchIndex: 0, status: 'succeeded' });
  });

  it('fails when failed batch ratio exceeds threshold', async () => {
    await expect(embedChunksWithRetry({
      chunks: [
        { chunkId: 'c1', content: 'chunk-1' },
        { chunkId: 'c2', content: 'chunk-2' },
        { chunkId: 'c3', content: 'chunk-3' },
        { chunkId: 'c4', content: 'chunk-4' },
      ],
      batchSize: 2,
      maxRetries: 0,
      failedBatchRatioThreshold: 0.3,
      embedBatch: async () => {
        throw new Error('temporary');
      },
      sleep: async () => undefined,
    })).rejects.toThrow('temporary');
  });

  it('records retry bookkeeping with reason and timestamp', async () => {
    const result = await embedChunksWithRetry({
      chunks: [
        { chunkId: 'c1', content: 'chunk-1' },
        { chunkId: 'c2', content: 'chunk-2' },
      ],
      batchSize: 1,
      maxRetries: 2,
      embedBatch: vi.fn()
        .mockRejectedValueOnce(new Error('temporary'))
        .mockResolvedValueOnce([[1, 2, 3]])
        .mockResolvedValueOnce([[4, 5, 6]]),
      sleep: async () => undefined,
      now: () => '2026-04-03T16:00:00.000Z',
    });

    expect(result.retryEvents[0]).toMatchObject({
      retryCount: 1,
      reason: 'temporary',
      timestamp: '2026-04-03T16:00:00.000Z',
    });
  });

  it('tracks per-batch status including retry metadata', async () => {
    const result = await embedChunksWithRetry({
      chunks: [
        { chunkId: 'c1', content: 'chunk-1' },
        { chunkId: 'c2', content: 'chunk-2' },
        { chunkId: 'c3', content: 'chunk-3' },
        { chunkId: 'c4', content: 'chunk-4' },
      ],
      batchSize: 2,
      maxRetries: 1,
      embedBatch: vi.fn()
        .mockResolvedValueOnce([[1], [2]])
        .mockRejectedValueOnce(new Error('temporary'))
        .mockResolvedValueOnce([[3], [4]]),
      sleep: async () => undefined,
      now: () => '2026-04-03T16:00:00.000Z',
    });

    expect(result.batchResults).toMatchObject([
      {
        batchIndex: 0,
        chunkIds: ['c1', 'c2'],
        status: 'succeeded',
      },
      {
        batchIndex: 1,
        chunkIds: ['c3', 'c4'],
        status: 'succeeded',
        retryCount: 1,
        lastError: 'temporary',
        retryTriggeredAt: '2026-04-03T16:00:00.000Z',
      },
    ]);
  });

  it('uses backoff schedule and stops on non-retryable errors', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(embedChunksWithRetry({
      chunks: [{ chunkId: 'c1', content: 'chunk-1' }],
      batchSize: 1,
      maxRetries: 3,
      embedBatch: vi.fn().mockRejectedValue(new Error('NON_RETRYABLE: invalid document')),
      sleep,
    })).rejects.toThrow('NON_RETRYABLE: invalid document');

    expect(sleep).not.toHaveBeenCalled();

    const retrySleep = vi.fn().mockResolvedValue(undefined);
    await embedChunksWithRetry({
      chunks: [{ chunkId: 'c2', content: 'chunk-2' }],
      batchSize: 1,
      maxRetries: 3,
      embedBatch: vi.fn()
        .mockRejectedValueOnce(new Error('temporary-1'))
        .mockRejectedValueOnce(new Error('temporary-2'))
        .mockRejectedValueOnce(new Error('temporary-3'))
        .mockResolvedValueOnce([[1, 2, 3]]),
      sleep: retrySleep,
      now: () => '2026-04-03T16:00:00.000Z',
    });

    expect(retrySleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 5000, 10000]);
  });
});
