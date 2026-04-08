import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'server-only': path.resolve(__dirname, 'tests/mocks/server-only.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    exclude: ['node_modules', '.next', 'socket-server', 'e2e'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.d.ts', 'tests/**'],
    },
  },
});
