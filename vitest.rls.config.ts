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
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/rls/**/*.rls.test.ts'],
    // Chạy tuần tự để tránh xung đột dữ liệu test giữa các suite
    fileParallelism: false,
    maxWorkers: 1,
    // Test quyền không retry, fail là fail thật
    retry: 0,
    // Timeout 15s phù hợp cho network request tới Supabase
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
