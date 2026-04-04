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
}

export interface Chunk {
  id: string;
  docId: string;
  content: string;
  index: number;
}

export interface MessageSource {
  docId?: string;
  chunkId?: string;
  chunkIndex?: number;
  docName: string;
  content: string;
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
