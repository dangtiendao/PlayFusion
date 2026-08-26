import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@engines': path.resolve(__dirname, './packages/engines'),
      '@rating': path.resolve(__dirname, './packages/rating'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
