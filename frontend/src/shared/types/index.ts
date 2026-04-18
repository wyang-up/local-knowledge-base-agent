export interface Document {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadTime: string;
  status: 'processing' | 'completed' | 'failed' | 'cancelled';
  chunkCount: number;
  description?: string;
  currentStage?: string | null;
  jobStatus?: string | null;
  stageProgress?: number | null;
  overallProgress?: number | null;
  processedUnits?: number | null;
  totalUnits?: number | null;
  retryCount?: number;
  resumeEligible?: boolean;
  resumeInvalidReason?: string | null;
  message?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  parseStatus?: 'processing' | 'completed' | 'failed';
  vectorStatus?: 'processing' | 'completed' | 'failed';
  chunkingStrategy?: string;
  overlapLength?: number;
  embeddingModel?: string;
}

export interface Chunk {
  id: string;
  docId: string;
  content: string;
  index: number;
  tokenCount?: number | null;
  lang?: 'zh' | 'en';
  title?: string | null;
  hierarchy?: string[];
  level?: number;
  nodeType?: 'abstract' | 'preface' | 'intro' | 'chapter' | 'appendix' | 'ref' | 'toc' | 'ack' | 'body';
  pageStart?: number | null;
  pageEnd?: number | null;
  overlapTokenCount?: number;
  retrievalEligible?: boolean;
}

export interface MessageSource {
  docId?: string;
  chunkId?: string;
  chunkIndex?: number;
  docName: string;
  content?: string;
  originStart?: string;
  originEnd?: string;
  pageStart?: number;
  pageEnd?: number;
  textQuote?: string;
  textOffsetStart?: number;
  textOffsetEnd?: number;
  sheetId?: string;
  sheetName?: string;
  rowStart?: number;
  rowEnd?: number;
  columnStart?: number;
  columnEnd?: number;
  jsonPath?: string;
  nodeStartOffset?: number;
  nodeEndOffset?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: MessageSource[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
  pinned?: boolean;
  archived?: boolean;
  tags?: string[];
}

export interface Settings {
  language: 'zh' | 'en';
  baseUrl: string;
  vectorModel: string;
  llmModel: string;
  storagePath: string;
  documentStoragePath?: string;
}
