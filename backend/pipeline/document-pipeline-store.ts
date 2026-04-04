import type { Database } from 'sqlite';
import type { DocumentJobRecord, PipelineErrorCode, PipelineStage } from './document-pipeline-types.ts';

type StageLogRecord = {
  jobId: string;
  documentId: string;
  stage: PipelineStage;
  message: string;
  errorCode: PipelineErrorCode | null;
  errorMessage: string | null;
  createdAt: string;
};

type CheckpointRecord = {
  jobId: string;
  documentId: string;
  lastSuccessfulStage: PipelineStage;
  processedUnits: number;
  totalUnits: number;
  resumeEligible: boolean;
  resumeInvalidReason: string | null;
  updatedAt: string;
};

type ChunkMetadataRecord = {
  chunkId: string;
  documentId: string;
  fileName: string;
  fileType: string;
  sourcePath: string | null;
  sourceUnit: string;
  sourceLabel: string | null;
  chunkIndex: number;
  tokenCount: number;
  charCount: number;
  overlapTokenCount: number;
  qualityStatus: string;
  qualityNote: string | null;
  cleaningApplied: string[];
  embeddingModel: string;
  vectorDimension: number;
  storageStatus: string;
  originStart: string | null;
  originEnd: string | null;
  createdAt: string;
  updatedAt: string;
};

function toBooleanFlag(value: boolean) {
  return value ? 1 : 0;
}

function fromBooleanFlag(value: unknown) {
  return Number(value) === 1;
}

function mapJob(row: any): DocumentJobRecord | null {
  if (!row) return null;
  return {
    jobId: row.job_id,
    documentId: row.document_id,
    priority: Number(row.priority ?? 0),
    queuePosition: Number(row.queue_position ?? 0),
    currentStage: row.current_stage,
    jobStatus: row.job_status,
    stageProgress: Number(row.stage_progress ?? 0),
    overallProgress: Number(row.overall_progress ?? 0),
    processedUnits: Number(row.processed_units ?? 0),
    totalUnits: Number(row.total_units ?? 0),
    retryCount: Number(row.retry_count ?? 0),
    resumeEligible: fromBooleanFlag(row.resume_eligible),
    resumeInvalidReason: row.resume_invalid_reason,
    message: row.message ?? '',
    errorCode: row.error_code,
    errorMessage: row.error_message,
    lastSuccessfulStage: row.last_successful_stage,
    lastCheckpointAt: row.last_checkpoint_at,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  } as DocumentJobRecord;
}

