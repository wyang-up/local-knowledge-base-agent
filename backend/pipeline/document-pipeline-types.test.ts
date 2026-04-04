// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  getNextStageAfterSuccess,
  isTerminalStage,
  resolveResumeStage,
  toDocumentJobView,
  type DocumentJobRecord,
} from './document-pipeline-types.ts';

describe('document-pipeline-types', () => {
  it('maps success stage transitions', () => {
    expect(getNextStageAfterSuccess('uploaded')).toBe('parsing');
    expect(getNextStageAfterSuccess('quality_check')).toBe('embedding');
  });

  it('resolves resume stage from checkpoint', () => {
    expect(resolveResumeStage({ lastSuccessfulStage: 'embedding' })).toBe('storing');
    expect(resolveResumeStage({ lastSuccessfulStage: null })).toBe('parsing');
  });

  it('builds document job view with required progress and resume fields', () => {
    const record: DocumentJobRecord = {
      jobId: 'job-1',
      documentId: 'doc-1',
      priority: 1,
      queuePosition: 0,
      currentStage: 'embedding',
      jobStatus: 'running',
      stageProgress: 40,
      overallProgress: 72,
      processedUnits: 4,
      totalUnits: 10,
      retryCount: 1,
      resumeEligible: true,
      resumeInvalidReason: null,
      message: 'embedding now',
      errorCode: null,
      errorMessage: null,
      lastSuccessfulStage: 'quality_check',
      lastCheckpointAt: '2026-04-03T10:00:00.000Z',
      createdAt: '2026-04-03T09:00:00.000Z',
      startedAt: '2026-04-03T09:01:00.000Z',
      finishedAt: null,
      updatedAt: '2026-04-03T10:00:00.000Z',
    };

    const view = toDocumentJobView(record);

    expect(view).toMatchObject({
      jobId: 'job-1',
      currentStage: 'embedding',
      processedUnits: 4,
      totalUnits: 10,
      stageProgress: 40,
      overallProgress: 72,
      resumeEligible: true,
      retryCount: 1,
      message: 'embedding now',
    });
  });

  it('marks completed failed cancelled as terminal stages', () => {
    expect(isTerminalStage('completed')).toBe(true);
    expect(isTerminalStage('failed')).toBe(true);
    expect(isTerminalStage('cancelled')).toBe(true);
    expect(isTerminalStage('cleaning')).toBe(false);
  });
});
