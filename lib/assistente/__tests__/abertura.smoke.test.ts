import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/LlmCall', () => ({ LlmCallModel: { create: vi.fn().mockResolvedValue({}) } }));

import { streamLlmObject } from '@/lib/llm';
import { resetLlmConfig } from '@/lib/llm/config';

import { ABERTURA_TASK, montarSistema, PROMPT_VERSION } from '../prompt';
import { type RespostaAbertura, respostaAberturaSchema } from '../schema';

/**
 * Teste de fumaça da abertura contra o vLLM REAL (spec 0004, AC-19). Só roda
 * com LLM_SMOKE=1:
 *
 *   LLM_SMOKE=1 npx vitest run lib/assistente/__tests__/abertura.smoke.test.ts
 *
 * Lê LLM_BASE_URL, LLM_API_KEY e LLM_MODEL do ambiente ou do `.env.local`. São
 * 11 chamadas na raia interativa, com o prompt de verdade e o catálogo do seed
 * (`scripts/seed.js`): 10 relatos fictícios com resposta clara no catálogo e um
 * fora de manutenção. Rode fora do horário de pico da GPU compartilhada, e de
 * novo a cada mudança de `PROMPT_VERSION`, de modelo ou do catálogo do seed.
 */

const SMOKE = process.env.LLM_SMOKE === '1';

/** `userId` fictício da raia interativa, abaixo do limite por usuário. */
const SMOKE_USER_ID = '000000000000000000000004';

