import {useEffect, useMemo, useRef} from 'react';
import type {SourceHighlightTarget} from './source-highlight-target';
import type {DocumentPreviewError, DocumentPreviewResource} from './preview-types';
import {JsonPreview} from './renderers/JsonPreview';
import {PdfPreview} from './renderers/PdfPreview';
import {TablePreview, type TablePreviewSheet} from './renderers/TablePreview';
import {TextPreview} from './renderers/TextPreview';

export type PreviewKind = 'pdf' | 'table' | 'json' | 'text';

export type PreviewTypeSource = 'mime' | 'extension' | 'fallback';

export type PreviewFallbackReason = 'unsupported' | 'type-disabled';

export type PreviewTypeFlags = Partial<Record<PreviewKind, boolean>>;

export type ResolvePreviewTypeInput = {
  mimeType?: string | null;
  fileName?: string | null;
  extension?: string | null;
  fallbackType?: string | null;
  enabledTypes?: PreviewTypeFlags;
};

export type ResolvePreviewTypeResult =
  | {
      resolvedType: PreviewKind;
      source: PreviewTypeSource;
      isFallback: false;
      fallbackReason: null;
      disabledType: null;
    }
  | {
      resolvedType: null;
      source: PreviewTypeSource | null;
      isFallback: true;
      fallbackReason: PreviewFallbackReason;
      disabledType: PreviewKind | null;
    };

const MIME_TYPE_MAP: Array<{pattern: RegExp; type: PreviewKind}> = [
  {pattern: /^application\/pdf$/i, type: 'pdf'},
  {pattern: /^(text\/csv|application\/csv|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/i, type: 'table'},
  {pattern: /^(application\/json|text\/json)$/i, type: 'json'},
  {pattern: /^text\/(plain|markdown)$/i, type: 'text'},
];

const EXTENSION_MAP: Record<string, PreviewKind> = {
  '.pdf': 'pdf',
  '.csv': 'table',
  '.xls': 'table',
  '.xlsx': 'table',
  '.json': 'json',
  '.txt': 'text',
  '.md': 'text',
  '.markdown': 'text',
};

function normalizeExtension(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const lower = value.trim().toLowerCase();
  if (!lower) {
    return '';
  }
  return lower.startsWith('.') ? lower : `.${lower}`;
}

function extensionFromFileName(fileName: string | null | undefined): string {
  if (!fileName) {
    return '';
  }
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex < 0) {
    return '';
  }
  return normalizeExtension(fileName.slice(dotIndex));
}

function normalizeFallbackType(fallbackType: string | null | undefined): PreviewKind | null {
  if (!fallbackType) {
    return null;
  }
  const normalized = fallbackType.trim().toLowerCase();
  if (normalized === 'pdf' || normalized === 'table' || normalized === 'json' || normalized === 'text') {
    return normalized;
  }
  const extensionMapped = EXTENSION_MAP[normalizeExtension(normalized)];
  return extensionMapped ?? null;
}

function isTypeEnabled(type: PreviewKind, enabledTypes: PreviewTypeFlags | undefined): boolean {
  return enabledTypes?.[type] !== false;
}

function resolveByMime(mimeType: string | null | undefined): PreviewKind | null {
  if (!mimeType) {
    return null;
  }
  const normalized = mimeType.trim().toLowerCase().split(';')[0].trim();
  for (const candidate of MIME_TYPE_MAP) {
    if (candidate.pattern.test(normalized)) {
      return candidate.type;
    }
  }
  return null;
}

function resolveByExtension(extension: string): PreviewKind | null {
  return EXTENSION_MAP[extension] ?? null;
}

function createResolvedResult(type: PreviewKind, source: PreviewTypeSource): ResolvePreviewTypeResult {
  return {
    resolvedType: type,
    source,
    isFallback: false,
    fallbackReason: null,
    disabledType: null,
  };
}

function createFallbackResult(
  reason: PreviewFallbackReason,
  source: PreviewTypeSource | null,
  disabledType: PreviewKind | null,
): ResolvePreviewTypeResult {
  return {
    resolvedType: null,
    source,
    isFallback: true,
    fallbackReason: reason,
    disabledType,
  };
}

