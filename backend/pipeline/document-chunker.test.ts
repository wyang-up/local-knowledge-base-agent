// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { __test__, chunkDocument, qualityCheckChunks } from './document-chunker.ts';
import type { CleanedDocument } from './document-cleaner.ts';

const { splitSentencesForTest } = __test__;

function buildChunkedCleanedDocument(overrides: Partial<CleanedDocument> = {}): CleanedDocument {
  return {
    fileType: 'pdf',
    fileName: 'sample.pdf',
    text: '默认文本。',
    cleaningApplied: ['collapse_blank_lines'],
    structure: [],
    ...overrides,
  };
}

describe('document-chunker', () => {
  it('keeps short txt as one chunk when <= 400 tokens', () => {
    const cleaned: CleanedDocument = {
      fileType: 'txt',
      fileName: 'short.txt',
      text: '短文本保留',
      cleaningApplied: [],
      structure: [],
    };

    const chunks = chunkDocument(cleaned);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.sourceUnit).toBe('body');
  });

  it('splits pdf by heading and sentence boundaries', () => {
    const cleaned: CleanedDocument = {
      fileType: 'pdf',
      fileName: 'book.pdf',
      text: '第一章。第一段。第二段。第二章。第三段。',
      cleaningApplied: ['remove_header'],
      structure: [{ label: '第一章', level: 1 }, { label: '第二章', level: 1 }],
    };

    const chunks = chunkDocument(cleaned);

    expect(chunks[0]?.sourceUnit).toBe('heading');
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('marks filtered empty chunks with qualityStatus filtered', () => {
    const filtered = qualityCheckChunks([
      { sourceUnit: 'body', sourceLabel: null, content: '   ', tokenCount: 0, qualityStatus: 'passed' },
    ]);

    expect(filtered[0]?.qualityStatus).toBe('filtered');
  });

  it('caps oversized pdf chunk explosion by merging adjacent short segments', () => {
    const cleaned: CleanedDocument = {
      fileType: 'pdf',
      fileName: 'huge.pdf',
      text: Array.from({ length: 300 }, (_, index) => `段落${index + 1}`).join('。') + '。',
      cleaningApplied: [],
      structure: [{ label: '第一章', level: 1 }],
    };

    const chunks = chunkDocument(cleaned);

    expect(chunks.length).toBeLessThan(80);
  });

  it('splits english pdf content by english sentence and paragraph boundaries', () => {
    const cleaned = buildChunkedCleanedDocument({
      fileType: 'pdf',
      fileName: 'english.pdf',
      text: 'Chapter 1\n\nThis is the first sentence. This is the second sentence.\n\nChapter 2\n\nAnother paragraph starts here. It continues.',
    });

    const chunks = chunkDocument(cleaned);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((chunk) => chunk.content.includes('Another paragraph'))).toBe(true);
  });

  it('splits mixed-language pdf content without collapsing english and chinese sections into one block', () => {
    const cleaned = buildChunkedCleanedDocument({
      fileType: 'pdf',
      fileName: 'mixed.pdf',
      text: '第一章\n\n中文第一句。English sentence one. English sentence two.\n\n第二章\n\n这是第二段。Another paragraph follows.',
      structure: [{ label: '第一章', level: 1 }, { label: '第二章', level: 1 }],
    });

    const chunks = chunkDocument(cleaned);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((chunk) => chunk.content.includes('English sentence one'))).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes('这是第二段'))).toBe(true);
  });

  it('splits bilingual docx content by bilingual sentence boundaries', () => {
    const cleaned = buildChunkedCleanedDocument({
      fileType: 'docx',
      fileName: 'bilingual.docx',
      text: 'Overview\n\nThis document starts in English. It keeps going.\n\n第二节\n\n这里切换到中文。Still contains English afterwards.',
      structure: [{ label: 'Overview', level: 1 }, { label: '第二节', level: 1 }],
    });

    const chunks = chunkDocument(cleaned);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((chunk) => chunk.content.includes('这里切换到中文'))).toBe(true);
  });

  it('does not merge short segments when document does not hit merge thresholds', () => {
    const cleaned = buildChunkedCleanedDocument({
      fileType: 'pdf',
      fileName: 'small-english.pdf',
      text: 'Intro\n\nOne short line.\n\nTwo short line.\n\nThree short line.',
      structure: [{ label: 'Intro', level: 1 }],
    });

    const chunks = chunkDocument(cleaned);

    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.some((chunk) => chunk.qualityStatus === 'merged')).toBe(false);
  });

  it('marks merged chunks when chunk explosion threshold is reached', () => {
    const cleaned = buildChunkedCleanedDocument({
      fileType: 'pdf',
      fileName: 'tiny-lines.pdf',
      text: Array.from({ length: 240 }, (_, index) => `Line ${index + 1}.`).join(' '),
      structure: [{ label: 'Overview', level: 1 }],
    });

    const chunks = chunkDocument(cleaned);

    expect(chunks.length).toBeLessThan(120);
    expect(chunks.some((chunk) => chunk.qualityStatus === 'merged')).toBe(true);
  });

  it('marks oversized english segments as split with heading metadata preserved', () => {
    const cleaned = buildChunkedCleanedDocument({
      fileType: 'pdf',
      fileName: 'oversized.pdf',
      text: `Chapter 9\n\n${Array.from({ length: 120 }, () => 'This is a long english sentence that should be split safely.').join(' ')}`,
      structure: [{ label: 'Chapter 9', level: 1 }],
    });

    const chunks = chunkDocument(cleaned);

    expect(chunks.some((chunk) => chunk.qualityStatus === 'split')).toBe(true);
    expect(chunks.some((chunk) => chunk.sourceLabel === 'Chapter 9')).toBe(true);
    expect(chunks.every((chunk) => chunk.tokenCount > 0)).toBe(true);
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
});
