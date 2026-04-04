// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createDocumentPipelineStages } from './document-pipeline-stages.ts';

describe('document-pipeline-stages', () => {
  it('runs embedding stage with dynamic batch size and progress callback', async () => {
    const writeDocumentStage = vi.fn().mockResolvedValue(undefined);
    const saveArtifact = vi.fn().mockResolvedValue(undefined);
    const saveCheckpoint = vi.fn().mockResolvedValue(undefined);
    const runEmbeddingWithLimit = vi.fn(async (_docId: string, task: () => Promise<unknown>) => task());
    const embedChunksWithRetry = vi.fn(async ({ batchSize, onProgress }) => {
      await onProgress?.({ processedUnits: 2, totalUnits: 2, retryCount: 1 });
      return {
        embeddedChunks: [
          { chunkId: 'doc-1-0', content: 'alpha', embedding: [1, 2, 3] },
          { chunkId: 'doc-1-1', content: 'beta', embedding: [4, 5, 6] },
        ],
        retryCount: 1,
        batchSize,
        retryEvents: [],
        batchResults: [],
        failedBatchCount: 0,
        failedBatchRatio: { numerator: 0, denominator: 1, result: 0 },
      };
    });

    const stages = createDocumentPipelineStages({
      writeDocumentStage,
      artifactStore: { saveArtifact },
      pipelineStore: { saveCheckpoint },
      pipelineRunner: { runEmbeddingWithLimit },
      resolveEmbeddingBatchSize: () => 4,
      embedChunksWithRetry,
      embeddingDim: 1024,
      siliconflowTimeoutMs: 20000,
      postEmbeddings: vi.fn(),
      ensureChunkTable: vi.fn(),
      addVectorChunks: vi.fn(),
      storeEmbeddedChunks: vi.fn(),
      buildChunkMetadataRecords: vi.fn(),
      now: () => '2026-04-03T18:00:00.000Z',
    });

    const result = await stages.runEmbeddingStage({
      doc: { id: 'doc-1', md5: 'm1' },
      chunkDrafts: [
        { content: 'alpha', tokenCount: 10 },
        { content: 'beta', tokenCount: 20 },
      ],
      jobId: 'doc-1',
      config: { baseUrl: 'http://example.com', embeddingModel: 'BAAI/bge-m3', apiKey: 'k' },
    });

    expect(runEmbeddingWithLimit).toHaveBeenCalledTimes(1);
    expect(embedChunksWithRetry).toHaveBeenCalledWith(expect.objectContaining({ batchSize: 4 }));
    expect(writeDocumentStage).toHaveBeenCalledWith('doc-1', 'embedding', expect.objectContaining({ retryCount: 1 }));
    expect(saveArtifact).toHaveBeenCalledWith('doc-1', 'embedding', result, { md5: 'm1' });
    expect(saveCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc-1', lastSuccessfulStage: 'embedding' }));
  });

  it('runs storing stage with mapped chunk metadata records', async () => {
    const writeDocumentStage = vi.fn().mockResolvedValue(undefined);
    const replaceChunkMetadata = vi.fn().mockResolvedValue(undefined);
    const addVectorChunks = vi.fn().mockResolvedValue(undefined);
    const ensureChunkTable = vi.fn().mockResolvedValue(undefined);
    const storeEmbeddedChunks = vi.fn(async ({ addToVectorStore, saveMetadata }) => {
      await addToVectorStore();
      await saveMetadata();
      return { storedCount: 1 };
    });
    const buildChunkMetadataRecords = vi.fn(() => [{ chunkId: 'doc-1-0' }]);

    const stages = createDocumentPipelineStages({
      writeDocumentStage,
      artifactStore: { saveArtifact: vi.fn() },
      pipelineStore: { saveCheckpoint: vi.fn(), replaceChunkMetadata },
      pipelineRunner: { runEmbeddingWithLimit: vi.fn() },
      resolveEmbeddingBatchSize: vi.fn(),
      embedChunksWithRetry: vi.fn(),
      embeddingDim: 1024,
      siliconflowTimeoutMs: 20000,
      postEmbeddings: vi.fn(),
      ensureChunkTable,
      addVectorChunks,
      storeEmbeddedChunks,
      buildChunkMetadataRecords,
      now: () => '2026-04-03T18:10:00.000Z',
    });

    await stages.runStoringStage({
      doc: { id: 'doc-1', name: 'sample.pdf', type: '.pdf' },
      filePath: '/tmp/sample.pdf',
      chunkDrafts: [{ sourceUnit: 'body', sourceLabel: null, content: 'alpha', tokenCount: 10, qualityStatus: 'passed' }],
      cleaned: { cleaningApplied: ['collapse_blank_lines'] },
      embedded: { embeddedChunks: [{ chunkId: 'doc-1-0', content: 'alpha', embedding: [1, 2, 3] }] },
      config: { embeddingModel: 'BAAI/bge-m3' },
      chunkTableExists: true,
    });

    expect(storeEmbeddedChunks).toHaveBeenCalledTimes(1);
    expect(buildChunkMetadataRecords).toHaveBeenCalledTimes(1);
    expect(replaceChunkMetadata).toHaveBeenCalledWith('doc-1', [{ chunkId: 'doc-1-0' }]);
    expect(addVectorChunks).toHaveBeenCalledTimes(1);
  });
});
