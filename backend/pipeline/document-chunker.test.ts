// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { chunkDocument, qualityCheckChunks } from './document-chunker.ts';
import { splitSentencesForTest } from './document-chunker.test-helper.ts';
import { protectEnglishBoundaries, restoreProtectedTokens } from './document-sentence-splitter.ts';
import type { CleanedDocument } from './document-cleaner.ts';

function baseCleaned(overrides: Partial<CleanedDocument> = {}): CleanedDocument {
  return {
    fileType: 'pdf',
    fileName: 'sample.pdf',
    text: '默认文本。',
    cleaningApplied: [],
    structure: [],
    units: [],
    ...overrides,
  };
}

describe('document-chunker', () => {
  it('keeps small txt as one chunk', () => {
    const chunks = chunkDocument(baseCleaned({ fileType: 'txt', fileName: 'short.txt', text: '短文本保留', units: [{ sourceUnit: 'body', sourceLabel: null, text: '短文本保留' }] }));

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.qualityNote).toBe('small_text_single_chunk');
  });

  it('splits long txt semantically with overlap metadata', () => {
    const longText = Array.from({ length: 260 }, () => '这是一个较长句子用于语义分块。').join('');
    const chunks = chunkDocument(baseCleaned({ fileType: 'txt', text: longText, units: [{ sourceUnit: 'body', sourceLabel: null, text: longText }] }));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((chunk) => chunk.overlapTokenCount > 0)).toBe(true);
  });

  it('splits pdf/docx by heading and sentence boundaries', () => {
    const chapterOne = Array.from({ length: 120 }, () => '这是第一章里比较长的一句，用于触发语义分块。').join('');
    const chapterTwo = Array.from({ length: 120 }, () => '这是第二章里比较长的一句，用于触发语义分块。').join('');
    const text = `第一章\n\n${chapterOne}\n\n第二章\n\n${chapterTwo}`;
    const chunks = chunkDocument(baseCleaned({
      fileType: 'pdf',
      text,
      structure: [{ label: '第一章', level: 1 }, { label: '第二章', level: 1 }],
      units: [{ sourceUnit: 'body', sourceLabel: null, text }],
    }));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((chunk) => chunk.sourceLabel?.includes('第一章'))).toBe(true);
  });

  it('chunks sheet data by headers and row groups', () => {
    const sheetRows = Array.from({ length: 420 }, (_, i) => `张三${i} | ${(i % 100) + 1} | 数学 | 期末考试`).join('\n');
    const chunks = chunkDocument(baseCleaned({
      fileType: 'xlsx',
      text: sheetRows,
      units: [{ sourceUnit: 'sheet', sourceLabel: '成绩表', text: sheetRows, headers: ['姓名', '分数'] }],
    }));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.sourceUnit === 'sheet')).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes('Header: 姓名 | 分数'))).toBe(true);
  });

  it('keeps small json as single chunk and splits large json by top-level nodes', () => {
    const small = chunkDocument(baseCleaned({
      fileType: 'json',
      text: '{"a":1}',
      units: [{ sourceUnit: 'json_node', sourceLabel: 'a', nodePath: 'a', text: '1' }],
    }));
    expect(small).toHaveLength(1);

    const largeUnits = Array.from({ length: 30 }, (_, i) => ({
      sourceUnit: 'json_node' as const,
      sourceLabel: `node_${i}`,
      nodePath: `node_${i}`,
      text: JSON.stringify({ value: 'x'.repeat(120) }),
    }));
    const large = chunkDocument(baseCleaned({ fileType: 'json', text: JSON.stringify(Object.fromEntries(largeUnits.map((u) => [u.sourceLabel!, JSON.parse(u.text)]))), units: largeUnits }));

    expect(large.length).toBeGreaterThan(1);
    expect(large.every((chunk) => chunk.overlapTokenCount === 0)).toBe(true);
  });

  it('quality check merges tiny fragments and filters empty chunks', () => {
    const checked = qualityCheckChunks([
      { sourceUnit: 'body', sourceLabel: null, content: '主体内容'.repeat(80), tokenCount: 200, overlapTokenCount: 0, qualityStatus: 'passed' },
      { sourceUnit: 'body', sourceLabel: null, content: '短片段', tokenCount: 5, overlapTokenCount: 0, qualityStatus: 'passed' },
      { sourceUnit: 'body', sourceLabel: null, content: '   ', tokenCount: 0, overlapTokenCount: 0, qualityStatus: 'filtered' },
    ]);

    expect(checked.length).toBe(1);
    expect(checked[0]?.qualityStatus).toBe('merged');
  });

  it('adds bilingual tree metadata for pdf/docx chunks', () => {
    const text = `Abstract\n\n${Array.from({ length: 120 }, () => 'This is overview sentence for metadata.').join(' ')}\n\n第1章 方法\n\n${Array.from({ length: 120 }, () => '这里是中文段落用于元数据测试。').join('')}`;
    const chunks = chunkDocument(baseCleaned({
      fileType: 'pdf',
      fileName: 'meta.pdf',
      text,
      structure: [{ label: 'Abstract', level: 1 }, { label: '第1章 方法', level: 1 }],
      units: [{ sourceUnit: 'body', sourceLabel: null, text }],
    }));

    expect(chunks.every((chunk) => chunk.lang === 'zh' || chunk.lang === 'en')).toBe(true);
    expect(chunks.every((chunk) => Array.isArray(chunk.hierarchy))).toBe(true);
    expect(chunks.every((chunk) => typeof chunk.title === 'string' && chunk.title.length > 0)).toBe(true);
    expect(chunks.some((chunk) => chunk.nodeType === 'abstract' || chunk.nodeType === 'chapter' || chunk.nodeType === 'body')).toBe(true);
  });

  it('keeps appendix as a single level-1 chunk', () => {
    const body = Array.from({ length: 120 }, () => 'Main chapter sentence for triggering semantic chunking.').join(' ');
    const appendix = Array.from({ length: 80 }, () => 'Appendix detail sentence remains in one chunk.').join(' ');
    const text = `Chapter 1\n\n${body}\n\nAppendix\n\n${appendix}`;
    const chunks = chunkDocument(baseCleaned({
      fileType: 'pdf',
      fileName: 'appendix.pdf',
      text,
      units: [{ sourceUnit: 'body', sourceLabel: null, text }],
    }));

    const appendixChunks = chunks.filter((chunk) => chunk.sectionType === 'appendix');
    expect(appendixChunks).toHaveLength(1);
    expect(appendixChunks[0]?.sectionLevel).toBe(1);
    expect(appendixChunks[0]?.qualityNote).toBe('appendix_single_chunk');
  });

  it('splits references by entries instead of sentence windows', () => {
    const body = Array.from({ length: 120 }, () => 'Main chapter sentence for triggering semantic chunking.').join(' ');
    const refs = [
      '[1] Alpha paper. 2020.',
      '[2] Beta paper. 2021.',
      '[3] Gamma paper. 2022.',
    ].join('\n');
    const text = `Chapter 1\n\n${body}\n\nReferences\n\n${refs}`;
    const chunks = chunkDocument(baseCleaned({
      fileType: 'pdf',
      fileName: 'refs.pdf',
      text,
      units: [{ sourceUnit: 'body', sourceLabel: null, text }],
    }));

    const referenceChunks = chunks.filter((chunk) => chunk.sectionType === 'references');
    expect(referenceChunks).toHaveLength(3);
    expect(referenceChunks.every((chunk) => chunk.sectionLevel === 1)).toBe(true);
    expect(referenceChunks.every((chunk) => chunk.qualityNote === 'references_entry_chunk')).toBe(true);
  });
});

