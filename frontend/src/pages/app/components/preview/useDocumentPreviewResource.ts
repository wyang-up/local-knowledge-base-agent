import {useEffect, useRef, useState} from 'react';
import type {DocumentPreviewError, DocumentPreviewResource, PreviewErrorCode} from './preview-types';

type ApiUrlResolver = string | ((endpoint: string) => string);

type UseDocumentPreviewResourceInput = {
  apiUrl: ApiUrlResolver;
  documentId: string | null | undefined;
  documentType: string | null | undefined;
  enabled?: boolean;
};

type UseDocumentPreviewResourceState = {
  loading: boolean;
  error: DocumentPreviewError | null;
  resource: DocumentPreviewResource | null;
};

const LRU_CACHE_SIZE = 3;

type PreviewKind = 'pdf' | 'table' | 'json' | 'text';

type WrappedPreviewPayload = {
  mimeType?: unknown;
  content?: unknown;
  isPartialPreview?: unknown;
  totalPages?: unknown;
  errorMessage?: unknown;
};

function resolveApiUrl(apiUrl: ApiUrlResolver, endpoint: string): string {
  if (typeof apiUrl === 'function') {
    return apiUrl(endpoint);
  }
  const normalized = apiUrl.replace(/\/$/, '');
  return `${normalized}${endpoint}`;
}

function mapStatusToErrorCode(status: number): PreviewErrorCode {
  if (status === 400) return 'PREVIEW_BAD_REQUEST';
  if (status === 404) return 'PREVIEW_NOT_FOUND';
  if (status === 415) return 'PREVIEW_UNSUPPORTED_TYPE';
  return 'PREVIEW_UNKNOWN_ERROR';
}

function createError(code: PreviewErrorCode, message: string, status?: number): DocumentPreviewError {
  return {code, message, status};
}

const PREVIEW_ERROR_CODES: ReadonlySet<PreviewErrorCode> = new Set([
  'PREVIEW_ABORTED',
  'PREVIEW_BAD_REQUEST',
  'PREVIEW_NOT_FOUND',
  'PREVIEW_NETWORK_ERROR',
  'PREVIEW_UNSUPPORTED_TYPE',
  'PREVIEW_UNKNOWN_ERROR',
]);

function isDocumentPreviewError(error: unknown): error is DocumentPreviewError {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybe = error as {code?: unknown; message?: unknown; status?: unknown};
  if (typeof maybe.message !== 'string' || typeof maybe.code !== 'string') {
    return false;
  }

  if (!PREVIEW_ERROR_CODES.has(maybe.code as PreviewErrorCode)) {
    return false;
  }

  if (maybe.status !== undefined && typeof maybe.status !== 'number') {
    return false;
  }

  return true;
}

function updateCache(
  cache: Map<string, DocumentPreviewResource>,
  key: string,
  resource: DocumentPreviewResource,
): void {
  const existing = cache.get(key);
  if (existing && existing !== resource && existing.objectUrl) {
    URL.revokeObjectURL(existing.objectUrl);
  }

  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, resource);

  if (cache.size > LRU_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === 'string') {
      const oldest = cache.get(oldestKey);
      if (oldest?.objectUrl) {
        URL.revokeObjectURL(oldest.objectUrl);
      }
      cache.delete(oldestKey);
    }
  }
}

function normalizeMimeType(mimeType: string | null | undefined): string {
  return (mimeType || '').split(';')[0].trim().toLowerCase();
}

function getBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

function getNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function getNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

function normalizeDocumentType(documentType: string | null | undefined): string {
  return (documentType || '').trim().toLowerCase();
}

function inferPreviewKind(documentType: string | null | undefined, mimeType: string | null | undefined): PreviewKind {
  const normalizedType = normalizeDocumentType(documentType);
  const normalizedMime = normalizeMimeType(mimeType);

  if (normalizedMime === 'application/pdf' || normalizedType === '.pdf' || normalizedType === 'pdf') {
    return 'pdf';
  }

  if (
    normalizedMime === 'text/csv'
    || normalizedMime === 'application/csv'
    || normalizedMime === 'text/tab-separated-values'
    || normalizedMime === 'application/vnd.ms-excel'
    || normalizedMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || normalizedType === '.csv'
    || normalizedType === 'csv'
    || normalizedType === '.tsv'
    || normalizedType === 'tsv'
    || normalizedType === '.xls'
    || normalizedType === 'xls'
    || normalizedType === '.xlsx'
    || normalizedType === 'xlsx'
  ) {
    return 'table';
  }

  if (
    normalizedMime === 'application/json'
    || normalizedMime === 'text/json'
    || normalizedType === '.json'
    || normalizedType === 'json'
  ) {
    return 'json';
  }

  return 'text';
}

