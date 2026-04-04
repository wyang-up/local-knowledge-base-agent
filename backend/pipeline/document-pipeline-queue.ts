type QueueJob = {
  jobId: string;
  documentId: string;
  priority: number;
  isHeavy: boolean;
  message?: string;
};

type QueueOptions = {
  maxHeavyJobs?: number;
};

export function createDocumentPipelineQueue(options: QueueOptions = {}) {
  const jobs: QueueJob[] = [];
  const activeDocuments = new Set<string>();
  const maxHeavyJobs = options.maxHeavyJobs ?? 1;

  return {
    enqueue(job: QueueJob) {
      if (activeDocuments.has(job.documentId) || jobs.some((item) => item.documentId === job.documentId)) {
        return;
      }

      jobs.push(job);
    },

    next() {
      const index = jobs.findIndex((job) => !(job.isHeavy && maxHeavyJobs <= 0));
      if (index === -1) {
        jobs.forEach((job) => {
          if (job.isHeavy) {
            job.message = 'waiting-for-resources';
          }
        });
        return null;
      }

      const [job] = jobs.splice(index, 1);
      activeDocuments.add(job.documentId);
      return job;
    },

    complete(documentId: string) {
      activeDocuments.delete(documentId);
    },

    listQueued() {
      return jobs;
    },
  };
}
