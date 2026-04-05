import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import crypto from 'crypto';
import axios from 'axios';
import * as xlsx from 'xlsx';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { decodePlainTextBuffer, extractPdfText, normalizeUploadedFilename } from './utils/server-utils.ts';
import { resolveLancePath } from './storage/lance-path.ts';
import { buildMcpNotification, buildMcpResult, encodeMcpJsonLine } from './utils/mcp-utils.ts';
import { parseOpenAIStreamBuffer } from './utils/stream-utils.ts';
import { buildPreviewError, buildPreviewResponsePlan } from './utils/document-preview-content.ts';
import type { KeySecurityService } from './settings/key-security.ts';
import { registerSettingsRoutes as registerSettingsRoutesImpl } from './settings/settings-routes.ts';
import { createSettingsAuditContext } from './settings/settings-auth.ts';
import { getSettingsStore, handleSettingsRouteError } from './settings/settings-store.ts';
import { connect } from '@lancedb/lancedb';
import { createDocumentPipelineStore } from './pipeline/document-pipeline-store.ts';
import { createDocumentArtifactStore } from './pipeline/document-artifact-store.ts';
import { parseDocument } from './pipeline/document-parser.ts';
import { cleanDocumentText } from './pipeline/document-cleaner.ts';
import { chunkDocument, qualityCheckChunks } from './pipeline/document-chunker.ts';
import { embedChunksWithRetry, resolveEmbeddingBatchSize } from './pipeline/document-embedding.ts';
import { storeEmbeddedChunks } from './pipeline/document-storage-writer.ts';
import { createDocumentPipelineRunner } from './pipeline/document-pipeline-runner.ts';
import { buildChunkMetadataRecords, buildEmbeddingInputs, buildFailureRecoveryInput, resolvePipelineErrorCode } from './pipeline/document-pipeline-helpers.ts';
import { createDocumentPipelineStages } from './pipeline/document-pipeline-stages.ts';
import { deleteDocumentResources } from './pipeline/document-delete.ts';
import { resolveResumeStage, type DocumentJobRecord, type PipelineStage } from './pipeline/document-pipeline-types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(PROJECT_ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'kb.db');
const CONFIGURED_LANCE_PATH = process.env.LANCE_PATH || path.join(DATA_DIR, 'lance');
const LANCE_FALLBACK_PATH = process.env.LANCE_FALLBACK_PATH || '/tmp/local-knowledge-base-agent-lance';
const LANCE_PATH = resolveLancePath(CONFIGURED_LANCE_PATH, LANCE_FALLBACK_PATH);
const ARTIFACTS_PATH = path.join(DATA_DIR, 'pipeline-artifacts');
const SILICONFLOW_TIMEOUT_MS = Number(process.env.SILICONFLOW_TIMEOUT_MS || 20000);
const DEBUG_STARTUP = process.env.DEBUG_STARTUP === '1';
const EMBEDDING_DIM = 1024;

const DEFAULT_BASE_URL = process.env.BASE_URL || 'https://api.siliconflow.cn/v1';
const DEFAULT_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'BAAI/bge-m3';
const DEFAULT_LLM_MODEL = process.env.LLM_MODEL || 'deepseek-ai/DeepSeek-V3';
const SYSTEM_PROMPT_TEMPLATE = `你是「本地知识库Agent助手」，专为个人本地知识库问答服务。

【核心铁则】
1. 知识优先原则：当系统提供了「文档上下文」时，结论必须基于片段原文，严禁凭空捏造或脑补数据。
2. 内容补充规则：片段信息不足以完整回答问题时，可自然补充通用知识，不使用生硬模板话术打断体验。
3. 空白对话规则：未检索到任何文档片段时，切换通用助手模式正常交流，不拒绝回答。
4. 格式强制规范：全文使用 Markdown 输出；关键数据和专业名词使用**加粗**；多条内容使用无序列表；对比统计数据优先表格。
5. 结构化严谨要求：解析 Excel 报表、JSON 日志、PDF 合同类内容时，严格核对数字、时间、字段含义，保证准确。
6. 语言风格：简洁、专业、克制，无冗余开场白与客套，聚焦解决用户问题。

【回答流程】
1.后端接收用户提问 → 执行向量检索，获取相关文档片段。
2.后端统一拼接：检索片段 + 系统约束 Prompt + 用户问题 一并送入 LLM。
3.LLM 流式生成答案，前端实时逐 Token 渲染。
4.流式回答结束后，后端下发完整溯源源数据。
5.前端统一在回答底部渲染可点击「文档溯源列表」。

以下是系统检索到的【文档上下文】（如果为空，则代表无需参考本地文档）：
<context>
{{INJECT_CONTEXT_HERE}}
</context>`;

type RuntimeConfig = {
  baseUrl: string;
  embeddingModel: string;
  llmModel: string;
  apiKey: string;
  storagePath: string;
  documentStoragePath: string;
};

type ChatHistoryItem = {
  role: 'user' | 'assistant';
  content: string;
};

type PreviewFlagsByType = {
  pdf: boolean;
  table: boolean;
  json: boolean;
  text: boolean;
};

type PreviewFlagsResponse = {
  enableNewPreviewModal: boolean;
  enableNewPreviewByType: PreviewFlagsByType;
};

function normalizeChatHistory(input: unknown): ChatHistoryItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      const role = item?.role;
      const content = item?.content;
      if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
        return { role, content: content.trim() } as ChatHistoryItem;
      }
      return null;
    })
    .filter(Boolean) as ChatHistoryItem[];
}