function isWrappedPreviewPayload(value: unknown): value is WrappedPreviewPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const payload = value as WrappedPreviewPayload;
  return (
    'content' in payload
    || 'mimeType' in payload
    || 'isPartialPreview' in payload
    || 'totalPages' in payload
    || 'errorMessage' in payload
  );
}

function normalizeCell(cell: unknown): string | number | null | undefined {
  if (cell === null || cell === undefined) {
    return undefined;
  }
  if (typeof cell === 'string' || typeof cell === 'number') {
    return cell;
  }
  if (cell instanceof Date) {
    return cell.toISOString();
  }
  if (typeof cell === 'boolean') {
    return cell ? 'true' : 'false';
  }
  try {
    return JSON.stringify(cell);
  } catch {
    return String(cell);
  }
}

function parseDelimitedTextToSheet(text: string, delimiter: ',' | '\t') {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows = lines
    .filter((line) => line.length > 0)
    .map((line) => line.split(delimiter).map((cell) => cell));

  if (rows.length === 0) {
    return {
      id: 'sheet-1',
      name: 'Sheet 1',
      columns: [],
      rows: [],
    };
  }

  const [headerRow, ...dataRows] = rows;
  const columns = headerRow.map((header) => header.trim());
  return {
    id: 'sheet-1',
    name: 'Sheet 1',
    columns,
    rows: dataRows,
  };
}

async function parseWorkbookToSheets(buffer: ArrayBuffer) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, {type: 'array'});
  return workbook.SheetNames.map((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
      defval: '',
    });
    const [headerRow = [], ...dataRows] = rows;
    return {
      id: `sheet-${index + 1}`,
      name: sheetName,
      columns: headerRow.map((cell) => String(cell)),
      rows: dataRows.map((row) => row.map((cell) => normalizeCell(cell))),
    };
  });
}

function ensurePdfContent(
  content: unknown,
): {content: {src: string}; objectUrl: string | null; errorMessage?: string | null} {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (/^(blob:|https?:\/\/|data:|\/)/i.test(trimmed)) {
      return {content: {src: trimmed}, objectUrl: null};
    }
    return {
      content: {src: ''},
      objectUrl: null,
      errorMessage: '缺少可用的 PDF 地址',
    };
  }

  if (content && typeof content === 'object') {
    const maybe = content as Record<string, unknown>;
    const src = [maybe.src, maybe.url, maybe.pdfUrl, maybe.contentUrl].find((item) => typeof item === 'string' && item.trim());
    if (typeof src === 'string') {
      return {content: {src}, objectUrl: null};
    }
  }

  return {
    content: {src: ''},
    objectUrl: null,
    errorMessage: '缺少可用的 PDF 地址',
  };
}

