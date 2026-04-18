import {describe, expect, it} from 'vitest';
import {buildPdfHighlightTarget} from './pdf-highlight-target';

describe('buildPdfHighlightTarget', () => {
  it('returns page fallback even when quote text is present', () => {
    expect(
      buildPdfHighlightTarget({
        pageStart: 2,
        textQuote: '这里是目标朔源内容片段',
        content: '这里是目标朔源内容片段',
      }),
    ).toEqual({
      page: 2,
      notice: '当前仅支持定位到 PDF 页码，暂不展示不可信的精确高亮。',
    });
  });

  it('falls back to page 1 when the target page is unavailable', () => {
    expect(
      buildPdfHighlightTarget({
        textQuote: '这里是目标朔源内容片段',
      }),
    ).toEqual({
      page: 1,
      notice: '当前仅支持定位到 PDF 页码，暂不展示不可信的精确高亮。',
    });
  });
});
