// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { cleanDocumentText } from './document-cleaner.ts';
import type { ParsedDocument } from './document-parser.ts';

describe('document-cleaner', () => {
  it('removes repeated headers and footers while keeping headings', () => {
    const parsed: ParsedDocument = {
      fileType: 'pdf',
      fileName: 'sample.pdf',
      text: '企业报告\n第一章\n正文段落\n企业报告\n页码 1',
      units: [
        { sourceUnit: 'heading', sourceLabel: '第一章', text: '第一章' },
        { sourceUnit: 'body', sourceLabel: null, text: '企业报告\n正文段落\n企业报告\n页码 1' },
      ],
    };

    const cleaned = cleanDocumentText(parsed);

    expect(cleaned.text).not.toContain('页码 1');
    expect(cleaned.cleaningApplied).toContain('remove_pagination_footer');
  });

  it('removes blank lines and mojibake but preserves heading hierarchy metadata', () => {
    const parsed: ParsedDocument = {
      fileType: 'docx',
      fileName: 'sample.docx',
      text: '标题\n\n\næµè¯\n正文',
      units: [
        { sourceUnit: 'heading', sourceLabel: '标题', text: '标题' },
        { sourceUnit: 'body', sourceLabel: null, text: 'æµè¯\n\n\n正文' },
      ],
    };

    const cleaned = cleanDocumentText(parsed);

    expect(cleaned.text).not.toContain('æµè¯');
    expect(cleaned.text).not.toContain('\n\n\n');
    expect(cleaned.structure[0]?.level).toBe(1);
    expect(cleaned.units.every((unit) => unit.text.trim().length > 0)).toBe(true);
  });

  it('removes reference tail so only body remains for chunking', () => {
    const parsed: ParsedDocument = {
      fileType: 'pdf',
      fileName: 'paper.pdf',
      text: '结论段落\n\n参考文献\n[1] xxx',
      units: [
        { sourceUnit: 'body', sourceLabel: null, text: '结论段落\n\n参考文献\n[1] xxx' },
      ],
    };

    const cleaned = cleanDocumentText(parsed);

    expect(cleaned.text).toContain('结论段落');
    expect(cleaned.text).not.toContain('参考文献');
    expect(cleaned.cleaningApplied).toContain('remove_reference_tail');
  });
});
