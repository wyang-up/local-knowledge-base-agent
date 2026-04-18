import {useMemo} from 'react';
import type {SourceHighlightTarget} from '../source-highlight-target';
import {buildPdfHighlightTarget} from './pdf-highlight-target';

type SourceHighlight = SourceHighlightTarget | null;

type PdfPreviewProps = {
  src: string;
  isPartialPreview?: boolean;
  errorMessage?: string;
  sourceHighlight?: SourceHighlight;
  onSourceBlockClick?: () => void;
};

function sanitizePdfSource(src: string): string {
  const hashIndex = src.indexOf('#');
  if (hashIndex < 0) {
    return src;
  }
  return src.slice(0, hashIndex);
}

function buildPdfViewerUrl(src: string, sourceHighlight: SourceHighlight): string {
  const base = sanitizePdfSource(src);
  const target = buildPdfHighlightTarget(sourceHighlight);

  const hashParams: string[] = ['toolbar=0', 'navpanes=0', 'statusbar=0', 'messages=0'];
  hashParams.push(`page=${target.page}`);
  hashParams.push('zoom=page-width');

  return `${base}#${hashParams.join('&')}`;
}

export function PdfPreview({src, isPartialPreview = false, errorMessage, sourceHighlight = null}: PdfPreviewProps) {
  const viewerUrl = useMemo(() => buildPdfViewerUrl(src, sourceHighlight), [src, sourceHighlight]);
  const highlightTarget = useMemo(() => sourceHighlight ? buildPdfHighlightTarget(sourceHighlight) : null, [sourceHighlight]);

  return (
    <section data-testid="pdf-preview-renderer" className="h-full min-h-0 flex flex-col">
      {errorMessage ? (
        <div role="alert" data-testid="pdf-preview-error" className="mb-2 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>PDF 预览失败，请稍后重试。</p>
          <p>{errorMessage}</p>
        </div>
      ) : null}
      {isPartialPreview ? <p className="shrink-0 text-xs text-gray-600">当前仅展示部分预览内容。</p> : null}
      {highlightTarget ? <p className="mt-2 shrink-0 text-xs text-amber-700">{highlightTarget.notice}</p> : null}
      <iframe
        title="PDF 预览内容"
        src={viewerUrl}
        className="mt-2 w-full flex-1 min-h-0 border-0 rounded-[8px] bg-white"
      />
    </section>
  );
}
