import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { ESLint } from 'eslint';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/LlmCall', () => ({ LlmCallModel: { create: vi.fn().mockResolvedValue({}) } }));

const sdkCalls = vi.hoisted(() => ({ models: [] as unknown[] }));
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(async (options: { model: unknown }) => {
      sdkCalls.models.push(options.model);
      return { output: { ok: true }, text: '{"ok":true}', totalUsage: {} };
    }),
  };
});

import { generateLlmObject, type LlmTaskInput } from '@/lib/llm';
import type { ModelCallArgs } from '@/lib/llm/model-call';
import { getLlmModel, LLM_PROVIDER_NAME } from '@/lib/llm/provider';

import { restoreLlmDefaults, TEST_API_KEY, TEST_MODEL, useStubEnv } from './llm-test-env';

/** Guarda do caminho único até o modelo (spec 0001, AC-11, AC-13). */

const ROOT = path.resolve(__dirname, '../../..');
const LLM_DIR = path.join(ROOT, 'lib/llm');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('guarda de lib/llm', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    sdkCalls.models.length = 0;
    useStubEnv('http://10.0.0.5:8000/v1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreLlmDefaults();
  });

  it('o único ponto que chama o AI SDK usa a instância do provedor vllm, nunca um id em texto', async () => {
    await generateLlmObject({
      task: 'teste.guarda',
      promptVersion: 'v1',
      schema: z.object({ ok: z.boolean() }),
      system: 's',
      messages: [{ role: 'user', content: 'x' }],
      userId: '507f1f77bcf86cd799439011',
    });

    expect(sdkCalls.models).toHaveLength(1);
    const [model] = sdkCalls.models as { provider: string; modelId: string }[];
    expect(typeof model).toBe('object');
    expect(model).toBe(getLlmModel());
    expect(model.provider).toBe(`${LLM_PROVIDER_NAME}.chat`);
    expect(model.modelId).toBe(TEST_MODEL);
  });

  it('nenhuma entrada aceita modelo como parâmetro', () => {
    expectTypeOf<LlmTaskInput<unknown>>().not.toHaveProperty('model');
    expectTypeOf<ModelCallArgs<unknown>>().not.toHaveProperty('model');
  });

  it('só model-call.ts chama generateText ou streamText dentro de lib/llm', () => {
    const callers = sourceFiles(LLM_DIR).filter((file) =>
      /\b(generateText|streamText|generateObject|streamObject)\s*\(/.test(
        readFileSync(file, 'utf8'),
      ),
    );

    expect(callers.map((file) => path.relative(ROOT, file).replace(/\\/g, '/'))).toEqual([
      'lib/llm/model-call.ts',
    ]);
  });

  it("todo arquivo de lib/llm importa 'server-only' e não existe variável NEXT_PUBLIC_LLM_*", () => {
    for (const file of sourceFiles(LLM_DIR)) {
      expect(readFileSync(file, 'utf8'), path.basename(file)).toMatch(/^import 'server-only';/m);
    }
    // `.env.production.example` e o `docker-compose.yml` são versionados; o `.env.example`
    // está no .gitignore e só existe na máquina de quem desenvolve.
    const configFiles = ['.env.production.example', 'docker-compose.yml', '.env.example']
      .map((name) => path.join(ROOT, name))
      .filter((file, index) => index < 2 || existsSync(file));
    for (const file of configFiles) {
      const content = readFileSync(file, 'utf8');
      expect(content, path.basename(file)).toMatch(/LLM_BASE_URL/);
      expect(content, path.basename(file)).not.toMatch(/NEXT_PUBLIC_LLM_\w*\s*[=:]/);
    }
    expect(
      sourceFiles(LLM_DIR).some((f) => readFileSync(f, 'utf8').includes('NEXT_PUBLIC_LLM')),
    ).toBe(false);
    expect(TEST_API_KEY).toBeTruthy();
  });

  describe('regra do ESLint', () => {
    const eslint = new ESLint({ cwd: ROOT });
    const code = "import { streamText } from 'ai';\n\nexport const chamar = streamText;\n";

    async function restrictedImportMessages(filePath: string, source = code) {
      const [result] = await eslint.lintText(source, { filePath: path.join(ROOT, filePath) });
      return result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
    }

    it('barra importar streamText de ai fora de lib/llm', async () => {
      const messages = await restrictedImportMessages('app/api/exemplo/route.ts');

      expect(messages).toHaveLength(1);
      expect(messages[0].severity).toBe(2);
      expect(messages[0].message).toContain('lib/llm');
    }, 60_000);

    it.each(['generateText', 'generateObject', 'streamObject'])(
      'barra importar %s de ai fora de lib/llm',
      async (name) => {
        const source = `import { ${name} } from 'ai';\n\nexport const chamar = ${name};\n`;

        expect(await restrictedImportMessages('components/exemplo.tsx', source)).toHaveLength(1);
      },
      60_000,
    );

    it('permite dentro de lib/llm e permite tipos e utilitários de ai fora dele', async () => {
      expect(await restrictedImportMessages('lib/llm/model-call.ts')).toHaveLength(0);
      const types =
        "import { type DeepPartial, Output } from 'ai';\n\nexport type X = DeepPartial<{ a: 1 }>;\nexport const o = Output;\n";
      expect(await restrictedImportMessages('app/api/exemplo/route.ts', types)).toHaveLength(0);
    }, 60_000);
  });
});