export function resolveDocumentPreviewType({
  mimeType,
  fileName,
  extension,
  fallbackType,
  enabledTypes,
}: ResolvePreviewTypeInput): ResolvePreviewTypeResult {
  // Strict priority contract:
  // once a higher-priority source resolves to a known type, disabled status should
  // immediately return type-disabled fallback, and must not downgrade to lower-priority sources.
  const resolvedByMime = resolveByMime(mimeType);
  if (resolvedByMime) {
    if (!isTypeEnabled(resolvedByMime, enabledTypes)) {
      return createFallbackResult('type-disabled', 'mime', resolvedByMime);
    }
    return createResolvedResult(resolvedByMime, 'mime');
  }

  const normalizedExtension = normalizeExtension(extension) || extensionFromFileName(fileName);
  const resolvedByExtension = resolveByExtension(normalizedExtension);
  if (resolvedByExtension) {
    if (!isTypeEnabled(resolvedByExtension, enabledTypes)) {
      return createFallbackResult('type-disabled', 'extension', resolvedByExtension);
    }
    return createResolvedResult(resolvedByExtension, 'extension');
  }

  const resolvedByFallback = normalizeFallbackType(fallbackType);
  if (resolvedByFallback) {
    if (!isTypeEnabled(resolvedByFallback, enabledTypes)) {
      return createFallbackResult('type-disabled', 'fallback', resolvedByFallback);
    }
    return createResolvedResult(resolvedByFallback, 'fallback');
  }

  return createFallbackResult('unsupported', null, null);
}

type DocumentPreviewContentProps = ResolvePreviewTypeInput & {
  resource?: DocumentPreviewResource | null;
  loading?: boolean;
  error?: DocumentPreviewError | null;
  sourceHighlight?: SourceHighlightTarget | null;
  onLocateChunk?: () => void;
  onBackToQa?: () => void;
  fallbackLabel?: string;
  loadingLabel?: string;
  errorLabel?: string;
  onFallback?: (result: ResolvePreviewTypeResult) => void;
};

type PreviewSourceHighlight = SourceHighlightTarget | null;

function SourceHighlightBanner({
  sourceHighlight,
  onLocateChunk,
  onBackToQa,
}: {
  sourceHighlight: PreviewSourceHighlight;
  onLocateChunk?: () => void;
  onBackToQa?: () => void;
}) {
  const sourceSummary = sourceHighlight?.content?.trim() || '';
  if (!sourceSummary) {
    return null;
  }

  const sourceChunkLabel = typeof sourceHighlight?.chunkIndex === 'number'
    ? `第${sourceHighlight.chunkIndex + 1}分块`
    : '目标分块';

  return (
    <div className="mb-2 rounded-[8px] border border-[#E8C95A] bg-[#FFF7CC] px-3 py-2 text-xs text-gray-800">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate">
          <strong className="mr-1">溯源定位：</strong>
          <span className="mr-2">{sourceChunkLabel}</span>
          <span>{sourceSummary}</span>
        </p>
        <div className="shrink-0 flex items-center gap-2">
          {onLocateChunk ? (
            <button
              type="button"
              onClick={onLocateChunk}
              className="rounded-[8px] border border-[#1677FF]/35 px-2 py-1 text-[#1677FF] hover:bg-blue-50"
            >
              跳转详情
            </button>
          ) : null}
          {onBackToQa ? (
            <button
              type="button"
              onClick={onBackToQa}
              className="rounded-[8px] border border-[#1677FF]/35 px-2 py-1 text-[#1677FF] hover:bg-blue-50"
            >
              返回AI回答
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeTableRows(value: unknown): Array<Array<string | number | null | undefined>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((row) => {
    if (!Array.isArray(row)) {
      return [String(row)];
    }
    return row.map((cell) => {
      if (cell === null || cell === undefined || typeof cell === 'string' || typeof cell === 'number') {
        return cell;
      }
      return JSON.stringify(cell);
    });
  });
}

function toTableSheets(content: unknown): TablePreviewSheet[] {
  if (Array.isArray(content)) {
    return [
      {
        id: 'sheet-1',
        name: 'Sheet 1',
        rows: normalizeTableRows(content),
      },
    ];
  }

  const contentObject = asObject(content);
  if (!contentObject) {
    return [];
  }

  const sheetsCandidate = contentObject.sheets;
  if (Array.isArray(sheetsCandidate)) {
    return sheetsCandidate
      .map((sheet, index) => {
        const parsed = asObject(sheet);
        if (!parsed) {
          return null;
        }
        const id = typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id : `sheet-${index + 1}`;
        const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : `Sheet ${index + 1}`;
        const columns = Array.isArray(parsed.columns)
          ? parsed.columns.map((column) => String(column))
          : undefined;
        const rows = normalizeTableRows(parsed.rows);
        const normalizedSheet: TablePreviewSheet = {id, name, columns, rows};
        return normalizedSheet;
      })
      .filter((sheet): sheet is TablePreviewSheet => Boolean(sheet));
  }

  const rows = normalizeTableRows(contentObject.rows);
  const columns = Array.isArray(contentObject.columns)
    ? contentObject.columns.map((column) => String(column))
    : undefined;

  return [
    {
      id: 'sheet-1',
      name: 'Sheet 1',
      columns,
      rows,
    },
  ];
}

function toPdfSrc(content: unknown): string {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return /^(blob:|https?:\/\/|data:|\/)/i.test(trimmed) ? trimmed : '';
  }

  const contentObject = asObject(content);
  if (!contentObject) {
    return '';
  }

  const candidates = [contentObject.src, contentObject.url, contentObject.pdfUrl, contentObject.contentUrl];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }
  return '';
}

function toText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (content === null || content === undefined) {
    return '';
  }
  if (typeof content === 'object') {
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  }
  return String(content);
}

