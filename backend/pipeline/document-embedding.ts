type EmbeddingChunkInput = {
  chunkId: string;
  content: string;
  tokenCount?: number;
};

type EmbeddingResultChunk = EmbeddingChunkInput & {
  embedding: number[];
};

type EmbedChunksWithRetryInput = {
  chunks: EmbeddingChunkInput[];
  batchSize: number;
  maxRetries: number;
  embedBatch: (batch: EmbeddingChunkInput[]) => Promise<number[][]>;
  onProgress?: (event: { processedUnits: number; totalUnits: number; retryCount: number }) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
  failedBatchRatioThreshold?: number;
};

type RetryEvent = {
  batchIndex: number;
  chunkIds: string[];
  retryCount: number;
  reason: string;
  timestamp: string;
};

type BatchResult = {
  batchIndex: number;
  chunkIds: string[];
  status: 'succeeded' | 'failed';
  retryCount: number;
  lastError: string | null;
  retryTriggeredAt: string | null;
};

type EmbedChunksWithRetryResult = {
  embeddedChunks: EmbeddingResultChunk[];
  retryCount: number;
  batchSize: number;
  retryEvents: RetryEvent[];
  batchResults: BatchResult[];
  failedBatchCount: number;
  failedBatchRatio: {
    numerator: number;
    denominator: number;
    result: number;
  };
};

function chunkIntoBatches<T>(items: T[], batchSize: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

function isNonRetryableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('NON_RETRYABLE');
}

function getRetryDelayMs(attempt: number) {
  if (attempt === 1) return 2000;
  if (attempt === 2) return 5000;
  return 10000;
}

export function resolveEmbeddingBatchSize(chunks: Array<{ content: string; tokenCount?: number }>) {
  const largest = chunks.reduce((max, chunk) => Math.max(max, chunk.tokenCount ?? Math.ceil(chunk.content.length / 2)), 0);
  if (largest >= 1500) return 1;
  if (largest >= 500) return 4;
  return 8;
}

export async function embedChunksWithRetry(input: EmbedChunksWithRetryInput): Promise<EmbedChunksWithRetryResult> {
  const resolvedBatchSize = Math.max(1, input.batchSize);
  const batches = chunkIntoBatches(input.chunks, resolvedBatchSize);
  const embeddedChunks: EmbeddingResultChunk[] = [];
  let retryCount = 0;
  let processedUnits = 0;
  let failedBatchCount = 0;
  const retryEvents: RetryEvent[] = [];
  const batchResults: BatchResult[] = [];
  const now = input.now ?? (() => new Date().toISOString());
  const failedBatchRatioThreshold = input.failedBatchRatioThreshold ?? 0.3;

  for (const [batchIndex, batch] of batches.entries()) {
    let attempts = 0;
    const batchResult: BatchResult = {
      batchIndex,
      chunkIds: batch.map((item) => item.chunkId),
      status: 'failed',
      retryCount: 0,
      lastError: null,
      retryTriggeredAt: null,
    };

    while (true) {
      try {
        const vectors = await input.embedBatch(batch);
        batch.forEach((chunk, index) => {
          embeddedChunks.push({
            ...chunk,
            embedding: vectors[index] ?? [],
          });
          processedUnits += 1;
        });
        batchResult.status = 'succeeded';
        input.onProgress?.({ processedUnits, totalUnits: input.chunks.length, retryCount });
        break;
      } catch (error) {
        attempts += 1;
        retryCount += 1;
        batchResult.retryCount = attempts;
        batchResult.lastError = error instanceof Error ? error.message : String(error ?? 'unknown');
        batchResult.retryTriggeredAt = now();
        retryEvents.push({
          batchIndex,
          chunkIds: batchResult.chunkIds,
          retryCount: attempts,
          reason: batchResult.lastError,
          timestamp: batchResult.retryTriggeredAt,
        });

        if (isNonRetryableError(error)) {
          failedBatchCount += 1;
          batchResults.push(batchResult);
          throw error;
        }

        if (attempts > input.maxRetries) {
          failedBatchCount += 1;
          const failedBatchRatio = failedBatchCount / Math.max(1, batches.length);
          if (failedBatchRatio > failedBatchRatioThreshold) {
            batchResults.push(batchResult);
            throw error;
          }
          batchResults.push(batchResult);
          throw error;
        }

        if (input.sleep) {
          await input.sleep(getRetryDelayMs(attempts));
        }
      }
    }

    batchResults.push(batchResult);
  }

  return {
    embeddedChunks,
    retryCount,
    batchSize: resolvedBatchSize,
    retryEvents,
    batchResults,
    failedBatchCount,
    failedBatchRatio: {
      numerator: failedBatchCount,
      denominator: batches.length,
      result: batches.length === 0 ? 0 : failedBatchCount / batches.length,
    },
  };
}

export type { BatchResult, EmbedChunksWithRetryInput, EmbedChunksWithRetryResult, EmbeddingResultChunk, RetryEvent };
