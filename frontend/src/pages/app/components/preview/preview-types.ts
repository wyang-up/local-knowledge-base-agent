import type {SourceHighlightTarget} from './source-highlight-target';

export type PreviewOpenOptions = {
  chunkId?: string;
  page?: number;
  keyword?: string;
  sheetName?: string;
  jsonPath?: string;
};

export type {SourceHighlightTarget};

export type PreviewErrorCode =
  | 'PREVIEW_ABORTED'
  | 'PREVIEW_BAD_REQUEST'
  | 'PREVIEW_NOT_FOUND'
  | 'PREVIEW_NETWORK_ERROR'
  | 'PREVIEW_UNSUPPORTED_TYPE'
  | 'PREVIEW_UNKNOWN_ERROR';

export type DocumentPreviewError = {
  code: PreviewErrorCode;
  message: string;
  status?: number;
};

export type DocumentPreviewResource = {
  documentId: string;
  documentType: string;
  kind?: 'pdf' | 'table' | 'json' | 'text';
  mimeType?: string | null;
  isPartialPreview?: boolean;
  totalPages?: number | null;
  errorMessage?: string | null;
  objectUrl?: string | null;
  content: unknown;
};