function buildChatMessages(systemPrompt: string, history: ChatHistoryItem[], userMessage: string) {
  return [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

async function getRuntimeConfig(db: any): Promise<RuntimeConfig> {
  const row = await db.get('SELECT base_url, embedding_model, llm_model, api_key FROM model_config WHERE id = 1');
  const baseUrl = typeof row?.base_url === 'string' ? normalizeBaseUrl(row.base_url) : DEFAULT_BASE_URL;
  const embeddingModel = typeof row?.embedding_model === 'string' ? row.embedding_model : DEFAULT_EMBEDDING_MODEL;
  const llmModel = typeof row?.llm_model === 'string' ? row.llm_model : DEFAULT_LLM_MODEL;
  const apiKey = typeof row?.api_key === 'string' ? row.api_key.trim() : '';

  return {
    baseUrl,
    embeddingModel,
    llmModel,
    apiKey,
    storagePath: LANCE_PATH,
    documentStoragePath: UPLOADS_DIR,
  };
}

function readOpenAIEmbedding(data: any): number[] {
  const embedding = data?.data?.[0]?.embedding;
  return Array.isArray(embedding) ? embedding : [];
}

function buildSystemPrompt(context: string) {
  return SYSTEM_PROMPT_TEMPLATE.replace('{{INJECT_CONTEXT_HERE}}', context);
}

function parseBooleanEnvFlag(raw: string | undefined, fallback: boolean) {
  if (typeof raw !== 'string') {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') {
    return true;
  }

  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
    return false;
  }

  return fallback;
}

function parsePreviewByType(raw: string | undefined): PreviewFlagsByType {
  const defaults: PreviewFlagsByType = {
    pdf: true,
    table: true,
    json: true,
    text: true,
  };

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaults;
  }

  const result: PreviewFlagsByType = { ...defaults };
  const pairs = raw.split(',');
  for (const pair of pairs) {
    const [rawKey, rawValue] = pair.split(':', 2);
    const key = rawKey?.trim().toLowerCase();
    if (key !== 'pdf' && key !== 'table' && key !== 'json' && key !== 'text') {
      continue;
    }
    result[key] = parseBooleanEnvFlag(rawValue, defaults[key]);
  }

  return result;
}

export function resolvePreviewFlagsFromEnv(env: NodeJS.ProcessEnv = process.env): PreviewFlagsResponse {
  return {
    enableNewPreviewModal: parseBooleanEnvFlag(env.ENABLE_NEW_PREVIEW_MODAL, true),
    enableNewPreviewByType: parsePreviewByType(env.ENABLE_NEW_PREVIEW_BY_TYPE),
  };
}

function isPreviewTypeSupported(docType: unknown) {
  if (typeof docType !== 'string') {
    return false;
  }
  const normalized = docType.trim().toLowerCase();
  return normalized === '.pdf'
    || normalized === '.csv'
    || normalized === '.tsv'
    || normalized === '.xls'
    || normalized === '.xlsx'
    || normalized === '.json'
    || normalized === '.txt'
    || normalized === '.md'
    || normalized === '.markdown'
    || normalized === '.log';
}

export function registerDocumentPreviewRoutes(app: express.Express, db: any) {
  app.get('/api/documents/:id/content', async (req, res) => {
    const doc = await db.get('SELECT id, type, filePath FROM documents WHERE id = ?', req.params.id);
    if (!doc) {
      return res.status(404).json(buildPreviewError('NOT_FOUND', 'Document not found', false));
    }

    if (!isPreviewTypeSupported(doc.type)) {
      return res.status(415).json(buildPreviewError('UNSUPPORTED_TYPE', 'Preview is not supported for this file type', false, { type: doc.type }));
    }

    try {
      const fileStat = fs.statSync(doc.filePath);
      const plan = buildPreviewResponsePlan(req.header('range'), fileStat.size);

      if (plan.status === 416) {
        res.setHeader('Content-Range', plan.headers['Content-Range']);
        return res.status(416).json(buildPreviewError('RANGE_NOT_SATISFIABLE', 'Invalid Range header', false));
      }

      if (plan.status === 200) {
        res.setHeader('Content-Length', plan.headers['Content-Length']);
      }

      if (plan.status === 206) {
        res.setHeader('Accept-Ranges', plan.headers['Accept-Ranges']);
        res.setHeader('Content-Range', plan.headers['Content-Range']);
        res.setHeader('Content-Length', plan.headers['Content-Length']);
      }

      const stream = plan.status === 206
        ? fs.createReadStream(doc.filePath, { start: plan.range.start, end: plan.range.end })
        : fs.createReadStream(doc.filePath);

      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).json(buildPreviewError('READ_FAILED', 'Failed to read document content', true));
          return;
        }
        res.destroy();
      });

      res.status(plan.status);
      stream.pipe(res);
      return;
    } catch (error: any) {
      return res.status(500).json(buildPreviewError('READ_FAILED', 'Failed to read document content', true, {
        reason: error?.message ?? 'unknown-read-error',
      }));
    }
  });

  app.get('/api/settings/preview-flags', (req, res) => {
    res.json(resolvePreviewFlagsFromEnv(process.env));
  });
}

function mapSources(topChunks: any[]) {
  return topChunks.map((chunk: any) => ({
    docId: typeof chunk?.docId === 'string' ? chunk.docId : undefined,
    chunkId: typeof chunk?.id === 'string' ? chunk.id : undefined,
    chunkIndex: typeof chunk?.chunkIndex === 'number' ? chunk.chunkIndex : undefined,
    docName: typeof chunk?.fileName === 'string' && chunk.fileName.trim()
      ? chunk.fileName
      : 'Document',
    content: typeof chunk?.content === 'string'
      ? `${chunk.content.substring(0, 100)}...`
      : '',
  }));
}

async function retrieveTopChunks(message: string, config: RuntimeConfig) {
  let topChunks: any[] = [];
  if (!chunkTable) {
    return topChunks;
  }

  const totalChunks = await chunkTable.countRows();
  if (totalChunks <= 0) {
    return topChunks;
  }

  try {
    const embedRes = await axios.post(
      `${config.baseUrl}/embeddings`,
      {
        model: config.embeddingModel,
        input: message,
      },
      {
        timeout: SILICONFLOW_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    const queryEmbedding = readOpenAIEmbedding(embedRes.data);

    if (queryEmbedding.length > 0) {
      topChunks = await chunkTable.vectorSearch(queryEmbedding).limit(5).toArray();
    }
  } catch (error) {
    console.warn('[chat] retrieval failed, fallback to general response', error);
  }

  return topChunks;
}

function debugStartup(...args: unknown[]) {
  if (DEBUG_STARTUP) {
    console.log('[startup]', ...args);
  }
}

function isEnglishBoundaryProtectionEnabledForStartupLog() {
  const raw = process.env.ENABLE_ENGLISH_BOUNDARY_PROTECTION;
  if (raw === undefined) {
    return true;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off';
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(LANCE_PATH)) fs.mkdirSync(LANCE_PATH, { recursive: true });
if (!fs.existsSync(ARTIFACTS_PATH)) fs.mkdirSync(ARTIFACTS_PATH, { recursive: true });

async function initSqlite() {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      name TEXT,
      size INTEGER,
      type TEXT,
      uploadTime TEXT,
      status TEXT,
      chunkCount INTEGER,
      description TEXT,
      md5 TEXT,
      filePath TEXT
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT,
      role TEXT,
      content TEXT,
      timestamp TEXT,
      sources TEXT,
      FOREIGN KEY(conversationId) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS model_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      base_url TEXT NOT NULL,
      llm_model TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      api_key TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );
  `);

  await db.run(
    `INSERT INTO model_config (id, base_url, llm_model, embedding_model, api_key, updated_at)
     VALUES (1, ?, ?, ?, '', ?)
     ON CONFLICT(id) DO NOTHING`,
    [normalizeBaseUrl(DEFAULT_BASE_URL), DEFAULT_LLM_MODEL, DEFAULT_EMBEDDING_MODEL, new Date().toISOString()],
  );

  try {
    await db.exec('ALTER TABLE documents ADD COLUMN filePath TEXT');
  } catch (error: any) {
    if (!String(error?.message ?? '').includes('duplicate column name')) {
      throw error;
    }
  }

  return db;
}

let lanceConn: any;
let chunkTable: any;

async function initLance() {
  lanceConn = await connect(LANCE_PATH);

  try {
    chunkTable = await lanceConn.openTable('chunks');
    console.log('[LanceDB] opened existing chunks table');
  } catch {
    chunkTable = null;
    console.log('[LanceDB] no chunks table yet, will create on first insert');
  }
}

async function ensureChunkTable(firstBatch: any[]) {
  if (chunkTable) return chunkTable;
  chunkTable = await lanceConn.createTable('chunks', firstBatch);
  console.log('[LanceDB] created chunks table');
  return chunkTable;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${normalizeUploadedFilename(file.originalname)}`);
  },
});

