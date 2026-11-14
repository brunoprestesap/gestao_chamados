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

const FORA_DA_SUITE = ['node_modules', '.next', 'socket-server', 'sicam-gateway', 'e2e'];

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
    // Spec 0025 (AC-16): a suíte roda em `estrito`, o modo de desenvolvimento.
    // Os testes de órgão trocam o modo no próprio arquivo (`usarModo` de
    // tests/orgao-test-env.ts).
    env: { ORGAO_ISOLAMENTO: 'estrito' },
    // Dois projetos. Os testes de banco (`*.db.test.ts`) rodam com a sessão
    // simulada de um usuário do órgão 1 (tests/setup-db-orgao.ts): sem ela,
    // toda consulta fora de requisição cairia em `OrgaoAusenteError`. O
    // `include` e o `exclude` ficam em cada projeto porque, com `extends`, o
    // Vitest soma as listas da raiz às do projeto.
    //
    // O `.tsx` entra pelos testes de componente. O ambiente de DOM fica por
    // arquivo, num comentário `@vitest-environment jsdom` no topo dele, para
    // o resto da suíte continuar rodando em Node, que é mais rápido.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['**/__tests__/**/*.test.ts?(x)', '**/*.test.ts?(x)'],
          exclude: [...FORA_DA_SUITE, '**/*.db.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['**/*.db.test.ts'],
          exclude: FORA_DA_SUITE,
          setupFiles: ['tests/setup-db-orgao.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.d.ts', 'tests/**'],
    },
  },
});