export function DocumentPreviewContent({
  mimeType,
  fileName,
  extension,
  fallbackType,
  enabledTypes,
  resource,
  loading = false,
  error = null,
  sourceHighlight = null,
  onLocateChunk,
  onBackToQa,
  fallbackLabel = 'Legacy fallback',
  loadingLabel = '预览加载中...',
  errorLabel = '预览加载失败，请稍后重试。',
  onFallback,
}: DocumentPreviewContentProps) {
  const resolved = useMemo(
    () => resolveDocumentPreviewType({
      mimeType,
      fileName,
      extension,
      fallbackType,
      enabledTypes,
    }),
    [mimeType, fileName, extension, fallbackType, enabledTypes],
  );

  const lastFallbackKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!resolved.isFallback) {
      lastFallbackKeyRef.current = null;
      return;
    }

    const fallbackKey = `${resolved.source ?? 'none'}::${resolved.fallbackReason}::${resolved.disabledType ?? 'none'}`;
    if (fallbackKey === lastFallbackKeyRef.current) {
      return;
    }

    lastFallbackKeyRef.current = fallbackKey;
    onFallback?.(resolved);
  }, [resolved, onFallback]);

  if (loading) {
    return <div data-testid="preview-content-loading">{loadingLabel}</div>;
  }

  if (error) {
    return (
      <div role="alert" data-testid="preview-content-error">
        <p>{errorLabel}</p>
        <p>{error.message}</p>
      </div>
    );
  }

  if (resolved.isFallback) {
    return (
      <div
        data-testid="preview-placeholder-fallback"
        data-fallback-reason={resolved.fallbackReason ?? ''}
        data-disabled-type={resolved.disabledType ?? ''}
      >
        {fallbackLabel}
      </div>
    );
  }

  if (resolved.resolvedType === 'pdf') {
    const src = toPdfSrc(resource?.content);
    return (
      <section className="h-full min-h-0 flex flex-col">
        <SourceHighlightBanner sourceHighlight={sourceHighlight} onLocateChunk={onLocateChunk} onBackToQa={onBackToQa} />
        <PdfPreview
          src={src}
          isPartialPreview={Boolean(resource?.isPartialPreview)}
          sourceHighlight={sourceHighlight}
          errorMessage={!src ? '缺少可用的 PDF 地址' : (resource?.errorMessage ?? undefined)}
        />
      </section>
    );
  }

  if (resolved.resolvedType === 'table') {
    return (
      <section className="h-full min-h-0 flex flex-col">
        <SourceHighlightBanner sourceHighlight={sourceHighlight} onLocateChunk={onLocateChunk} onBackToQa={onBackToQa} />
        <TablePreview
          sheets={toTableSheets(resource?.content)}
          sourceHighlight={sourceHighlight}
          onSourceBlockClick={onLocateChunk}
          onSourceBlockAuxClick={onBackToQa}
          isPartialPreview={Boolean(resource?.isPartialPreview)}
          errorMessage={resource?.errorMessage ?? undefined}
        />
      </section>
    );
  }

  if (resolved.resolvedType === 'json') {
    return (
      <section className="h-full min-h-0 flex flex-col">
        <SourceHighlightBanner sourceHighlight={sourceHighlight} onLocateChunk={onLocateChunk} onBackToQa={onBackToQa} />
        <JsonPreview value={resource?.content} sourceHighlight={sourceHighlight} onSourceBlockClick={onLocateChunk} onSourceBlockAuxClick={onBackToQa} isPartialPreview={Boolean(resource?.isPartialPreview)} errorMessage={resource?.errorMessage ?? undefined} />
      </section>
    );
  }

  return (
    <section className="h-full min-h-0 flex flex-col">
      <SourceHighlightBanner sourceHighlight={sourceHighlight} onLocateChunk={onLocateChunk} onBackToQa={onBackToQa} />
      <TextPreview text={toText(resource?.content)} sourceHighlight={sourceHighlight} onSourceBlockClick={onLocateChunk} onSourceBlockAuxClick={onBackToQa} isPartialPreview={Boolean(resource?.isPartialPreview)} errorMessage={resource?.errorMessage ?? undefined} />
    </section>
  );
}
