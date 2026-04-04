import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {fileURLToPath} from 'url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(configDir, '..');
const projectRoot = path.resolve(frontendRoot, '..');
const frontendSrcRoot = path.resolve(frontendRoot, 'src');

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, projectRoot, '');
  return {
    root: frontendRoot,
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': frontendSrcRoot,
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      hmr: process.env.VITE_HMR === 'false' ? false : undefined,
      watch: {
        usePolling: true,
        interval: 150,
      },
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  };
});
