export const PIPELINE_STAGES = [
  'uploaded',
  'parsing',
  'cleaning',
  'chunking',
  'quality_check',
  'embedding',
  'storing',
  'completed',
  'failed',
  'cancelled',
] as const;

export type PipelineStage = typeof PIPELINE_STAGES[number];

export const JOB_STATUSES = ['queued', 'running', 'paused', 'failed', 'cancelled', 'completed'] as const;

export type JobStatus = typeof JOB_STATUSES[number];

export const PIPELINE_ERROR_CODES = [
  'INVALID_FILE',
  'PARSING_FAILED',
  'CLEANING_FAILED',
  'CHUNKING_FAILED',
  'QUALITY_CHECK_FAILED',
  'EMBEDDING_FAILED',
  'EMBEDDING_TIMEOUT',
  'STORING_FAILED',
  'STORE_LOCKED',
  'CHECKPOINT_INVALID',
  'USER_CANCELLED',
  'CONFIG_REQUIRED',
] as const;

export type PipelineErrorCode = typeof PIPELINE_ERROR_CODES[number];

export type DocumentJobRecord = {
  jobId: string;
  documentId: string;
  priority: number;
  queuePosition: number;
  currentStage: PipelineStage;
  jobStatus: JobStatus;
  stageProgress: number;
  overallProgress: number;
  processedUnits: number;
  totalUnits: number;
  retryCount: number;
  resumeEligible: boolean;
  resumeInvalidReason: string | null;
  message: string;
  errorCode: PipelineErrorCode | null;
  errorMessage: string | null;
  lastSuccessfulStage: PipelineStage | null;
  lastCheckpointAt: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type DocumentJobView = DocumentJobRecord & {
  canResume: boolean;
  canRetry: boolean;
  canReparse: boolean;
};

const SUCCESS_STAGE_FLOW: Record<Exclude<PipelineStage, 'completed' | 'failed' | 'cancelled'>, PipelineStage> = {
  uploaded: 'parsing',
  parsing: 'cleaning',
  cleaning: 'chunking',
  chunking: 'quality_check',
  quality_check: 'embedding',
  embedding: 'storing',
  storing: 'completed',
};

export function getNextStageAfterSuccess(stage: PipelineStage): PipelineStage {
  if (stage in SUCCESS_STAGE_FLOW) {
    return SUCCESS_STAGE_FLOW[stage as keyof typeof SUCCESS_STAGE_FLOW];
  }

  return stage;
}

export function isTerminalStage(stage: PipelineStage): boolean {
  return stage === 'completed' || stage === 'failed' || stage === 'cancelled';
}

export function resolveResumeStage(input: { lastSuccessfulStage: PipelineStage | null }): PipelineStage {
  if (!input.lastSuccessfulStage) {
    return 'parsing';
  }

  return getNextStageAfterSuccess(input.lastSuccessfulStage);
}

export function toDocumentJobView(input: DocumentJobRecord): DocumentJobView {
  return {
    ...input,
    canResume: input.resumeEligible && (input.jobStatus === 'failed' || input.jobStatus === 'cancelled'),
    canRetry: input.jobStatus === 'failed',
    canReparse: input.jobStatus === 'failed' || input.jobStatus === 'cancelled' || input.jobStatus === 'completed',
  };
}
