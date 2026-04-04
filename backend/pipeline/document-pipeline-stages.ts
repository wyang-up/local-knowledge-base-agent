type EmbeddingConfig = {
  baseUrl: string;
  embeddingModel: string;
  apiKey: string;
};

type EmbeddedChunk = {
  chunkId: string;
  content: string;
  embedding: number[];
};

type EmbedResult = {
  embeddedChunks: EmbeddedChunk[];
};

type StoringConfig = {
  embeddingModel: string;
};

type StageDeps = {
  writeDocumentStage: (docId: string, stage: string, patch: Record<string, unknown>) => Promise<unknown>;
  artifactStore: { saveArtifact: (documentId: string, stage: string, payload: unknown, fingerprint?: Record<string, unknown>) => Promise<unknown> };
  pipelineStore: {
    saveCheckpoint: (record: Record<string, unknown>) => Promise<unknown>;
    replaceChunkMetadata?: (documentId: string, records: unknown[]) => Promise<unknown>;
  };
  pipelineRunner: { runEmbeddingWithLimit: (documentId: string, task: () => Promise<unknown>) => Promise<unknown> };
  resolveEmbeddingBatchSize: (chunks: Array<{ content: string; tokenCount?: number }>) => number;
  embedChunksWithRetry: (input: Record<string, any>) => Promise<EmbedResult>;
  embeddingDim: number;
  siliconflowTimeoutMs: number;
  postEmbeddings: (args: { baseUrl: string; embeddingModel: string; apiKey: string; batch: Array<{ content: string }> }) => Promise<number[][]>;
  ensureChunkTable: (chunks: unknown[]) => Promise<unknown>;
  addVectorChunks: (chunks: unknown[]) => Promise<unknown>;
  storeEmbeddedChunks: (input: Record<string, any>) => Promise<unknown>;
  buildChunkMetadataRecords: (input: Record<string, any>) => unknown[];
  now: () => string;
};

export function createDocumentPipelineStages(deps: StageDeps) {
  return {
    async runEmbeddingStage(input: {
      doc: { id: string; md5: string };
      chunkDrafts: Array<{ content: string; tokenCount?: number }>;
      jobId: string;
      config: EmbeddingConfig;
    }) {
      const embeddingInputs = input.chunkDrafts.map((chunk, index) => ({
        chunkId: `${input.doc.id}-${index}`,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
      }));
      const batchSize = deps.resolveEmbeddingBatchSize(embeddingInputs);
      const startedAt = deps.now();

      await deps.writeDocumentStage(input.doc.id, 'embedding', {
        stageProgress: 70,
        overallProgress: 70,
        message: `embedding chunks (batchSize=${batchSize})`,
        processedUnits: 0,
        totalUnits: input.chunkDrafts.length,
        lastSuccessfulStage: 'quality_check',
        lastCheckpointAt: startedAt,
        resumeEligible: true,
        resumeInvalidReason: null,
      });

      const embedded = await deps.pipelineRunner.runEmbeddingWithLimit(input.doc.id, async () => deps.embedChunksWithRetry({
        chunks: embeddingInputs,
        batchSize,
        maxRetries: 3,
        failedBatchRatioThreshold: 0.3,
        sleep: async () => undefined,
        onProgress: async (event: { processedUnits: number; totalUnits: number; retryCount: number }) => {
          await deps.writeDocumentStage(input.doc.id, 'embedding', {
            processedUnits: event.processedUnits,
            totalUnits: event.totalUnits,
            retryCount: event.retryCount,
            stageProgress: event.totalUnits === 0 ? 100 : Math.round((event.processedUnits / event.totalUnits) * 100),
            overallProgress: 70 + Math.round((event.processedUnits / Math.max(1, event.totalUnits)) * 15),
            message: `embedding chunks (batchSize=${batchSize})`,
            lastSuccessfulStage: 'quality_check',
            resumeEligible: true,
            resumeInvalidReason: null,
            lastCheckpointAt: deps.now(),
          });
        },
        embedBatch: (batch: Array<{ content: string }>) => deps.postEmbeddings({
          baseUrl: input.config.baseUrl,
          embeddingModel: input.config.embeddingModel,
          apiKey: input.config.apiKey,
          batch,
        }),
      })) as EmbedResult;

      await deps.artifactStore.saveArtifact(input.doc.id, 'embedding', embedded, { md5: input.doc.md5 });
      await deps.pipelineStore.saveCheckpoint({
        jobId: input.jobId,
        documentId: input.doc.id,
        lastSuccessfulStage: 'embedding',
        processedUnits: embedded.embeddedChunks.length,
        totalUnits: embedded.embeddedChunks.length,
        resumeEligible: true,
        resumeInvalidReason: null,
        updatedAt: deps.now(),
      });
      return embedded;
    },

    async runStoringStage(input: {
      doc: { id: string; name: string; type: string };
      filePath: string;
      chunkDrafts: Array<Record<string, any>>;
      cleaned: { cleaningApplied: string[] };
      embedded: { embeddedChunks: Array<{ chunkId: string; content: string; embedding: number[] }> };
      config: StoringConfig;
      chunkTableExists: boolean;
    }) {
      await deps.writeDocumentStage(input.doc.id, 'storing', {
        stageProgress: 90,
        overallProgress: 90,
        message: 'storing vectors',
        processedUnits: input.embedded.embeddedChunks.length,
        totalUnits: input.embedded.embeddedChunks.length,
        lastSuccessfulStage: 'embedding',
        lastCheckpointAt: deps.now(),
      });

      const vectorChunks = input.embedded.embeddedChunks.map((chunk, index) => ({
        id: chunk.chunkId,
        docId: input.doc.id,
        content: chunk.content,
        chunkIndex: index,
        embedding: new Float32Array(chunk.embedding),
      }));

      await deps.storeEmbeddedChunks({
        documentId: input.doc.id,
        chunks: input.embedded.embeddedChunks,
        addToVectorStore: async () => {
          if (vectorChunks.length === 0) return;
          if (!input.chunkTableExists) {
            await deps.ensureChunkTable(vectorChunks);
          } else {
            await deps.addVectorChunks(vectorChunks);
          }
        },
        saveMetadata: async () => {
          const records = deps.buildChunkMetadataRecords({
            documentId: input.doc.id,
            fileName: input.doc.name,
            fileType: input.doc.type,
            filePath: input.filePath,
            embeddingModel: input.config.embeddingModel,
            embeddingDim: deps.embeddingDim,
            cleaningApplied: input.cleaned.cleaningApplied,
            now: deps.now(),
            chunks: input.chunkDrafts,
          });
          await deps.pipelineStore.replaceChunkMetadata?.(input.doc.id, records);
        },
      });
    },
  };
}
