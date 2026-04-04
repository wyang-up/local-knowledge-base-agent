// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createDocumentPipelineQueue } from './document-pipeline-queue.ts';

describe('document-pipeline-queue', () => {
  it('keeps fifo ordering and only one active job per document', () => {
    const queue = createDocumentPipelineQueue();

    queue.enqueue({ jobId: 'job-1', documentId: 'doc-1', priority: 0, isHeavy: false });
    queue.enqueue({ jobId: 'job-2', documentId: 'doc-2', priority: 0, isHeavy: false });
    queue.enqueue({ jobId: 'job-3', documentId: 'doc-1', priority: 0, isHeavy: false });

    expect(queue.next()?.jobId).toBe('job-1');
    expect(queue.next()?.jobId).toBe('job-2');
    expect(queue.next()).toBeNull();
  });

  it('delays heavy jobs under resource guard', () => {
    const queue = createDocumentPipelineQueue({ maxHeavyJobs: 0 });
    queue.enqueue({ jobId: 'job-1', documentId: 'doc-1', priority: 0, isHeavy: true });

    expect(queue.next()).toBeNull();
    expect(queue.listQueued()[0]?.message).toBe('waiting-for-resources');
  });
});
