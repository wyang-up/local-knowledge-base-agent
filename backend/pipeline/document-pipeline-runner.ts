import { resolveResumeStage, type PipelineStage } from './document-pipeline-types.ts';

type RunnerDeps = {
  runStage: (stage: PipelineStage) => Promise<void>;
};

export function createDocumentPipelineRunner(deps: RunnerDeps) {
  const executionOrder: PipelineStage[] = ['parsing', 'cleaning', 'chunking', 'quality_check', 'embedding', 'storing'];
  let embeddingLock: Promise<void> = Promise.resolve();

  async function runFromStage(stage: PipelineStage) {
    const startIndex = executionOrder.indexOf(stage);
    const stages = startIndex >= 0 ? executionOrder.slice(startIndex) : [];
    for (const nextStage of stages) {
      await deps.runStage(nextStage);
    }
  }

  return {
    runFromStage,

    async resumeDocument(input: {
      lastSuccessfulStage: PipelineStage | null;
      resumeEligible?: boolean;
      resumeInvalidReason?: string | null;
    }) {
      if (input.resumeEligible === false) {
        throw new Error(input.resumeInvalidReason ?? 'resume-not-eligible');
      }
      const stage = resolveResumeStage({ lastSuccessfulStage: input.lastSuccessfulStage });
      await runFromStage(stage);
      return { resumedStage: stage };
    },

    async retryFromStage(stage: PipelineStage) {
      await runFromStage(stage);
      return { retriedStage: stage };
    },

    async buildFailureRecovery(input: {
      failedStage: PipelineStage;
      errorCode: string;
      resumeEligible: boolean;
      resumeInvalidReason: string | null;
      processedUnits: number;
      totalUnits: number;
      now: string;
    }) {
      const lastSuccessfulStage = input.failedStage === 'embedding'
        ? 'quality_check'
        : (input.failedStage === 'storing' ? 'embedding' : null);

      return {
        documentStatus: 'failed',
        errorCode: input.errorCode,
        lastSuccessfulStage,
        resumeEligible: input.resumeEligible,
        resumeInvalidReason: input.resumeInvalidReason,
        lastCheckpointAt: input.now,
        processedUnits: input.processedUnits,
        totalUnits: input.totalUnits,
        retryStage: input.failedStage,
      };
    },

    isResumeEligible(input: { sourceMd5: string; checkpointMd5: string }) {
      if (input.sourceMd5 !== input.checkpointMd5) {
        return {
          eligible: false,
          reason: 'source-md5-changed',
        };
      }

      return {
        eligible: true,
        reason: null,
      };
    },

    async cancelDocument(input: { currentStage: PipelineStage }) {
      if (input.currentStage === 'embedding' || input.currentStage === 'storing') {
        return {
          status: 'cancelled',
          message: 'safely-stopping',
        };
      }

        return {
          status: 'cancelled',
          message: 'cancelled',
        };
      },

    async runEmbeddingWithLimit<T>(_documentId: string, task?: () => Promise<T>): Promise<T | void> {
      const previous = embeddingLock;
      let release!: () => void;
      embeddingLock = new Promise<void>((resolve) => {
        release = resolve;
      });

      await previous;
      try {
        if (task) {
          return await task();
        }
        await deps.runStage('embedding');
      } finally {
        release();
      }
    },
  };
}