/** O catálogo do seed, na mesma forma de linha que `lerCatalogoParaPrompt` monta. */
const CATALOGO_DO_SEED = [
  ['CIVL-0001', 'Pintura de ambiente', 'Civil', 'Manutenção Predial', 'Pintura de paredes e tetos'],
  [
    'CIVL-0002',
    'Reparo em alvenaria',
    'Civil',
    'Manutenção Predial',
    'Correção de trincas, buracos e danos em paredes',
  ],
  [
    'CIVL-0003',
    'Reparo de piso',
    'Civil',
    'Manutenção Predial',
    'Substituição ou reparo de pisos danificados',
  ],
  [
    'CLIM-0001',
    'Manutenção preventiva de ar-condicionado',
    'Manutenção Preventiva',
    'Ar-Condicionado',
    'Limpeza de filtros, verificação de gás e funcionamento geral',
  ],
  [
    'CLIM-0002',
    'Reparo de ar-condicionado',
    'Manutenção Corretiva',
    'Ar-Condicionado',
    'Conserto de equipamento com defeito',
  ],
  [
    'CLIM-0003',
    'Instalação de ar-condicionado',
    'Instalação',
    'Ar-Condicionado',
    'Instalação de novo equipamento de climatização',
  ],
  [
    'ELET-0001',
    'Troca de lâmpada',
    'Elétrica',
    'Manutenção Predial',
    'Substituição de lâmpadas queimadas ou com defeito',
  ],
  [
    'ELET-0002',
    'Reparo de tomada',
    'Elétrica',
    'Manutenção Predial',
    'Conserto ou substituição de tomada elétrica',
  ],
  [
    'ELET-0003',
    'Reparo em quadro elétrico',
    'Elétrica',
    'Manutenção Predial',
    'Manutenção de disjuntores e quadro de distribuição',
  ],
  [
    'ELEV-0001',
    'Inspeção geral do elevador',
    'Manutenção Preventiva',
    'Elevador',
    'Verificação de cabos, polias, freios e sistema de segurança',
  ],
  [
    'ELEV-0002',
    'Lubrificação de guias e componentes',
    'Manutenção Preventiva',
    'Elevador',
    'Lubrificação periódica das guias, trilhos e partes móveis',
  ],
  [
    'ELEV-0003',
    'Verificação do sistema de segurança',
    'Manutenção Preventiva',
    'Elevador',
    'Teste de freios de emergência, limitador de velocidade e para-quedas',
  ],
  [
    'ELEV-0004',
    'Reparo de porta do elevador',
    'Manutenção Corretiva',
    'Elevador',
    'Conserto de portas que não abrem, fecham ou travam',
  ],
  [
    'ELEV-0005',
    'Reparo do sistema de tração',
    'Manutenção Corretiva',
    'Elevador',
    'Correção de falhas no motor, cabos de aço ou polias',
  ],
  [
    'ELEV-0006',
    'Reparo do painel de comando',
    'Manutenção Corretiva',
    'Elevador',
    'Substituição ou reparo de botões, display e placa eletrônica',
  ],
  [
    'ELEV-0007',
    'Elevador parado / preso entre andares',
    'Manutenção Corretiva',
    'Elevador',
    'Atendimento emergencial para elevador travado com ou sem passageiros',
  ],
  [
    'ELEV-0008',
    'Nivelamento irregular de cabine',
    'Manutenção Corretiva',
    'Elevador',
    'Correção de desnivelamento entre cabine e andar',
  ],
  [
    'ELEV-0009',
    'Modernização de painel de comando',
    'Modernização',
    'Elevador',
    'Substituição do quadro de comando por tecnologia atualizada',
  ],
  [
    'ELEV-0010',
    'Substituição de cabos de aço',
    'Modernização',
    'Elevador',
    'Troca completa dos cabos de tração do elevador',
  ],
  [
    'ELEV-0011',
    'Instalação de novo elevador',
    'Instalação e Montagem',
    'Elevador',
    'Montagem e instalação completa de elevador novo',
  ],
  [
    'HIDR-0001',
    'Reparo de vazamento',
    'Hidráulica',
    'Manutenção Predial',
    'Identificação e correção de vazamentos',
  ],
  [
    'HIDR-0002',
    'Desentupimento de ralo/vaso',
    'Hidráulica',
    'Manutenção Predial',
    'Desobstrução de ralos, vasos sanitários e tubulações',
  ],
  [
    'HIDR-0003',
    'Troca de torneira',
    'Hidráulica',
    'Manutenção Predial',
    'Substituição de torneira com defeito',
  ],
  [
    'INFR-0001',
    'Reparo de ponto de rede',
    'TI e Infraestrutura',
    'Manutenção Predial',
    'Conectorização e teste de ponto de rede',
  ],
  [
    'INFR-0002',
    'Remanejamento de equipamento',
    'TI e Infraestrutura',
    'Manutenção Predial',
    'Realocação de computadores, impressoras e periféricos',
  ],
  [
    'MARC-0001',
    'Reparo de mobiliário',
    'Marcenaria',
    'Manutenção Predial',
    'Conserto de mesas, cadeiras, armários e estantes',
  ],
  [
    'MARC-0002',
    'Confecção de móvel sob medida',
    'Marcenaria',
    'Manutenção Predial',
    'Fabricação de móvel personalizado',
  ],
]
  .map((colunas) => colunas.join(' | '))
  .join('\n');

/** Relatos fictícios, cada um com resposta clara num serviço do seed. */
const RELATOS: { texto: string; codigo: string }[] = [
  { texto: 'A lâmpada da sala 204 queimou e a sala está escura.', codigo: 'ELET-0001' },
  {
    texto: 'A tomada ao lado da minha mesa, na sala 12, está solta e não funciona.',
    codigo: 'ELET-0002',
  },
  { texto: 'A torneira da copa do térreo quebrou e precisa ser trocada.', codigo: 'HIDR-0003' },
  {
    texto: 'O vaso sanitário do banheiro feminino do 3º andar está entupido.',
    codigo: 'HIDR-0002',
  },
  {
    texto: 'A parede da sala de audiências está com uma trinca grande e um buraco perto da porta.',
    codigo: 'CIVL-0002',
  },
  {
    texto: 'A cadeira da minha estação de trabalho na secretaria quebrou o encosto.',
    codigo: 'MARC-0001',
  },
  {
    texto:
      'O ponto de rede da minha mesa na sala 105 não funciona, o cabo está ligado e não tem sinal.',
    codigo: 'INFR-0001',
  },
  {
    texto: 'O ar-condicionado da sala 302 parou de gelar e está fazendo um barulho estranho.',
    codigo: 'CLIM-0002',
  },
  {
    texto: 'Tem uma pessoa presa no elevador social entre o 2º e o 3º andar.',
    codigo: 'ELEV-0007',
  },
  {
    texto: 'A porta do elevador de serviço não fecha, fica abrindo e fechando sem parar.',
    codigo: 'ELEV-0004',
  },
];

