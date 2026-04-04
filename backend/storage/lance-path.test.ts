// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveLancePath } from './lance-path.ts';

describe('resolveLancePath', () => {
  it('keeps non-mount paths unchanged', () => {
    expect(resolveLancePath('/tmp/kb/lance', '/tmp/fallback')).toBe('/tmp/kb/lance');
  });

  it('falls back when path is under /mnt', () => {
    expect(resolveLancePath('/mnt/e/project/data/lance', '/tmp/fallback')).toBe('/tmp/fallback');
  });
});
