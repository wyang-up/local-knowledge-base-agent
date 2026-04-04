// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildChunkMetadataRecords,
  buildEmbeddingInputs,
  buildFailureRecoveryInput,
  resolvePipelineErrorCode,
} from './document-pipeline-helpers.ts';

describe('document-pipeline-helpers', () => {
  it('builds embedding inputs from chunk drafts', () => {
    const inputs = buildEmbeddingInputs('doc-1', [
      { content: 'alpha', tokenCount: 10 },
      { content: 'beta', tokenCount: 20 },
    ]);

    expect(inputs).toEqual([
      { chunkId: 'doc-1-0', content: 'alpha', tokenCount: 10 },
      { chunkId: 'doc-1-1', content: 'beta', tokenCount: 20 },
    ]);
  });

  it('maps runtime stage to pipeline error code', () => {
    expect(resolvePipelineErrorCode('embedding')).toBe('EMBEDDING_FAILED');
    expect(resolvePipelineErrorCode('chunking')).toBe('CHUNKING_FAILED');
    expect(resolvePipelineErrorCode('quality_check')).toBe('QUALITY_CHECK_FAILED');
  });

  it('builds failure recovery input from active stage', () => {
    expect(buildFailureRecoveryInput('embedding')).toEqual({
      failedStage: 'embedding',
      errorCode: 'EMBEDDING_FAILED',
    });
  });

  it('builds chunk metadata records with quality note and origin markers', () => {
    const records = buildChunkMetadataRecords({
      documentId: 'doc-1',
      fileName: 'sample.pdf',
      fileType: '.pdf',
      filePath: '/tmp/sample.pdf',
      embeddingModel: 'BAAI/bge-m3',
      embeddingDim: 1024,
      cleaningApplied: ['collapse_blank_lines'],
      now: '2026-04-03T10:00:00.000Z',
      chunks: [
        {
          sourceUnit: 'body',
          sourceLabel: 'Chapter 1',
          content: 'alpha',
          tokenCount: 10,
          qualityStatus: 'merged',
          qualityNote: 'merged_adjacent_short_segments',
        },
      ],
    });

    expect(records[0]).toMatchObject({
      chunkId: 'doc-1-0',
      documentId: 'doc-1',
      fileName: 'sample.pdf',
      fileType: 'pdf',
      sourcePath: '/tmp/sample.pdf',
      sourceUnit: 'body',
      sourceLabel: 'Chapter 1',
      tokenCount: 10,
      charCount: 5,
      qualityStatus: 'merged',
      qualityNote: 'merged_adjacent_short_segments',
      embeddingModel: 'BAAI/bge-m3',
      vectorDimension: 1024,
      storageStatus: 'stored',
      originStart: 'Chapter 1:start',
      originEnd: 'Chapter 1:end',
      createdAt: '2026-04-03T10:00:00.000Z',
      updatedAt: '2026-04-03T10:00:00.000Z',
    });
  });
});
