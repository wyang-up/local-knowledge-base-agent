import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';

describe('frontend entry paths', () => {
  it('loads the app entry from the pages directory', () => {
    const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    expect(html).toContain('/src/pages/app/main.tsx');
  });
});