const FORA_DE_MANUTENCAO =
  'Qual é o horário do protocolo e como eu emito uma certidão de distribuição?';

const PERFIL = { unidade: { unitId: 'u', nome: 'Diretoria do Foro', andar: 'Térreo' } };

async function perguntar(
  texto: string,
): Promise<
  | { ok: true; data: RespostaAbertura; latencyMs: number; finishReason: string }
  | { ok: false; reason: string }
> {
  const inicio = Date.now();
  const stream = await streamLlmObject({
    task: ABERTURA_TASK,
    promptVersion: PROMPT_VERSION,
    schema: respostaAberturaSchema,
    system: montarSistema({ catalogo: CATALOGO_DO_SEED, perfil: PERFIL, proposta: null }),
    messages: [{ role: 'user', content: texto }],
    lane: 'interactive',
    userId: SMOKE_USER_ID,
    ref: { type: 'smoke', id: 'abertura' },
  });
  if (!stream.ok) return { ok: false, reason: stream.reason };
  // O parcial só existe para a tela; aqui vale o objeto final.
  for await (const parcial of stream.partial) void parcial;
  const final = await stream.final;
  if (!final.ok) return { ok: false, reason: final.reason };

  // O `finishReason` fica no registro `LlmCall`, que aqui é mock.
  const { LlmCallModel } = await import('@/models/LlmCall');
  const registro = vi.mocked(LlmCallModel.create).mock.calls.at(-1)?.[0] as
    | { finishReason?: string }
    | undefined;

  return {
    ok: true,
    data: final.data,
    latencyMs: Date.now() - inicio,
    finishReason: registro?.finishReason ?? 'desconhecido',
  };
}

describe.skipIf(!SMOKE)('abertura do chamado contra o vLLM real (AC-19)', () => {
  beforeAll(() => {
    if (!process.env.LLM_BASE_URL && existsSync('.env.local')) loadEnvFile('.env.local');
    resetLlmConfig();
  });

  it('acerta o código em pelo menos 8 dos 10 relatos do catálogo do seed', async () => {
    // Arrange
    let acertos = 0;

    // Act
    for (const relato of RELATOS) {
      const r = await perguntar(relato.texto);
      if (!r.ok) {
        console.warn(`[smoke] ${relato.codigo} falhou: ${r.reason}`);
        continue;
      }
      const acertou = r.data.servicoCodigo === relato.codigo;
      if (acertou) acertos += 1;
      console.warn(
        `[smoke] esperado ${relato.codigo} · veio ${r.data.servicoCodigo ?? 'null'} · ${acertou ? 'acerto' : 'erro'} · completo ${r.data.completo} · local ${r.data.localExato ? 'sim' : 'não'} · ${r.latencyMs}ms · ${r.finishReason}`,
      );
    }
    console.warn(`[smoke] acertos: ${acertos} de ${RELATOS.length}`);

    // Assert
    expect(acertos).toBeGreaterThanOrEqual(8);
  }, 300_000);

  it('fora de manutenção devolve código nulo e completo falso', async () => {
    // Act
    const r = await perguntar(FORA_DE_MANUTENCAO);

    // Assert
    if (!r.ok) throw new Error(`falhou: ${r.reason}`);
    console.warn(
      `[smoke] fora de manutenção · código ${r.data.servicoCodigo ?? 'null'} · completo ${r.data.completo} · ${r.latencyMs}ms · ${r.finishReason}`,
    );
    expect(r.data.servicoCodigo).toBeNull();
    expect(r.data.completo).toBe(false);
  }, 120_000);
});
