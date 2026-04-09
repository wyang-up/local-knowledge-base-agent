import {describe, expect, it} from 'vitest';
import {normalizeSourceHighlightTarget} from './source-highlight-target';

describe('normalizeSourceHighlightTarget', () => {
  it('keeps common chunk fields and structured location fields', () => {
    expect(normalizeSourceHighlightTarget({
      docId: 'doc-1',
      chunkId: 'chunk-2',
      chunkIndex: 1,
      content: '目标片段',
      pageStart: 3,
      pageEnd: 4,
      textOffsetStart: 120,
      textOffsetEnd: 240,
    })).toEqual(expect.objectContaining({
      docId: 'doc-1',
      chunkId: 'chunk-2',
      chunkIndex: 1,
      pageStart: 3,
      pageEnd: 4,
      textOffsetStart: 120,
      textOffsetEnd: 240,
    }));
  });

  it('drops invalid numeric fields but preserves text fallback content', () => {
    expect(normalizeSourceHighlightTarget({
      content: '回退片段',
      pageStart: -1,
      rowStart: Number.NaN,
    })).toEqual(expect.objectContaining({
      content: '回退片段',
      pageStart: undefined,
      rowStart: undefined,
    }));
  });

  it('returns null when all identity and content fields are empty', () => {
    expect(normalizeSourceHighlightTarget({pageStart: 2})).toBeNull();
  });
});
