import type { PipelineStage } from './document-pipeline-types.ts';

type ChunkDraftLike = {
  chunkId?: string;
  sourceUnit: string;
  sourceLabel: string | null;
  content: string;
  tokenCount: number;
  overlapTokenCount?: number;
  qualityStatus: string;
  qualityNote?: string | null;
  retrievalEligible?: boolean;
  sectionLevel?: number;
  sectionType?: string;
};

export function buildEmbeddingInputs(documentId: string, chunkDrafts: Array<{ content: string; tokenCount?: number }>) {
  return chunkDrafts.map((chunk: any, index) => ({
    chunkId: chunk.chunkId ?? `${documentId}-${index}`,
    content: chunk.content,
    tokenCount: chunk.tokenCount,
    retrievalEligible: chunk.retrievalEligible ?? true,
  }));
}

export function resolvePipelineErrorCode(stage: PipelineStage) {
  switch (stage) {
    case 'cleaning':
      return 'CLEANING_FAILED';
    case 'chunking':
      return 'CHUNKING_FAILED';
    case 'quality_check':
      return 'QUALITY_CHECK_FAILED';
    case 'embedding':
      return 'EMBEDDING_FAILED';
    case 'storing':
      return 'STORING_FAILED';
    case 'parsing':
    default:
      return 'PARSING_FAILED';
  }
}

export function buildFailureRecoveryInput(stage: PipelineStage) {
  return {
    failedStage: stage,
    errorCode: resolvePipelineErrorCode(stage),
  };
}

export function buildChunkMetadataRecords(input: {
  documentId: string;
  fileName: string;
  fileType: string;
  filePath: string;
  embeddingModel: string;
  embeddingDim: number;
  cleaningApplied: string[];
  now: string;
  chunks: ChunkDraftLike[];
}) {
  return input.chunks.map((chunk, index) => ({
    chunkId: chunk.chunkId ?? `${input.documentId}-${index}`,
    documentId: input.documentId,
    fileName: input.fileName,
    fileType: input.fileType.replace(/^\./, ''),
    sourcePath: input.filePath,
    sourceUnit: chunk.sourceUnit,
    sourceLabel: chunk.sourceLabel,
    chunkIndex: index,
    tokenCount: chunk.tokenCount,
    charCount: chunk.content.length,
    overlapTokenCount: chunk.overlapTokenCount ?? 0,
    qualityStatus: chunk.qualityStatus,
    qualityNote: chunk.qualityNote ?? null,
    cleaningApplied: input.cleaningApplied,
    embeddingModel: input.embeddingModel,
    vectorDimension: input.embeddingDim,
    storageStatus: 'stored',
    originStart: chunk.sourceLabel ? `${chunk.sourceLabel}:start` : 'body:start',
    originEnd: chunk.sourceLabel ? `${chunk.sourceLabel}:end` : 'body:end',
    createdAt: input.now,
    updatedAt: input.now,
  }));
}
