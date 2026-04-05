// @vitest-environment node
import {describe, expect, it} from 'vitest';
import vitestConfig from './vitest.config';

describe('frontend config paths', () => {
  it('uses the frontend test setup entry', () => {
    expect(vitestConfig.test?.setupFiles).toEqual(['./frontend/src/test/setup.ts']);
  });
});
