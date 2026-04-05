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
      {
        chunkId: 'doc-1-0',
        content: 'alpha',
        tokenCount: 10,
        retrievalEligible: true,
        lang: 'zh',
        title: null,
        hierarchy: [],
        level: 1,
        nodeType: 'body',
        pageStart: null,
        pageEnd: null,
      },
      {
        chunkId: 'doc-1-1',
        content: 'beta',
        tokenCount: 20,
        retrievalEligible: true,
        lang: 'zh',
        title: null,
        hierarchy: [],
        level: 1,
        nodeType: 'body',
        pageStart: null,
        pageEnd: null,
      },
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
      lang: 'zh',
      title: 'Chapter 1',
      hierarchy: ['Chapter 1'],
      level: 1,
      nodeType: 'body',
      createdAt: '2026-04-03T10:00:00.000Z',
      updatedAt: '2026-04-03T10:00:00.000Z',
    });
  });

  it('maps chunk-level tree metadata and range metadata into records', () => {
    const records = buildChunkMetadataRecords({
      documentId: 'doc-2',
      fileName: 'sample.docx',
      fileType: '.docx',
      filePath: '/tmp/sample.docx',
      embeddingModel: 'bge-m3',
      embeddingDim: 1024,
      cleaningApplied: [],
      now: '2026-04-05T10:00:00.000Z',
      chunks: [
        {
          chunkId: 'doc-2-0',
          sourceUnit: 'body',
          sourceLabel: 'Abstract',
          content: 'Abstract content',
          tokenCount: 32,
          overlapTokenCount: 0,
          qualityStatus: 'passed',
          qualityNote: null,
          lang: 'en',
          title: 'Abstract',
          hierarchy: ['Abstract'],
          sectionLevel: 1,
          nodeType: 'abstract',
          pageStart: 1,
          pageEnd: 1,
          retrievalEligible: true,
        },
      ],
    });

    expect(records[0]).toMatchObject({
      lang: 'en',
      title: 'Abstract',
      hierarchy: ['Abstract'],
      level: 1,
      nodeType: 'abstract',
      pageStart: 1,
      pageEnd: 1,
    });
  });
});