function mapChunk(row: any): ChunkMetadataRecord {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    fileName: row.file_name,
    fileType: row.file_type,
    sourcePath: row.source_path,
    sourceUnit: row.source_unit,
    sourceLabel: row.source_label,
    chunkIndex: Number(row.chunk_index ?? 0),
    tokenCount: Number(row.token_count ?? 0),
    charCount: Number(row.char_count ?? 0),
    overlapTokenCount: Number(row.overlap_token_count ?? 0),
    qualityStatus: row.quality_status,
    qualityNote: row.quality_note,
    cleaningApplied: JSON.parse(row.cleaning_applied_json ?? '[]'),
    embeddingModel: row.embedding_model,
    vectorDimension: Number(row.vector_dimension ?? 0),
    storageStatus: row.storage_status,
    originStart: row.origin_start,
    originEnd: row.origin_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createDocumentPipelineStore(db: Database) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS document_jobs (
      job_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      priority INTEGER NOT NULL,
      queue_position INTEGER NOT NULL,
      current_stage TEXT NOT NULL,
      job_status TEXT NOT NULL,
      stage_progress REAL NOT NULL,
      overall_progress REAL NOT NULL,
      processed_units INTEGER NOT NULL,
      total_units INTEGER NOT NULL,
      retry_count INTEGER NOT NULL,
      resume_eligible INTEGER NOT NULL,
      resume_invalid_reason TEXT,
      message TEXT NOT NULL,
      error_code TEXT,
      error_message TEXT,
      last_successful_stage TEXT,
      last_checkpoint_at TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_job_checkpoints (
      document_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      last_successful_stage TEXT NOT NULL,
      processed_units INTEGER NOT NULL,
      total_units INTEGER NOT NULL,
      resume_eligible INTEGER NOT NULL,
      resume_invalid_reason TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_chunk_metadata (
      chunk_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      source_path TEXT,
      source_unit TEXT NOT NULL,
      source_label TEXT,
      chunk_index INTEGER NOT NULL,
      token_count INTEGER NOT NULL,
      char_count INTEGER NOT NULL,
      overlap_token_count INTEGER NOT NULL,
      quality_status TEXT NOT NULL,
      quality_note TEXT,
      cleaning_applied_json TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      vector_dimension INTEGER NOT NULL,
      storage_status TEXT NOT NULL,
      origin_start TEXT,
      origin_end TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_stage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      message TEXT NOT NULL,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    );
  `);

  return {
    async upsertJob(record: DocumentJobRecord) {
      await db.run(
        `INSERT INTO document_jobs (
          job_id, document_id, priority, queue_position, current_stage, job_status,
          stage_progress, overall_progress, processed_units, total_units, retry_count,
          resume_eligible, resume_invalid_reason, message, error_code, error_message,
          last_successful_stage, last_checkpoint_at, created_at, started_at, finished_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
          document_id = excluded.document_id,
          priority = excluded.priority,
          queue_position = excluded.queue_position,
          current_stage = excluded.current_stage,
          job_status = excluded.job_status,
          stage_progress = excluded.stage_progress,
          overall_progress = excluded.overall_progress,
          processed_units = excluded.processed_units,
          total_units = excluded.total_units,
          retry_count = excluded.retry_count,
          resume_eligible = excluded.resume_eligible,
          resume_invalid_reason = excluded.resume_invalid_reason,
          message = excluded.message,
          error_code = excluded.error_code,
          error_message = excluded.error_message,
          last_successful_stage = excluded.last_successful_stage,
          last_checkpoint_at = excluded.last_checkpoint_at,
          created_at = excluded.created_at,
          started_at = excluded.started_at,
          finished_at = excluded.finished_at,
          updated_at = excluded.updated_at`,
        [
          record.jobId,
          record.documentId,
          record.priority,
          record.queuePosition,
          record.currentStage,
          record.jobStatus,
          record.stageProgress,
          record.overallProgress,
          record.processedUnits,
          record.totalUnits,
          record.retryCount,
          toBooleanFlag(record.resumeEligible),
          record.resumeInvalidReason,
          record.message,
          record.errorCode,
          record.errorMessage,
          record.lastSuccessfulStage,
          record.lastCheckpointAt,
          record.createdAt,
          record.startedAt,
          record.finishedAt,
          record.updatedAt,
        ],
      );
    },

    async getJob(jobId: string) {
      return mapJob(await db.get('SELECT * FROM document_jobs WHERE job_id = ?', jobId));
    },

    async listJobs() {
      const rows = await db.all('SELECT * FROM document_jobs ORDER BY priority DESC, queue_position ASC, created_at ASC');
      return rows.map(mapJob).filter(Boolean);
    },

    async appendStageLog(record: StageLogRecord) {
      await db.run(
        `INSERT INTO document_stage_logs (job_id, document_id, stage, message, error_code, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [record.jobId, record.documentId, record.stage, record.message, record.errorCode, record.errorMessage, record.createdAt],
      );
    },

    async listStageLogs(jobId: string) {
      return db.all('SELECT * FROM document_stage_logs WHERE job_id = ? ORDER BY id ASC', jobId);
    },

    async saveCheckpoint(record: CheckpointRecord) {
      await db.run(
        `INSERT INTO document_job_checkpoints (
          document_id, job_id, last_successful_stage, processed_units, total_units,
          resume_eligible, resume_invalid_reason, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
          job_id = excluded.job_id,
          last_successful_stage = excluded.last_successful_stage,
          processed_units = excluded.processed_units,
          total_units = excluded.total_units,
          resume_eligible = excluded.resume_eligible,
          resume_invalid_reason = excluded.resume_invalid_reason,
          updated_at = excluded.updated_at`,
        [
          record.documentId,
          record.jobId,
          record.lastSuccessfulStage,
          record.processedUnits,
          record.totalUnits,
          toBooleanFlag(record.resumeEligible),
          record.resumeInvalidReason,
          record.updatedAt,
        ],
      );
    },

    async getCheckpointByDocument(documentId: string) {
      const row = await db.get('SELECT * FROM document_job_checkpoints WHERE document_id = ?', documentId);
      if (!row) return null;
      return {
        jobId: row.job_id,
        documentId: row.document_id,
        lastSuccessfulStage: row.last_successful_stage,
        processedUnits: Number(row.processed_units ?? 0),
        totalUnits: Number(row.total_units ?? 0),
        resumeEligible: fromBooleanFlag(row.resume_eligible),
        resumeInvalidReason: row.resume_invalid_reason,
        updatedAt: row.updated_at,
      } as CheckpointRecord;
    },

    async clearCheckpoint(documentId: string) {
      await db.run('DELETE FROM document_job_checkpoints WHERE document_id = ?', documentId);
    },

    async replaceChunkMetadata(documentId: string, records: ChunkMetadataRecord[]) {
      await db.run('DELETE FROM document_chunk_metadata WHERE document_id = ?', documentId);
      for (const record of records) {
        await db.run(
          `INSERT INTO document_chunk_metadata (
            chunk_id, document_id, file_name, file_type, source_path, source_unit, source_label,
            chunk_index, token_count, char_count, overlap_token_count, quality_status, quality_note,
            cleaning_applied_json, embedding_model, vector_dimension, storage_status,
            origin_start, origin_end, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            record.chunkId,
            record.documentId,
            record.fileName,
            record.fileType,
            record.sourcePath,
            record.sourceUnit,
            record.sourceLabel,
            record.chunkIndex,
            record.tokenCount,
            record.charCount,
            record.overlapTokenCount,
            record.qualityStatus,
            record.qualityNote,
            JSON.stringify(record.cleaningApplied),
            record.embeddingModel,
            record.vectorDimension,
            record.storageStatus,
            record.originStart,
            record.originEnd,
            record.createdAt,
            record.updatedAt,
          ],
        );
      }
    },

    async listChunkMetadata(documentId: string) {
      const rows = await db.all('SELECT * FROM document_chunk_metadata WHERE document_id = ? ORDER BY chunk_index ASC', documentId);
      return rows.map(mapChunk);
    },
  };
}
