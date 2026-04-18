import type {SourceHighlightTarget} from '../source-highlight-target';

export const PDF_PAGE_FALLBACK_NOTICE = '当前仅支持定位到 PDF 页码，暂不展示不可信的精确高亮。';

export type PdfHighlightTarget = {
  page: number;
  notice: string;
};

export function buildPdfHighlightTarget(sourceHighlight: SourceHighlightTarget | null | undefined): PdfHighlightTarget {
  const page = typeof sourceHighlight?.pageStart === 'number' && sourceHighlight.pageStart > 0
    ? sourceHighlight.pageStart
    : typeof sourceHighlight?.pageEnd === 'number' && sourceHighlight.pageEnd > 0
      ? sourceHighlight.pageEnd
      : 1;

  return {
    page,
    notice: PDF_PAGE_FALLBACK_NOTICE,
  };
}
