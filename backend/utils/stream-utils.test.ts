// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { parseOpenAIStreamBuffer } from './stream-utils.ts';

describe('stream-utils', () => {
  it('parses stream deltas and done marker', () => {
    const raw = [
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"好"}}]}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n');

    const parsed = parseOpenAIStreamBuffer(raw);

    expect(parsed.deltas).toEqual(['你', '好']);
    expect(parsed.done).toBe(true);
    expect(parsed.rest).toBe('');
  });

  it('keeps trailing partial event in rest buffer', () => {
    const raw = 'data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: {"choices"';
    const parsed = parseOpenAIStreamBuffer(raw);

    expect(parsed.deltas).toEqual(['A']);
    expect(parsed.rest).toBe('data: {"choices"');
  });
});
