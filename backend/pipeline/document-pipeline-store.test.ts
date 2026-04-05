// @vitest-environment node

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { describe, expect, it } from 'vitest';
import { createDocumentPipelineStore } from './document-pipeline-store.ts';

describe('document-pipeline-store', () => {
  it('persists job progress resume flags retry count and stage logs', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    const store = await createDocumentPipelineStore(db);

    await store.upsertJob({
      jobId: 'job-1',
      documentId: 'doc-1',
      priority: 1,
      queuePosition: 2,
      currentStage: 'chunking',
      jobStatus: 'running',
      processedUnits: 3,
      totalUnits: 9,
      stageProgress: 33,
      overallProgress: 40,
      retryCount: 1,
      resumeEligible: true,
      resumeInvalidReason: null,
      message: 'chunking now',
      errorCode: null,
      errorMessage: null,
      lastSuccessfulStage: 'cleaning',
      lastCheckpointAt: '2026-04-03T10:00:00.000Z',
      createdAt: '2026-04-03T09:00:00.000Z',
      startedAt: '2026-04-03T09:01:00.000Z',
      finishedAt: null,
      updatedAt: '2026-04-03T10:00:00.000Z',
    });

    await store.appendStageLog({
      jobId: 'job-1',
      documentId: 'doc-1',
      stage: 'chunking',
      message: 'entered stage',
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-04-03T10:00:00.000Z',
    });

    expect(await store.getJob('job-1')).toMatchObject({
      retryCount: 1,
      resumeEligible: true,
      processedUnits: 3,
      message: 'chunking now',
    });
    expect(await store.listStageLogs('job-1')).toHaveLength(1);
  });

  it('persists full chunk metadata contract', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    const store = await createDocumentPipelineStore(db);

    await store.replaceChunkMetadata('doc-1', [{
      chunkId: 'chunk-1',
      documentId: 'doc-1',
      fileName: 'a.pdf',
      fileType: 'pdf',
      sourcePath: '/tmp/a.pdf',
      sourceUnit: 'heading',
      sourceLabel: '第一章',
      chunkIndex: 0,
      tokenCount: 120,
      charCount: 300,
      overlapTokenCount: 40,
      qualityStatus: 'passed',
      qualityNote: '',
      cleaningApplied: ['remove_header'],
      embeddingModel: 'bge-m3',
      vectorDimension: 1024,
      storageStatus: 'pending',
      originStart: 'p1',
      originEnd: 'p2',
      lang: 'zh',
      title: '第一章',
      hierarchy: ['第一章'],
      level: 1,
      nodeType: 'chapter',
      pageStart: 1,
      pageEnd: 2,
      createdAt: '2026-04-03T00:00:00.000Z',
      updatedAt: '2026-04-03T00:00:00.000Z',
    }]);

    expect(await store.listChunkMetadata('doc-1')).toMatchObject([
      {
        sourceLabel: '第一章',
        storageStatus: 'pending',
        lang: 'zh',
        title: '第一章',
        hierarchy: ['第一章'],
        level: 1,
        nodeType: 'chapter',
        pageStart: 1,
        pageEnd: 2,
      },
    ]);
  });

  it('persists checkpoints with resume flags and invalid reasons', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    const store = await createDocumentPipelineStore(db);

    await store.saveCheckpoint({
      jobId: 'job-1',
      documentId: 'doc-1',
      lastSuccessfulStage: 'quality_check',
      processedUnits: 8,
      totalUnits: 10,
      resumeEligible: false,
      resumeInvalidReason: 'source-md5-changed',
      updatedAt: '2026-04-03T10:30:00.000Z',
    });

    expect(await store.getCheckpointByDocument('doc-1')).toMatchObject({
      resumeEligible: false,
      resumeInvalidReason: 'source-md5-changed',
    });
  });
});
