import { defineConfig } from 'vitest/config';
import path from 'path';
import {fileURLToPath} from 'url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(configDir, '..');

export default defineConfig({
  root: path.resolve(frontendRoot, '..'),
  test: {
    environment: 'jsdom',
    setupFiles: ['./frontend/src/test/setup.ts'],
    globals: true,
    pool: 'threads',
    exclude: ['**/.worktrees/**'],
  },
});
