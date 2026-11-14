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
    // Spec 0025: a suíte de antes do órgão roda em `observacao` até a fatia 5
    // (task 18) passar os testes de banco para `comOrgaoDeTeste`. Os testes de
    // órgão trocam o modo no próprio arquivo (`usarModo` de tests/orgao-test-env.ts).
    env: { ORGAO_ISOLAMENTO: 'observacao' },
    // O `.tsx` entra pelos testes de componente. O ambiente de DOM fica por
    // arquivo, num comentário `@vitest-environment jsdom` no topo dele, para
    // o resto da suíte continuar rodando em Node, que é mais rápido.
    include: ['**/__tests__/**/*.test.ts?(x)', '**/*.test.ts?(x)'],
    exclude: ['node_modules', '.next', 'socket-server', 'sicam-gateway', 'e2e'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.d.ts', 'tests/**'],
    },
  },
});