const upload = multer({ storage });

type UploadRequest = express.Request & {
  file?: {
    path: string;
    originalname: string;
    size: number;
  };
};

type PipelineChunkRecord = {
  id: string;
  docId: string;
  content: string;
  chunkIndex: number;
  embedding: Float32Array;
};

function buildJobRecord(input: Partial<DocumentJobRecord> & Pick<DocumentJobRecord, 'jobId' | 'documentId' | 'currentStage' | 'jobStatus'>): DocumentJobRecord {
  const now = new Date().toISOString();
  return {
    priority: 0,
    queuePosition: 0,
    stageProgress: 0,
    overallProgress: 0,
    processedUnits: 0,
    totalUnits: 0,
    retryCount: 0,
    resumeEligible: false,
    resumeInvalidReason: null,
    message: '',
    errorCode: null,
    errorMessage: null,
    lastSuccessfulStage: null,
    lastCheckpointAt: null,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    updatedAt: now,
    ...input,
  };
}

function mapStageToDocumentStatus(stage: PipelineStage) {
  if (stage === 'completed') return 'completed';
  if (stage === 'failed') return 'failed';
  if (stage === 'cancelled') return 'cancelled';
  return 'processing';
}

async function startServer() {
  if (LANCE_PATH !== CONFIGURED_LANCE_PATH) {
    console.warn(`[LanceDB] configured path ${CONFIGURED_LANCE_PATH} is on /mnt, fallback to ${LANCE_PATH}`);
  }

  debugStartup('initSqlite:start');
  const db = await initSqlite();
  debugStartup('initSqlite:done');
  const pipelineStore = await createDocumentPipelineStore(db as any);
  const artifactStore = createDocumentArtifactStore(ARTIFACTS_PATH);
  const pipelineRunner = createDocumentPipelineRunner({
    runStage: async () => undefined,
  });

  debugStartup('initLance:start');
  await initLance();
  debugStartup('initLance:done');

  const app = express();
  app.use(express.json({ limit: '50mb' }));

  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: false,
    }),
  );

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'backend', port: PORT });
  });
  registerDocumentPreviewRoutes(app, db);
  registerSettingsRoutes(app, db, {
    storagePath: LANCE_PATH,
    documentStoragePath: UPLOADS_DIR,
  });

  async function writeDocumentStage(docId: string, stage: PipelineStage, patch: Partial<DocumentJobRecord> = {}) {
    const existing = await pipelineStore.getJob(docId);
    const current = existing ?? buildJobRecord({
      jobId: docId,
      documentId: docId,
      currentStage: stage,
      jobStatus: 'running',
    });
    const nextRecord: DocumentJobRecord = {
      ...current,
      ...patch,
      currentStage: stage,
      updatedAt: new Date().toISOString(),
    };
    await pipelineStore.upsertJob(nextRecord);
    await pipelineStore.appendStageLog({
      jobId: nextRecord.jobId,
      documentId: nextRecord.documentId,
      stage,
      message: nextRecord.message,
      errorCode: nextRecord.errorCode,
      errorMessage: nextRecord.errorMessage,
      createdAt: nextRecord.updatedAt,
    });
    return nextRecord;
  }

  const pipelineStages = createDocumentPipelineStages({
    writeDocumentStage,
    artifactStore,
    pipelineStore,
    pipelineRunner,
    resolveEmbeddingBatchSize,
    embedChunksWithRetry,
    embeddingDim: EMBEDDING_DIM,
    siliconflowTimeoutMs: SILICONFLOW_TIMEOUT_MS,
    postEmbeddings: async ({ baseUrl, embeddingModel, apiKey, batch }) => {
      const response = await axios.post(
        `${baseUrl}/embeddings`,
        {
          model: embeddingModel,
          input: batch.map((item) => item.content),
        },
        {
          timeout: SILICONFLOW_TIMEOUT_MS,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const embeddings = response.data?.data;
      return Array.isArray(embeddings)
        ? embeddings.map((item: any) => Array.isArray(item?.embedding) ? item.embedding : [])
        : batch.map(() => new Array(EMBEDDING_DIM).fill(0));
    },
    ensureChunkTable: async (chunks) => ensureChunkTable(chunks as any),
    addVectorChunks: async (chunks) => {
      if (!chunkTable) return;
      await chunkTable.add(chunks as any);
    },
    storeEmbeddedChunks,
    buildChunkMetadataRecords,
    now: () => new Date().toISOString(),
  });

  async function runParsingStage(doc: { id: string; name: string; type: string; md5: string }, filePath: string, jobId: string) {
    await writeDocumentStage(doc.id, 'parsing', { stageProgress: 10, overallProgress: 10, message: 'parsing document' });
    const parsed = await parseDocument({ filePath, fileType: doc.type, fileName: doc.name });
    await artifactStore.saveArtifact(doc.id, 'parsing', parsed, { md5: doc.md5, fileSize: fs.statSync(filePath).size });
    await pipelineStore.saveCheckpoint({
      jobId,
      documentId: doc.id,
      lastSuccessfulStage: 'parsing',
      processedUnits: parsed.units.length,
      totalUnits: parsed.units.length,
      resumeEligible: true,
      resumeInvalidReason: null,
      updatedAt: new Date().toISOString(),
    });
    return parsed;
  }

  async function runCleaningStage(doc: { id: string; md5: string }, parsed: any, jobId: string) {
    await writeDocumentStage(doc.id, 'cleaning', {
      stageProgress: 25,
      overallProgress: 25,
      message: 'cleaning document',
      lastSuccessfulStage: 'parsing',
      lastCheckpointAt: new Date().toISOString(),
    });
    const cleaned = cleanDocumentText(parsed);
    await artifactStore.saveArtifact(doc.id, 'cleaning', cleaned, { md5: doc.md5 });
    await pipelineStore.saveCheckpoint({
      jobId,
      documentId: doc.id,
      lastSuccessfulStage: 'cleaning',
      processedUnits: 1,
      totalUnits: 1,
      resumeEligible: true,
      resumeInvalidReason: null,
      updatedAt: new Date().toISOString(),
    });
    return cleaned;
  }

  async function runChunkingStage(doc: { id: string; md5: string }, cleaned: any, jobId: string) {
    await writeDocumentStage(doc.id, 'chunking', {
      stageProgress: 45,
      overallProgress: 45,
      message: 'chunking document',
      lastSuccessfulStage: 'cleaning',
      lastCheckpointAt: new Date().toISOString(),
    });
    const chunkDrafts = qualityCheckChunks(chunkDocument(cleaned));
    await artifactStore.saveArtifact(doc.id, 'chunking', chunkDrafts, { md5: doc.md5 });
    await pipelineStore.saveCheckpoint({
      jobId,
      documentId: doc.id,
      lastSuccessfulStage: 'chunking',
      processedUnits: chunkDrafts.length,
      totalUnits: chunkDrafts.length,
      resumeEligible: true,
      resumeInvalidReason: null,
      updatedAt: new Date().toISOString(),
    });
    return chunkDrafts;
  }

  async function runQualityCheckStage(doc: { id: string }, chunkDrafts: any[]) {
    await writeDocumentStage(doc.id, 'quality_check', {
      stageProgress: 55,
      overallProgress: 55,
      message: 'checking chunks',
      processedUnits: chunkDrafts.length,
      totalUnits: chunkDrafts.length,
      lastSuccessfulStage: 'chunking',
      lastCheckpointAt: new Date().toISOString(),
    });
    return chunkDrafts;
  }

  async function runEmbeddingStage(doc: { id: string; md5: string }, chunkDrafts: any[], jobId: string, config: RuntimeConfig) {
    return pipelineStages.runEmbeddingStage({ doc, chunkDrafts, jobId, config });
  }

  async function runStoringStage(doc: { id: string; name: string; type: string }, filePath: string, chunkDrafts: any[], cleaned: any, embedded: any, config: RuntimeConfig) {
    return pipelineStages.runStoringStage({
      doc,
      filePath,
      chunkDrafts,
      cleaned,
      embedded,
      config,
      chunkTableExists: Boolean(chunkTable),
    });
  }

  async function executeDocumentPipeline(doc: { id: string; name: string; type: string; md5: string }, filePath: string, startStage: PipelineStage = 'parsing') {
    const jobId = doc.id;
    let activeStage: PipelineStage = startStage;
    await writeDocumentStage(doc.id, 'uploaded', {
      jobId,
      documentId: doc.id,
      jobStatus: 'running',
      message: 'queued',
      resumeEligible: false,
      errorCode: null,
      errorMessage: null,
    });

    try {
      activeStage = 'parsing';
      const parsed = startStage === 'parsing'
        ? await runParsingStage(doc, filePath, jobId)
        : await artifactStore.loadArtifact(doc.id, 'parsing');
      activeStage = 'cleaning';
      const cleaned = startStage === 'parsing' || startStage === 'cleaning'
        ? await runCleaningStage(doc, parsed, jobId)
        : await artifactStore.loadArtifact(doc.id, 'cleaning');
      activeStage = 'chunking';
      const chunkDrafts = ['parsing', 'cleaning', 'chunking'].includes(startStage)
        ? await runChunkingStage(doc, cleaned, jobId)
        : await artifactStore.loadArtifact(doc.id, 'chunking');
      activeStage = 'quality_check';
      await runQualityCheckStage(doc, chunkDrafts);
      const config = await getRuntimeConfig(db);
      activeStage = 'embedding';
      const embedded = ['parsing', 'cleaning', 'chunking', 'quality_check', 'embedding'].includes(startStage)
        ? await runEmbeddingStage(doc, chunkDrafts, jobId, config)
        : await artifactStore.loadArtifact(doc.id, 'embedding');
      activeStage = 'storing';
      await runStoringStage(doc, filePath, chunkDrafts, cleaned, embedded, config);

      await db.run('UPDATE documents SET status = ?, chunkCount = ? WHERE id = ?', ['completed', chunkDrafts.length, doc.id]);
      await writeDocumentStage(doc.id, 'completed', {
        jobStatus: 'completed',
        stageProgress: 100,
        overallProgress: 100,
        processedUnits: chunkDrafts.length,
        totalUnits: chunkDrafts.length,
        message: 'completed',
        lastSuccessfulStage: 'storing',
        lastCheckpointAt: new Date().toISOString(),
        resumeEligible: false,
        errorCode: null,
        errorMessage: null,
        finishedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      const failure = buildFailureRecoveryInput(activeStage);
      const failureRecovery = await pipelineRunner.buildFailureRecovery({
        failedStage: failure.failedStage,
        errorCode: failure.errorCode,
        resumeEligible: true,
        resumeInvalidReason: null,
        processedUnits: 0,
        totalUnits: 0,
        now: new Date().toISOString(),
      });
      await db.run('UPDATE documents SET status = ? WHERE id = ?', ['failed', doc.id]);
      await pipelineStore.saveCheckpoint({
        jobId,
        documentId: doc.id,
        lastSuccessfulStage: (failureRecovery.lastSuccessfulStage ?? 'parsing') as PipelineStage,
        processedUnits: failureRecovery.processedUnits,
        totalUnits: failureRecovery.totalUnits,
        resumeEligible: failureRecovery.resumeEligible,
        resumeInvalidReason: failureRecovery.resumeInvalidReason,
        updatedAt: failureRecovery.lastCheckpointAt,
      });
      await writeDocumentStage(doc.id, 'failed', {
        jobStatus: 'failed',
        message: 'pipeline failed',
        errorCode: resolvePipelineErrorCode(activeStage) as any,
        errorMessage: error?.message ?? 'pipeline failed',
        resumeEligible: failureRecovery.resumeEligible,
        resumeInvalidReason: failureRecovery.resumeInvalidReason,
        lastSuccessfulStage: (failureRecovery.lastSuccessfulStage ?? null) as PipelineStage | null,
        lastCheckpointAt: failureRecovery.lastCheckpointAt,
        processedUnits: failureRecovery.processedUnits,
        totalUnits: failureRecovery.totalUnits,
        finishedAt: new Date().toISOString(),
      });
    }
  }

  app.get('/api/documents', async (req, res) => {
    const docs = await db.all('SELECT * FROM documents ORDER BY uploadTime DESC');
    const result = await Promise.all(docs.map(async (doc: any) => {
      const job = await pipelineStore.getJob(doc.id);
      return {
        ...doc,
        currentStage: job?.currentStage ?? null,
        jobStatus: job?.jobStatus ?? null,
        stageProgress: job?.stageProgress ?? null,
        overallProgress: job?.overallProgress ?? null,
        processedUnits: job?.processedUnits ?? null,
        totalUnits: job?.totalUnits ?? null,
        retryCount: job?.retryCount ?? 0,
        resumeEligible: job?.resumeEligible ?? false,
        resumeInvalidReason: job?.resumeInvalidReason ?? null,
        message: job?.message ?? null,
        errorCode: job?.errorCode ?? null,
        errorMessage: job?.errorMessage ?? null,
      };
    }));
    res.json(result);
  });

  app.get('/api/documents/:id', async (req, res) => {
    const doc = await db.get('SELECT * FROM documents WHERE id = ?', req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const job = await pipelineStore.getJob(req.params.id);

    let chunks: any[] = [];
    if (chunkTable) {
      chunks = await chunkTable.query().where(`docId = '${req.params.id}'`).toArray();
    }
    const metadataRecords = await pipelineStore.listChunkMetadata(req.params.id);
    const metadataByChunkId = new Map(metadataRecords.map((row: any) => [row.chunkId, row]));
    const overlapLength = metadataRecords.length > 0
      ? Math.round(metadataRecords.reduce((sum: number, row: any) => sum + Number(row.overlapTokenCount ?? 0), 0) / metadataRecords.length)
      : 0;
    const embeddingModel = metadataRecords.find((row: any) => row.embeddingModel)?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    const vectorized = doc.status === 'completed' && (doc.chunkCount ?? 0) > 0;

    res.json({
      ...doc,
      currentStage: job?.currentStage ?? null,
      jobStatus: job?.jobStatus ?? null,
      stageProgress: job?.stageProgress ?? null,
      overallProgress: job?.overallProgress ?? null,
      processedUnits: job?.processedUnits ?? null,
      totalUnits: job?.totalUnits ?? null,
      retryCount: job?.retryCount ?? 0,
      resumeEligible: job?.resumeEligible ?? false,
      resumeInvalidReason: job?.resumeInvalidReason ?? null,
      message: job?.message ?? null,
      errorCode: job?.errorCode ?? null,
      errorMessage: job?.errorMessage ?? null,
      parseStatus: doc.status === 'failed' ? 'failed' : (doc.status === 'processing' ? 'processing' : 'completed'),
      vectorStatus: vectorized ? 'completed' : (doc.status === 'failed' ? 'failed' : 'processing'),
      chunkingStrategy: 'sentence-window + quality-check',
      overlapLength,
      embeddingModel,
      chunks: chunks.map((chunk: any) => {
        const metadata = metadataByChunkId.get(chunk.id) ?? null;
        const resolvedNodeType = metadata?.nodeType ?? chunk.nodeType ?? chunk.sectionType ?? 'body';
        return {
          id: chunk.id,
          content: chunk.content,
          index: chunk.chunkIndex,
          tokenCount: metadata?.tokenCount ?? chunk.tokenCount ?? null,
          lang: metadata?.lang ?? chunk.lang ?? 'zh',
          title: metadata?.title ?? chunk.title ?? chunk.sourceLabel ?? null,
          hierarchy: metadata?.hierarchy ?? chunk.hierarchy ?? [],
          level: metadata?.level ?? chunk.level ?? chunk.sectionLevel ?? 1,
          nodeType: resolvedNodeType,
          node_type: resolvedNodeType,
          pageStart: metadata?.pageStart ?? chunk.pageStart ?? null,
          pageEnd: metadata?.pageEnd ?? chunk.pageEnd ?? null,
          overlapTokenCount: metadata?.overlapTokenCount ?? chunk.overlapTokenCount ?? 0,
          retrievalEligible: metadata?.retrievalEligible ?? chunk.retrievalEligible ?? true,
        };
      }),
    });
  });

  app.get('/api/documents/:id/chunks/export', async (req, res) => {
    const doc = await db.get('SELECT * FROM documents WHERE id = ?', req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const metadata = await pipelineStore.listChunkMetadata(req.params.id);
    res.json({
      documentId: req.params.id,
      fileName: doc.name,
      exportedAt: new Date().toISOString(),
      chunkCount: metadata.length,
      chunks: metadata.map((item: any) => ({
        ...item,
        node_type: item.nodeType ?? item.node_type ?? 'body',
      })),
    });
  });

  app.put('/api/documents/:id/description', async (req, res) => {
    const doc = await db.get('SELECT id, description FROM documents WHERE id = ?', req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const description = typeof req.body?.description === 'string'
      ? req.body.description.trim()
      : '';

    await db.run('UPDATE documents SET description = ? WHERE id = ?', [description, req.params.id]);
    res.json({ ok: true, description });
  });

  app.delete('/api/documents/:id', async (req, res) => {
    const docId = req.params.id;
    const doc = await db.get('SELECT id, filePath FROM documents WHERE id = ?', docId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    await deleteDocumentResources({
      documentId: docId,
      filePath: doc.filePath,
      chunkTable,
      clearDocumentData: (documentId) => pipelineStore.clearDocumentData?.(documentId),
      deleteDocumentRow: (documentId) => db.run('DELETE FROM documents WHERE id = ?', documentId),
    });

    res.json({ success: true });
  });

  app.post('/api/upload', upload.single('file'), async (req: UploadRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const config = await getRuntimeConfig(db);
    if (!config.apiKey) {
      return res.status(400).json({ error: '请先配置 API Key' });
    }

    const fileBuffer = fs.readFileSync(req.file.path);
    const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

    const existing = await db.get('SELECT * FROM documents WHERE md5 = ?', md5);
    if (existing) {
      fs.unlinkSync(req.file.path);
      return res.json({ status: 'exists', document: existing });
    }

    const docId = crypto.randomUUID();
    const normalizedName = normalizeUploadedFilename(req.file.originalname);
    const doc = {
      id: docId,
      name: normalizedName,
      size: req.file.size,
      type: path.extname(normalizedName).toLowerCase(),
      uploadTime: new Date().toISOString(),
      status: 'processing',
      chunkCount: 0,
      md5,
      filePath: req.file.path,
    };

    await db.run(
      'INSERT INTO documents (id, name, size, type, uploadTime, status, chunkCount, md5, filePath) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [doc.id, doc.name, doc.size, doc.type, doc.uploadTime, doc.status, doc.chunkCount, doc.md5, doc.filePath],
    );

    await pipelineStore.upsertJob(buildJobRecord({
      jobId: doc.id,
      documentId: doc.id,
      currentStage: 'uploaded',
      jobStatus: 'queued',
      message: 'waiting-for-resources',
      resumeEligible: false,
    }));
    executeDocumentPipeline(doc, req.file.path).catch(console.error);
    res.json({ status: 'uploading', document: doc });
  });

  app.post('/api/documents/:id/resume', async (req, res) => {
    const doc = await db.get('SELECT * FROM documents WHERE id = ?', req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const checkpoint = await pipelineStore.getCheckpointByDocument(req.params.id);
    const resumeInfo = pipelineRunner.isResumeEligible({
      sourceMd5: doc.md5,
      checkpointMd5: doc.md5,
    });
    if (!resumeInfo.eligible || !checkpoint) {
      return res.status(400).json({ error: 'Document is not resumable', reason: resumeInfo.reason });
    }
    const resumedStage = resolveResumeStage({ lastSuccessfulStage: checkpoint.lastSuccessfulStage });
    try {
      await pipelineRunner.resumeDocument({
        lastSuccessfulStage: checkpoint.lastSuccessfulStage,
        resumeEligible: checkpoint.resumeEligible,
        resumeInvalidReason: checkpoint.resumeInvalidReason,
      });
    } catch (error: any) {
      return res.status(400).json({ error: 'Document is not resumable', reason: error?.message ?? 'resume-not-eligible' });
    }
    await writeDocumentStage(req.params.id, resumedStage, {
      jobStatus: 'running',
      message: 'resuming pipeline',
      resumeEligible: true,
      resumeInvalidReason: null,
      errorCode: null,
      errorMessage: null,
      lastCheckpointAt: checkpoint.updatedAt,
      processedUnits: checkpoint.processedUnits,
      totalUnits: checkpoint.totalUnits,
    });
    executeDocumentPipeline(doc, doc.filePath, resumedStage).catch(console.error);
    res.json({ ok: true, resumedStage });
  });

  app.post('/api/documents/:id/retry', async (req, res) => {
    const doc = await db.get('SELECT * FROM documents WHERE id = ?', req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const currentJob = await pipelineStore.getJob(req.params.id);
    const retryStage = (currentJob?.currentStage && currentJob.currentStage !== 'failed' ? currentJob.currentStage : resolveResumeStage({ lastSuccessfulStage: currentJob?.lastSuccessfulStage ?? null })) as PipelineStage;
    await writeDocumentStage(req.params.id, 'uploaded', {
      jobStatus: 'running',
      retryCount: (currentJob?.retryCount ?? 0) + 1,
      message: 'retrying pipeline',
      errorCode: null,
      errorMessage: null,
    });
    executeDocumentPipeline(doc, doc.filePath, retryStage).catch(console.error);
    res.json({ ok: true, retryStage });
  });

  app.post('/api/documents/:id/rechunk', async (req, res) => {
    const doc = await db.get('SELECT * FROM documents WHERE id = ?', req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    await writeDocumentStage(req.params.id, 'chunking', {
      jobStatus: 'running',
      message: 'rechunk requested',
      errorCode: null,
      errorMessage: null,
      stageProgress: 0,
      overallProgress: 35,
      lastSuccessfulStage: 'cleaning',
      retryCount: 0,
    });
    executeDocumentPipeline(doc, doc.filePath, 'chunking').catch(console.error);
    res.json({ ok: true, stage: 'chunking' });
  });

  app.post('/api/documents/:id/cancel', async (req, res) => {
    const job = await pipelineStore.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const cancelled = await pipelineRunner.cancelDocument({ currentStage: job.currentStage });
    await writeDocumentStage(req.params.id, 'cancelled', {
      jobStatus: 'cancelled',
      message: cancelled.message,
      errorCode: 'USER_CANCELLED',
      errorMessage: 'cancelled by user',
      resumeEligible: true,
      finishedAt: new Date().toISOString(),
    });
    await db.run('UPDATE documents SET status = ? WHERE id = ?', [mapStageToDocumentStatus('cancelled'), req.params.id]);
    res.json({ ok: true, ...cancelled });
  });

  app.get('/api/siliconflow/models', async (req, res) => {
    try {
      const config = await getRuntimeConfig(db);
      if (!config.apiKey) {
        return res.status(400).json({ error: '请先配置 API Key' });
      }

      const response = await axios.get(`${config.baseUrl}/models`, {
        timeout: SILICONFLOW_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      res.json(response.data);
    } catch (error) {
      res.status(500).json({ error: 'SiliconFlow not reachable' });
    }
  });

  app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    const history = normalizeChatHistory(req.body?.history);
    const config = await getRuntimeConfig(db);

    if (!config.apiKey) {
      return res.status(400).json({ error: '请先配置 API Key' });
    }

    const topChunks = await retrieveTopChunks(message, config);

    const context = topChunks.map((chunk: any) => chunk.content).join('\n\n');
    const systemPrompt = buildSystemPrompt(context);

    try {
      const response = await axios.post(
        `${config.baseUrl}/chat/completions`,
        {
          model: config.llmModel,
          messages: buildChatMessages(systemPrompt, history, message),
        },
        {
          timeout: SILICONFLOW_TIMEOUT_MS,
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const sources = mapSources(topChunks);

      const content = response.data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        return res.status(500).json({ error: 'LLM empty response' });
      }

      res.json({
        content,
        sources,
      });
    } catch (error) {
      res.status(500).json({ error: 'LLM failed' });
    }
  });

  app.post('/api/mcp', async (req, res) => {
    const method = req.body?.method;
    const requestId = req.body?.id ?? `mcp-${Date.now()}`;
    const history = normalizeChatHistory(req.body?.params?.history ?? req.body?.history);
    const message = typeof req.body?.params?.message === 'string'
      ? req.body.params.message
      : (typeof req.body?.message === 'string' ? req.body.message : '');

    if (method && method !== 'chat.stream') {
      return res.status(400).json({ error: 'Unsupported MCP method' });
    }

    if (!message.trim()) {
      return res.status(400).json({ error: 'message 不能为空' });
    }

    const config = await getRuntimeConfig(db);

    if (!config.apiKey) {
      return res.status(400).json({ error: '请先配置 API Key' });
    }

    const topChunks = await retrieveTopChunks(message, config);
    const context = topChunks.map((chunk: any) => chunk.content).join('\n\n');
    const systemPrompt = buildSystemPrompt(context);
    const sources = mapSources(topChunks);

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders?.();
    res.write(encodeMcpJsonLine(buildMcpNotification('chat.started', { id: requestId })));

    let streamClosed = false;
    let restBuffer = '';

    const finishStream = (withSources: boolean, success: boolean) => {
      if (streamClosed) {
        return;
      }

      streamClosed = true;
      if (withSources) {
        res.write(encodeMcpJsonLine(buildMcpNotification('chat.sources', { sources })));
      }
      res.write(encodeMcpJsonLine(buildMcpResult(requestId, { done: true, success })));
      res.end();
    };

    try {
      const upstream = await axios.post(
        `${config.baseUrl}/chat/completions`,
        {
          model: config.llmModel,
          stream: true,
          messages: buildChatMessages(systemPrompt, history, message),
        },
        {
          timeout: SILICONFLOW_TIMEOUT_MS,
          responseType: 'stream',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      req.on('close', () => {
        if (!streamClosed) {
          upstream.data?.destroy?.();
          finishStream(false, false);
        }
      });

      upstream.data.on('data', (chunk: Buffer | string) => {
        if (streamClosed) {
          return;
        }

        restBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        const parsed = parseOpenAIStreamBuffer(restBuffer);
        restBuffer = parsed.rest;

        for (const delta of parsed.deltas) {
          res.write(encodeMcpJsonLine(buildMcpNotification('chat.delta', { content: delta })));
        }

        if (parsed.done) {
          finishStream(true, true);
          upstream.data.destroy();
        }
      });

      upstream.data.on('end', () => {
        if (streamClosed) {
          return;
        }

        if (restBuffer) {
          const parsed = parseOpenAIStreamBuffer(`${restBuffer}\n\n`);
          for (const delta of parsed.deltas) {
            res.write(encodeMcpJsonLine(buildMcpNotification('chat.delta', { content: delta })));
          }
        }
        finishStream(true, true);
      });

      upstream.data.on('error', () => {
        if (streamClosed) {
          return;
        }
        res.write(encodeMcpJsonLine(buildMcpNotification('chat.error', { message: 'LLM stream failed' })));
        finishStream(false, false);
      });
    } catch (error) {
      if (!streamClosed) {
        res.write(encodeMcpJsonLine(buildMcpNotification('chat.error', { message: 'LLM stream failed' })));
        finishStream(false, false);
      }
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend running at http://localhost:${PORT}`);
    console.log(`english_boundary_protection=${isEnglishBoundaryProtectionEnabledForStartupLog() ? 'enabled' : 'disabled'}`);
  });
}

type RegisterSettingsRoutesOptions = {
  storagePath: string;
  documentStoragePath?: string;
  keySecurity?: KeySecurityService;
};

function parseImportSchemaVersion(raw: unknown) {
  const normalized = typeof raw === 'string' ? raw.trim() : '';
  if (!normalized || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(normalized)) {
    const error: any = new Error('schemaVersion is required');
    error.status = 400;
    error.code = 'IMPORT_SCHEMA_UNSUPPORTED';
    throw error;
  }

  const major = Number(normalized.split('.')[0]);
  if (!Number.isInteger(major) || major < 1 || major > 1) {
    const error: any = new Error('schemaVersion is not supported by this server');
    error.status = 400;
    error.code = 'IMPORT_SCHEMA_UNSUPPORTED';
    throw error;
  }

  return normalized;
}

function readErrorCode(error: any) {
  return typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR';
}

function asFieldList(raw: unknown, fallbackField: string) {
  if (!raw || typeof raw !== 'object') {
    return [fallbackField];
  }
  const keys = Object.keys(raw as Record<string, unknown>);
  return keys.length > 0 ? keys : [fallbackField];
}

function parseImportPayload(rawBody: any) {
  return {
    schemaVersion: parseImportSchemaVersion(rawBody?.schemaVersion),
    dryRun: rawBody?.dryRun === true,
    payload: rawBody?.payload && typeof rawBody.payload === 'object' ? rawBody.payload : {},
  };
}

function resolveExpectedVersion(primary: unknown, fallback: unknown) {
  if (typeof primary === 'number' && Number.isInteger(primary)) {
    return primary;
  }
  if (typeof fallback === 'number' && Number.isInteger(fallback)) {
    return fallback;
  }
  return undefined;
}

function parseResetDefaultInput(req: express.Request): {
  scope: 'module' | 'all';
  target?: 'ui' | 'provider' | 'storage';
  providerId?: string;
} {
  const rawScope = typeof req.query.scope === 'string' ? req.query.scope : req.body?.scope;
  const scope = rawScope === 'all' ? 'all' : 'module';
  const rawTarget = typeof req.query.target === 'string' ? req.query.target : req.body?.target;
  const target = rawTarget === 'ui' || rawTarget === 'provider' || rawTarget === 'storage' ? rawTarget : undefined;
  const providerId = typeof req.body?.providerId === 'string' ? req.body.providerId : undefined;
  return { scope, target, providerId };
}

export function registerSettingsRoutes(app: express.Express, db: any, options: RegisterSettingsRoutesOptions) {
  registerSettingsRoutesImpl(app, db, {
    storagePath: options.storagePath,
    documentStoragePath: options.documentStoragePath ?? options.storagePath,
    keySecurity: options.keySecurity,
    getRuntimeConfig,
  });

  const settingsStorePromise = getSettingsStore(db, {
    storagePath: options.storagePath,
    documentStoragePath: options.documentStoragePath ?? options.storagePath,
  });

  app.get('/api/config/export', async (req, res) => {
    try {
      const settingsStore = await settingsStorePromise;
      const all = await settingsStore.getAllConfig();
      res.json({
        schemaVersion: '1.0.0',
        exportedAt: new Date().toISOString(),
        uiPreferences: all.ui,
        providers: all.providers,
        storagePreferences: all.storage,
      });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });

  app.post('/api/config/import', async (req, res) => {
    try {
      const audit = createSettingsAuditContext(req);
      const parsed = parseImportPayload(req.body);

      const settingsStore = await settingsStorePromise;
      const result = await settingsStore.importConfig(parsed.payload, parsed.dryRun);
      res.json({
        ...result,
        schemaVersion: parsed.schemaVersion,
        requestId: audit.requestId,
      });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });

  app.post('/api/config/reset-default', async (req, res) => {
    try {
      const audit = createSettingsAuditContext(req);
      const settingsStore = await settingsStorePromise;

      const result = await settingsStore.resetDefaults(parseResetDefaultInput(req));

      res.json({
        ...result,
        requestId: audit.requestId,
      });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });

  app.post('/api/config/save-all', async (req, res) => {
    const successItems: Array<{ module: string; providerId?: string; field: string }> = [];
    const failedItems: Array<{ module: string; providerId?: string; field: string; code: string; requestId: string }> = [];
    const warnings: string[] = [];

    try {
      const audit = createSettingsAuditContext(req);
      const settingsStore = await settingsStorePromise;

      const uiPatch = req.body?.uiPatch;
      if (uiPatch && typeof uiPatch === 'object') {
        try {
          await settingsStore.patchUiConfig({
            language: (uiPatch as any).language,
            theme: (uiPatch as any).theme,
          });
          for (const field of asFieldList(uiPatch, 'ui')) {
            successItems.push({ module: 'ui', field });
          }
        } catch (error) {
          for (const field of asFieldList(uiPatch, 'ui')) {
            failedItems.push({
              module: 'ui',
              field,
              code: readErrorCode(error),
              requestId: audit.requestId,
            });
          }
        }
      }

      const providerPatches = Array.isArray(req.body?.providerPatches) ? req.body.providerPatches : [];
      for (const item of providerPatches) {
        if (!item || typeof item !== 'object') {
          continue;
        }

        const providerId = typeof item.providerId === 'string' ? item.providerId : '';
        const fields = item.fields && typeof item.fields === 'object' ? item.fields : {};
        const candidateVersion = resolveExpectedVersion(item.expectedVersion, req.body?.expectedVersions?.providers?.[providerId]);

        if (!providerId || typeof candidateVersion !== 'number') {
          for (const field of asFieldList(fields, 'provider')) {
            failedItems.push({
              module: 'provider',
              providerId,
              field,
              code: 'INVALID_VERSION',
              requestId: audit.requestId,
            });
          }
          continue;
        }

        try {
          await settingsStore.patchProviderConfig(
            providerId,
            {
              baseUrl: fields.baseUrl,
              llmModel: fields.llmModel,
              embeddingModel: fields.embeddingModel,
              apiKey: fields.apiKey,
            },
            candidateVersion,
          );
          for (const field of asFieldList(fields, 'provider')) {
            successItems.push({ module: 'provider', providerId, field });
          }
        } catch (error) {
          for (const field of asFieldList(fields, 'provider')) {
            failedItems.push({
              module: 'provider',
              providerId,
              field,
              code: readErrorCode(error),
              requestId: audit.requestId,
            });
          }
        }
      }

      const storagePatch = req.body?.storagePatch;
      if (storagePatch && typeof storagePatch === 'object') {
        const candidateVersion = resolveExpectedVersion(storagePatch.expectedVersion, req.body?.expectedVersions?.storage);

        if (typeof candidateVersion !== 'number') {
          for (const field of asFieldList(storagePatch, 'storage')) {
            failedItems.push({
              module: 'storage',
              field,
              code: 'INVALID_VERSION',
              requestId: audit.requestId,
            });
          }
        } else {
          try {
            await settingsStore.patchStorageConfig(
              {
                storagePath: (storagePatch as any).storagePath,
                documentStoragePath: (storagePatch as any).documentStoragePath,
              },
              candidateVersion,
            );
            for (const field of asFieldList(storagePatch, 'storage')) {
              if (field === 'expectedVersion') {
                continue;
              }
              successItems.push({ module: 'storage', field });
            }
          } catch (error) {
            for (const field of asFieldList(storagePatch, 'storage')) {
              failedItems.push({
                module: 'storage',
                field,
                code: readErrorCode(error),
                requestId: audit.requestId,
              });
            }
          }
        }
      }

      res.json({
        successItems,
        failedItems,
        warnings,
        requestId: audit.requestId,
      });
    } catch (error) {
      handleSettingsRouteError(error, res);
    }
  });
}

async function processDocument(docId: string, filePath: string, db: any) {
  const ext = path.extname(filePath).toLowerCase();
  let text = '';

  try {
    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: dataBuffer });
      const result = await parser.getText();
      text = extractPdfText(result);
      await parser.destroy();
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    } else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = xlsx.readFile(filePath);
      text = workbook.SheetNames.map((name) => xlsx.utils.sheet_to_txt(workbook.Sheets[name])).join('\n');
    } else {
      const decoded = decodePlainTextBuffer(fs.readFileSync(filePath));
      text = decoded.text;
      if (decoded.encoding !== 'utf8') {
        console.info(`[Encoding] decoded plain text with ${decoded.encoding}: ${path.basename(filePath)}`);
      }
    }

    const config = await getRuntimeConfig(db);
    if (!config.apiKey) {
      await db.run('UPDATE documents SET status = ? WHERE id = ?', ['failed', docId]);
      return;
    }

    const chunks = chunkText(text, 800, 100);
    let embeddedCount = 0;
    const chunksData: any[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      let embedding: number[] = [];

      try {
        const embedRes = await axios.post(
          `${config.baseUrl}/embeddings`,
          {
            model: config.embeddingModel,
            input: content,
          },
          {
            timeout: SILICONFLOW_TIMEOUT_MS,
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        );
        embedding = readOpenAIEmbedding(embedRes.data);
        if (Array.isArray(embedding) && embedding.length > 0) {
          embeddedCount += 1;
        }
      } catch (error) {
        console.warn('Embedding failed for chunk', i, error);
        embedding = new Array(EMBEDDING_DIM).fill(0);
      }

      chunksData.push({
        id: crypto.randomUUID(),
        docId,
        content,
        chunkIndex: i,
        embedding: new Float32Array(embedding),
      });
    }

    if (chunksData.length > 0) {
      if (!chunkTable) {
        await ensureChunkTable(chunksData);
      } else {
        await chunkTable.add(chunksData);
      }
    }

    if (chunks.length > 0 && embeddedCount === 0) {
      await db.run('UPDATE documents SET status = ?, chunkCount = ? WHERE id = ?', ['failed', 0, docId]);
      return;
    }

    await db.run('UPDATE documents SET status = ?, chunkCount = ? WHERE id = ?', ['completed', chunks.length, docId]);
  } catch (error) {
    console.error('Processing error', error);
    await db.run('UPDATE documents SET status = ? WHERE id = ?', ['failed', docId]);
  }
}

function chunkText(text: string, size: number, overlap: number) {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}