describe('english sentence boundary contracts (RED)', () => {
  it('keeps e.g./i.e. inside one sentence', () => {
    const text = 'We use e.g. transformers and i.e. attention blocks. Another line starts.';

    expect(splitSentencesForTest(text)).toEqual([
      'We use e.g. transformers and i.e. attention blocks.',
      'Another line starts.',
    ]);
  });

  it('keeps Dr. title attached to person name sentence', () => {
    const text = 'Dr. Smith arrived. Next topic.';

    expect(splitSentencesForTest(text)).toEqual([
      'Dr. Smith arrived.',
      'Next topic.',
    ]);
  });

  it('does not split when U.S. appears in sentence middle', () => {
    const text = 'He lived in the U.S. market for years. Another line starts.';

    expect(splitSentencesForTest(text)).toEqual([
      'He lived in the U.S. market for years.',
      'Another line starts.',
    ]);
  });

  it('splits when U.S. appears at sentence end', () => {
    const text = 'He moved to the U.S. Another line starts.';

    expect(splitSentencesForTest(text)).toEqual([
      'He moved to the U.S.',
      'Another line starts.',
    ]);
  });

  it('keeps multi-dot + title contract as exact 5 sentences', () => {
    const text = 'We use e.g. transformers and i.e. attention blocks. Dr. Smith arrived. He lived in the U.S. market for years. He moved to the U.S. Another line starts.';

    expect(splitSentencesForTest(text)).toEqual([
      'We use e.g. transformers and i.e. attention blocks.',
      'Dr. Smith arrived.',
      'He lived in the U.S. market for years.',
      'He moved to the U.S.',
      'Another line starts.',
    ]);
  });

  it('keeps semantic version v1.2.3 in one sentence', () => {
    const text = 'Updated to v1.2.3 and then 2.0.1. Next sentence.';

    expect(splitSentencesForTest(text)).toEqual([
      'Updated to v1.2.3 and then 2.0.1.',
      'Next sentence.',
    ]);
  });

  it('tie-breaker: prefers numbering over nested version candidate', () => {
    const text = 'See Sec. 1.2.3 now. Next sentence.';

    expect(splitSentencesForTest(text)).toEqual([
      'See Sec. 1.2.3 now.',
      'Next sentence.',
    ]);
  });

  it('keeps section numbering Sec. 3.2.1 in one sentence', () => {
    const text = 'See Sec. 3.2.1 in v1.2.3 docs. Next sentence.';

    expect(splitSentencesForTest(text)).toEqual([
      'See Sec. 3.2.1 in v1.2.3 docs.',
      'Next sentence.',
    ]);
  });

  it('keeps equation numbering Eq. (2.1) in one sentence', () => {
    const text = 'Refer Eq. (2.1). Next sentence.';

    expect(splitSentencesForTest(text)).toEqual([
      'Refer Eq. (2.1).',
      'Next sentence.',
    ]);
  });

  it('keeps page range pp. 12-15 in one sentence', () => {
    const text = 'Check pp. 12-15 now. Next sentence.';

    expect(splitSentencesForTest(text)).toEqual([
      'Check pp. 12-15 now.',
      'Next sentence.',
    ]);
  });

  it('version + numbering overlap regression stays exact 4 sentences', () => {
    const text = 'Updated to v1.2.3 and then 2.0.1. See Sec. 3.2.1 in v1.2.3 docs. Refer Eq. (2.1). Check pp. 12-15 now.';

    expect(splitSentencesForTest(text)).toEqual([
      'Updated to v1.2.3 and then 2.0.1.',
      'See Sec. 3.2.1 in v1.2.3 docs.',
      'Refer Eq. (2.1).',
      'Check pp. 12-15 now.',
    ]);
  });

  it('keeps etc. at sentence end as a valid boundary', () => {
    const text = 'This is enough, etc. Another sentence.';

    expect(splitSentencesForTest(text)).toEqual([
      'This is enough, etc.',
      'Another sentence.',
    ]);
  });

  it('keeps No. 12 together in one sentence', () => {
    const text = 'See No. 12 for proof. Another sentence.';

    expect(splitSentencesForTest(text)).toEqual([
      'See No. 12 for proof.',
      'Another sentence.',
    ]);
  });

  it('keeps Fig. 3 together in one sentence', () => {
    const text = 'See Fig. 3 for proof. Another sentence.';

    expect(splitSentencesForTest(text)).toEqual([
      'See Fig. 3 for proof.',
      'Another sentence.',
    ]);
  });

  it('etc/No/Fig regression stays exact 3 sentences', () => {
    const text = 'This is enough, etc. Another sentence. See No. 12 and Fig. 3 for proof.';

    expect(splitSentencesForTest(text)).toEqual([
      'This is enough, etc.',
      'Another sentence.',
      'See No. 12 and Fig. 3 for proof.',
    ]);
  });

  it('splits sentence-end U.S. when next sentence starts with quotes or parentheses', () => {
    const quoted = 'He moved to the U.S. "Another line starts."';
    const parenthesized = 'He moved to the U.S. (Another line starts.)';

    expect(splitSentencesForTest(quoted)).toEqual([
      'He moved to the U.S.',
      '"Another line starts."',
    ]);
    expect(splitSentencesForTest(parenthesized)).toEqual([
      'He moved to the U.S.',
      '(Another line starts.)',
    ]);
  });

  it('keeps Mr./Ms. titles attached without early split', () => {
    const text = 'Mr. Brown arrived. Ms. Green followed.';

    expect(splitSentencesForTest(text)).toEqual([
      'Mr. Brown arrived.',
      'Ms. Green followed.',
    ]);
  });

  it('handles Ph.D. in-sentence and sentence-end contexts', () => {
    const middle = 'She earned a Ph.D. degree in 2010. Another sentence.';
    const sentenceEnd = 'She earned a Ph.D. "Another sentence starts."';

    expect(splitSentencesForTest(middle)).toEqual([
      'She earned a Ph.D. degree in 2010.',
      'Another sentence.',
    ]);
    expect(splitSentencesForTest(sentenceEnd)).toEqual([
      'She earned a Ph.D.',
      '"Another sentence starts."',
    ]);
  });

  it('matches legacy behavior when english boundary protection flag is disabled', () => {
    const previous = process.env.ENABLE_ENGLISH_BOUNDARY_PROTECTION;
    process.env.ENABLE_ENGLISH_BOUNDARY_PROTECTION = '0';
    try {
      const text = 'Dr. Smith arrived. He lived in the U.S. market for years.';
      expect(splitSentencesForTest(text)).toEqual([
        'Dr.',
        'Smith arrived.',
        'He lived in the U.',
        'S.',
        'market for years.',
      ]);
    } finally {
      if (previous === undefined) {
        delete process.env.ENABLE_ENGLISH_BOUNDARY_PROTECTION;
      } else {
        process.env.ENABLE_ENGLISH_BOUNDARY_PROTECTION = previous;
      }
    }
  });

  it('keeps placeholder-like literals unchanged in output', () => {
    const text = 'Literal __EB_DOT__ stays here. Literal __EB_END__ stays too.';

    expect(splitSentencesForTest(text)).toEqual([
      'Literal __EB_DOT__ stays here.',
      'Literal __EB_END__ stays too.',
    ]);
  });

  it('is character-level reversible for protect then restore', () => {
    const text = 'Dr. Smith moved to the U.S. "Another line." Ph.D. holder saw No. 12.';
    const protectedResult = protectEnglishBoundaries(text);

    expect(restoreProtectedTokens(protectedResult.text, protectedResult.tokens)).toBe(text);
  });

  it('is idempotent across repeated protect and restore cycles', () => {
    const text = 'Ms. Green earned a Ph.D. degree in the U.S. market.';
    const first = protectEnglishBoundaries(text);
    const once = restoreProtectedTokens(first.text, first.tokens);
    const second = protectEnglishBoundaries(once);
    const twice = restoreProtectedTokens(second.text, second.tokens);

    expect(twice).toBe(once);
    expect(twice).toBe(text);
  });

  it('matches legacy fixture literal when feature flag is false', () => {
    const legacyFixture = [
      'Dr.',
      'Smith arrived.',
      'He lived in the U.',
      'S.',
      'market for years.',
    ];
    const previous = process.env.ENABLE_ENGLISH_BOUNDARY_PROTECTION;
    process.env.ENABLE_ENGLISH_BOUNDARY_PROTECTION = 'false';
    try {
      const text = 'Dr. Smith arrived. He lived in the U.S. market for years.';
      expect(splitSentencesForTest(text)).toEqual(legacyFixture);
    } finally {
      if (previous === undefined) {
        delete process.env.ENABLE_ENGLISH_BOUNDARY_PROTECTION;
      } else {
        process.env.ENABLE_ENGLISH_BOUNDARY_PROTECTION = previous;
      }
    }
  });

  it('does not pollute __DOT_*/__BND_* style literals during round trip', () => {
    const text = 'Keep __DOT_abc__ and __BND_xyz__ literal. Dr. Smith moved to the U.S. market.';
    const protectedResult = protectEnglishBoundaries(text);

    expect(restoreProtectedTokens(protectedResult.text, protectedResult.tokens)).toBe(text);
  });
});
