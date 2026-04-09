import path from 'path';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Plugin que remove as diretivas 'use server' e 'use client' dos módulos
 * durante os testes, permitindo que Server Actions sejam importadas
 * diretamente no ambiente de teste (Node.js) sem o runtime do Next.js.
 */
function removeNextDirectives(): Plugin {
  return {
    name: 'remove-next-directives',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (id.includes('node_modules')) return null;
      return code
        .replace(/^'use server';\n?/m, '')
        .replace(/^"use server";\n?/m, '')
        .replace(/^'use client';\n?/m, '')
        .replace(/^"use client";\n?/m, '');
    },
  };
}

export default defineConfig({
  plugins: [removeNextDirectives()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'server-only': path.resolve(__dirname, 'tests/mocks/server-only.ts'),
      'next/cache': path.resolve(__dirname, 'tests/mocks/next-cache.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    pool: 'vmForks',
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    exclude: ['node_modules', '.next', 'socket-server', 'e2e'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.d.ts', 'tests/**'],
    },
  },
});