async function parseContentByKind(
  kind: PreviewKind,
  payloadContent: unknown,
  response: Response,
  documentType: string,
  effectiveMimeType: string | null,
): Promise<{content: unknown; objectUrl: string | null; errorMessage?: string | null}> {
  if (kind === 'pdf') {
    if (payloadContent !== undefined) {
      return ensurePdfContent(payloadContent);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    return {
      content: {src: objectUrl},
      objectUrl,
    };
  }

  if (kind === 'table') {
    if (payloadContent !== undefined) {
      if (payloadContent && typeof payloadContent === 'object' && !Array.isArray(payloadContent)) {
        const maybe = payloadContent as Record<string, unknown>;
        if (Array.isArray(maybe.sheets)) {
          return {content: payloadContent, objectUrl: null};
        }
      }
      if (Array.isArray(payloadContent)) {
        return {content: {sheets: [{id: 'sheet-1', name: 'Sheet 1', rows: payloadContent}]}, objectUrl: null};
      }
      if (typeof payloadContent === 'string') {
        const delimiter = normalizeMimeType(effectiveMimeType) === 'text/tab-separated-values' || documentType === '.tsv' || documentType === 'tsv' ? '\t' : ',';
        const sheet = parseDelimitedTextToSheet(payloadContent, delimiter as ',' | '\t');
        return {content: {sheets: [sheet]}, objectUrl: null};
      }
      return {content: payloadContent, objectUrl: null};
    }

    const normalizedType = normalizeDocumentType(documentType);
    const normalizedMime = normalizeMimeType(effectiveMimeType);
    const isDelimitedByType = normalizedType === '.csv'
      || normalizedType === 'csv'
      || normalizedType === '.tsv'
      || normalizedType === 'tsv';
    const isExcel = normalizedType === '.xls'
      || normalizedType === '.xlsx'
      || normalizedType === 'xls'
      || normalizedType === 'xlsx'
      || normalizedMime === 'application/vnd.ms-excel'
      || normalizedMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    if (!isDelimitedByType && isExcel) {
      const buffer = await response.arrayBuffer();
      const sheets = await parseWorkbookToSheets(buffer);
      return {content: {sheets}, objectUrl: null};
    }

    const text = await response.text();
    const delimiter = normalizedMime === 'text/tab-separated-values' || normalizedType === '.tsv' || normalizedType === 'tsv' ? '\t' : ',';
    const sheet = parseDelimitedTextToSheet(text, delimiter as ',' | '\t');
    return {content: {sheets: [sheet]}, objectUrl: null};
  }

  if (kind === 'json') {
    if (payloadContent !== undefined) {
      return {content: payloadContent, objectUrl: null};
    }

    const text = await response.text();
    try {
      return {content: JSON.parse(text), objectUrl: null};
    } catch {
      return {content: text, objectUrl: null};
    }
  }

  if (payloadContent !== undefined) {
    if (typeof payloadContent === 'string') {
      return {content: payloadContent, objectUrl: null};
    }
    try {
      return {content: JSON.stringify(payloadContent, null, 2), objectUrl: null};
    } catch {
      return {content: String(payloadContent), objectUrl: null};
    }
  }

  return {content: await response.text(), objectUrl: null};
}

async function buildResource(
  documentId: string,
  documentType: string,
  response: Response,
): Promise<DocumentPreviewResource> {
  const responseContentType = response.headers.get('content-type');
  const normalizedResponseMimeType = normalizeMimeType(responseContentType);

  const shouldParseJsonBody = normalizedResponseMimeType === 'application/json' || normalizedResponseMimeType === 'text/json';
  const maybePayload = shouldParseJsonBody ? await response.json() : undefined;

  const wrappedPayload = isWrappedPreviewPayload(maybePayload) ? maybePayload : null;
  const payloadContent = wrappedPayload ? wrappedPayload.content : (shouldParseJsonBody ? maybePayload : undefined);
  const payloadMimeType = getNullableString(wrappedPayload?.mimeType);
  const effectiveMimeType = payloadMimeType ?? responseContentType;
  const kind = inferPreviewKind(documentType, effectiveMimeType);
  const parsed = await parseContentByKind(kind, payloadContent, response, documentType, effectiveMimeType);

  return {
    documentId,
    documentType,
    kind,
    mimeType: payloadMimeType ?? responseContentType,
    isPartialPreview: getBoolean(wrappedPayload?.isPartialPreview),
    totalPages: getNullableNumber(wrappedPayload?.totalPages),
    errorMessage: getNullableString(wrappedPayload?.errorMessage) ?? parsed.errorMessage,
    objectUrl: parsed.objectUrl,
    content: parsed.content,
  };
}

export function useDocumentPreviewResource({
  apiUrl,
  documentId,
  documentType,
  enabled = true,
}: UseDocumentPreviewResourceInput): UseDocumentPreviewResourceState {
  const cacheRef = useRef<Map<string, DocumentPreviewResource>>(new Map());
  const controllerRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);
  const [state, setState] = useState<UseDocumentPreviewResourceState>({
    loading: false,
    error: null,
    resource: null,
  });

  useEffect(() => {
    if (!enabled || !documentId) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      setState({loading: false, error: null, resource: null});
      return;
    }

    const normalizedType = documentType || 'unknown';
    const cacheKey = `${documentId}::${normalizedType}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      updateCache(cacheRef.current, cacheKey, cached);
      setState({loading: false, error: null, resource: cached});
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    requestVersionRef.current += 1;
    const requestVersion = requestVersionRef.current;

    setState((prev) => ({...prev, loading: true, error: null, resource: null}));

    const endpoint = `/api/documents/${encodeURIComponent(documentId)}/content`;
    fetch(resolveApiUrl(apiUrl, endpoint), {signal: controller.signal})
      .then(async (response) => {
        if (!response.ok) {
          throw createError(
            mapStatusToErrorCode(response.status),
            `Failed to load preview resource: ${response.status}`,
            response.status,
          );
        }
        const resource = await buildResource(documentId, normalizedType, response);

        if (requestVersion !== requestVersionRef.current || controller.signal.aborted) {
          if (resource.objectUrl) {
            URL.revokeObjectURL(resource.objectUrl);
          }
          return;
        }
        updateCache(cacheRef.current, cacheKey, resource);
        setState({loading: false, error: null, resource});
      })
      .catch((error: unknown) => {
        if (requestVersion !== requestVersionRef.current || controller.signal.aborted) {
          return;
        }

        if (isDocumentPreviewError(error)) {
          setState({loading: false, error, resource: null});
          return;
        }

        setState({
          loading: false,
          error: createError('PREVIEW_NETWORK_ERROR', 'Preview request failed'),
          resource: null,
        });
      });

    return () => {
      controller.abort();
    };
  }, [apiUrl, documentId, documentType, enabled]);

  useEffect(() => () => {
    controllerRef.current?.abort();
    cacheRef.current.forEach((cached) => {
      if (cached.objectUrl) {
        URL.revokeObjectURL(cached.objectUrl);
      }
    });
    cacheRef.current.clear();
  }, []);

  return state;
}
