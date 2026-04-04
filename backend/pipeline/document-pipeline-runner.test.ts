// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createDocumentPipelineRunner } from './document-pipeline-runner.ts';

describe('document-pipeline-runner', () => {
  it('resumes from next stage after last successful checkpoint', async () => {
    const calls: string[] = [];
    const runner = createDocumentPipelineRunner({
      runStage: vi.fn(async (stage: string) => {
        calls.push(stage);
      }),
    });

    await runner.resumeDocument({ lastSuccessfulStage: 'embedding' });

    expect(calls).toEqual(['storing']);
  });

  it('marks resume invalid when source md5 changes', async () => {
    const runner = createDocumentPipelineRunner({ runStage: vi.fn() });

    expect(runner.isResumeEligible({ sourceMd5: 'new', checkpointMd5: 'old' })).toEqual({
      eligible: false,
      reason: 'source-md5-changed',
    });
  });

  it('stops safely and marks job cancelled when user cancels during embedding', async () => {
    const runner = createDocumentPipelineRunner({ runStage: vi.fn() });

    const result = await runner.cancelDocument({ currentStage: 'embedding' });

    expect(result).toEqual({ status: 'cancelled', message: 'safely-stopping' });
  });

  it('runs only remaining stages when resuming from checkpoint', async () => {
    const calls: string[] = [];
    const runner = createDocumentPipelineRunner({
      runStage: vi.fn(async (stage: string) => {
        calls.push(stage);
      }),
    });

    await runner.runFromStage('cleaning');

    expect(calls).toEqual(['cleaning', 'chunking', 'quality_check', 'embedding', 'storing']);
  });

  it('retries from failed stage instead of restarting from upload', async () => {
    const calls: string[] = [];
    const runner = createDocumentPipelineRunner({
      runStage: vi.fn(async (stage: string) => {
        calls.push(stage);
      }),
    });

    await runner.retryFromStage('embedding');

    expect(calls).toEqual(['embedding', 'storing']);
  });

  it('does not resume embedding-stage retry when checkpoint is not eligible', async () => {
    const calls: string[] = [];
    const runner = createDocumentPipelineRunner({
      runStage: vi.fn(async (stage: string) => {
        calls.push(stage);
      }),
    });

    await expect(runner.resumeDocument({
      lastSuccessfulStage: 'quality_check',
      resumeEligible: false,
      resumeInvalidReason: 'checkpoint-corrupted',
    })).rejects.toThrow('checkpoint-corrupted');

    expect(calls).toEqual([]);
  });

  it('returns durable resume metadata for embedding failure recovery', async () => {
    const runner = createDocumentPipelineRunner({ runStage: vi.fn() });

    const recovery = await runner.buildFailureRecovery({
      failedStage: 'embedding',
      errorCode: 'EMBEDDING_FAILED',
      resumeEligible: true,
      resumeInvalidReason: null,
      processedUnits: 3,
      totalUnits: 10,
      now: '2026-04-03T16:30:00.000Z',
    });

    expect(recovery).toMatchObject({
      documentStatus: 'failed',
      errorCode: 'EMBEDDING_FAILED',
      lastSuccessfulStage: 'quality_check',
      resumeEligible: true,
      resumeInvalidReason: null,
      lastCheckpointAt: '2026-04-03T16:30:00.000Z',
      processedUnits: 3,
      totalUnits: 10,
      retryStage: 'embedding',
    });
  });

  it('keeps embedding stage concurrency at one document', async () => {
    let activeEmbeddings = 0;
    let maxActiveEmbeddings = 0;
    const runner = createDocumentPipelineRunner({
      runStage: vi.fn(async (stage: string) => {
        if (stage === 'embedding') {
          activeEmbeddings += 1;
          maxActiveEmbeddings = Math.max(maxActiveEmbeddings, activeEmbeddings);
          await new Promise((resolve) => setTimeout(resolve, 5));
          activeEmbeddings -= 1;
        }
      }),
    });

    await Promise.all([
      runner.runEmbeddingWithLimit('doc-1'),
      runner.runEmbeddingWithLimit('doc-2'),
    ]);

    expect(maxActiveEmbeddings).toBe(1);
  });

  it('returns embedding task result when run with limit', async () => {
    const runner = createDocumentPipelineRunner({
      runStage: vi.fn(),
    });

    const result = await runner.runEmbeddingWithLimit('doc-1', async () => ({
      embeddedChunks: [{ chunkId: 'doc-1-0', content: 'hello', embedding: [0.1, 0.2] }],
    }));

    expect(result).toEqual({
      embeddedChunks: [{ chunkId: 'doc-1-0', content: 'hello', embedding: [0.1, 0.2] }],
    });
  });
});
