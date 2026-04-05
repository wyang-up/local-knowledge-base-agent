import {useEffect, useMemo, useState} from 'react';

type PdfPreviewProps = {
  src: string;
  isPartialPreview?: boolean;
  errorMessage?: string;
  totalPages?: number | null;
};

const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 10;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function buildPdfViewerUrl(src: string, page: number, zoom: number): string {
  const separator = src.includes('#') ? '&' : '#';
  return `${src}${separator}page=${page}&zoom=${zoom}`;
}

function normalizeTotalPages(totalPages: number | null | undefined): number | null {
  if (!Number.isFinite(totalPages) || !totalPages || totalPages < 1) {
    return null;
  }
  return Math.floor(totalPages);
}

export function PdfPreview({src, isPartialPreview = false, errorMessage, totalPages = null}: PdfPreviewProps) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const knownTotalPages = useMemo(() => normalizeTotalPages(totalPages), [totalPages]);
  const isNextPageDisabled = knownTotalPages !== null && page >= knownTotalPages;

  useEffect(() => {
    setPage(1);
    setZoom(100);
  }, [src]);

  useEffect(() => {
    if (knownTotalPages !== null && page > knownTotalPages) {
      setPage(knownTotalPages);
    }
  }, [knownTotalPages, page]);

  const viewerUrl = useMemo(() => buildPdfViewerUrl(src, page, zoom), [src, page, zoom]);

  if (errorMessage) {
    return (
      <div role="alert" data-testid="pdf-preview-error">
        <p>PDF 预览失败，请稍后重试。</p>
        <p>{errorMessage}</p>
      </div>
    );
  }

  return (
    <section data-testid="pdf-preview-renderer">
      <div>
        <button
          type="button"
          onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
          disabled={page <= 1}
        >
          上一页
        </button>
        <label htmlFor="pdf-preview-page-input">页码</label>
        <input
          id="pdf-preview-page-input"
          type="number"
          min={1}
          max={knownTotalPages ?? undefined}
          value={page}
          onChange={(event) => {
            const nextPage = Number.parseInt(event.target.value, 10);
            if (Number.isNaN(nextPage) || nextPage < 1) {
              return;
            }
            if (knownTotalPages !== null && nextPage > knownTotalPages) {
              return;
            }
            setPage(nextPage);
          }}
        />
        <button
          type="button"
          onClick={() => {
            setPage((currentPage) => {
              if (knownTotalPages !== null) {
                return Math.min(knownTotalPages, currentPage + 1);
              }
              return currentPage + 1;
            });
          }}
          disabled={isNextPageDisabled}
        >
          下一页
        </button>
      </div>

      <div>
        <button type="button" onClick={() => setZoom((currentZoom) => clampZoom(currentZoom - ZOOM_STEP))}>
          缩小
        </button>
        <span>{zoom}%</span>
        <button type="button" onClick={() => setZoom((currentZoom) => clampZoom(currentZoom + ZOOM_STEP))}>
          放大
        </button>
      </div>

      {isPartialPreview ? <p>当前仅展示部分预览内容。</p> : null}

      <iframe title="PDF 预览内容" src={viewerUrl} style={{width: '100%', minHeight: 480}} />
    </section>
  );
}
