import {describe, expect, it} from 'vitest';
import {resolvePhase1PreviewOptions} from './phase1-preview-options';

describe('resolvePhase1PreviewOptions', () => {
  it('returns empty options for undefined and null inputs', () => {
    expect(resolvePhase1PreviewOptions(undefined)).toEqual({});
    expect(resolvePhase1PreviewOptions(null)).toEqual({});
  });

  it('strips all position-related options in phase1 mode', () => {
    const input = {
      chunkId: 'chunk-1',
      page: 8,
      keyword: 'react',
      sheetName: 'Sheet1',
      jsonPath: '$.items[0]',
    };

    const resolved = resolvePhase1PreviewOptions(input);
    expect(resolved).toEqual({});
    expect(resolved).not.toBe(input);
  });
});
