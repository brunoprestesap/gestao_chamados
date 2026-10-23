import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnviarSchema, SalvarRascunhoSchema } from '@/shared/material/cotacao.schemas';
import { MATERIAL_CONFIG_PADRAO } from '@/shared/material/material.constants';
import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

import {
  type EstadoDoFormulario,
  itemNovo,
  linhaPassa,
  linhasDaLista,
  montarEntrada,
  orcamentoNovo,
  prontaParaEnviar,
} from '../formulario';

const emitToRoom = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom }));
const enviarEmailCotacao = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('@/lib/email/aviso-cotacao', () => ({ enviarEmailCotacao }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

/**
 * A lista "Pronta para enviar?" contra o envio de verdade (spec 0021, AC-15):
 * o mesmo formulário vai pelo navegador (`prontaParaEnviar` e as linhas) e
 * pelo caminho do servidor (o schema das ações, `salvarRascunho` e
 * `transicionar('enviar')` no Mongo). A lista só diz "pronta" quando o envio
 * passa, e os impedimentos e as mensagens são os mesmos.
 *
 * covers: AC-15
 */

function cru(m: {
  createIndexes(): PromiseLike<unknown>;
  collection: { deleteMany(f: object): Promise<unknown>; indexes(): Promise<unknown> };
}): ModelDeTeste {
  return {
    createIndexes: () => m.createIndexes(),
    deleteMany: (f) => m.collection.deleteMany(f),
    collection: m.collection,
  };
}

const rodar = temMongoDeTeste ? describe : describe.skip;

/** A raiz que o servidor lê sem parâmetro gravado. */
const RAIZ_CONTRATADA = MATERIAL_CONFIG_PADRAO.raizCnpjContratada;

/** Um CNPJ válido com a raiz dada (8 dígitos), com máscara. */
function cnpj(raiz: string, filial = '0001'): string {
  const base = `${raiz}${filial}`.split('').map(Number);
  const dv = (nums: number[]) => {
    const pesos =
      nums.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = nums.reduce((s, d, i) => s + d * pesos[i]!, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  const d = `${raiz}${filial}${d1}${d2}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

rodar('a lista "Pronta para enviar?" contra o envio, no Mongo', () => {
  let t: typeof import('@/lib/material/transicoes');
  let M: {
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    User: typeof import('@/models/user.model').UserModel;
    Cotacao: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
    Evento: typeof import('@/models/CotacaoMaterialEvento').CotacaoMaterialEventoModel;
    Tentativa: typeof import('@/models/CotacaoMaterialTentativa').CotacaoMaterialTentativaModel;
    Arquivo: typeof import('@/models/ArquivoCotacao').ArquivoCotacaoModel;
    Designacao: typeof import('@/models/DesignacaoMaterial').DesignacaoMaterialModel;
    Config: typeof import('@/models/MaterialConfig').MaterialConfigModel;
    PauseLog: typeof import('@/models/PauseLog').PauseLogModel;
    History: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
    Notification: typeof import('@/models/Notification').NotificationModel;
  };
  let todos: ModelDeTeste[];

  const ids = { tecnico: String(new Types.ObjectId()), rt: String(new Types.ObjectId()) };
  const rt = () => ({ tipo: 'usuario' as const, userId: ids.rt, role: 'Preposto' });
  const itemBase = {
    descricao: 'Disjuntor bipolar 40 A',
    unidade: 'un',
    quantidade: 2,
    motivo: 'Troca',
  };

  beforeAll(async () => {
    t = await import('@/lib/material/transicoes');
    M = {
      Chamado: (await import('@/models/Chamado')).ChamadoModel,
      User: (await import('@/models/user.model')).UserModel,
      Cotacao: (await import('@/models/CotacaoMaterial')).CotacaoMaterialModel,
      Evento: (await import('@/models/CotacaoMaterialEvento')).CotacaoMaterialEventoModel,
      Tentativa: (await import('@/models/CotacaoMaterialTentativa')).CotacaoMaterialTentativaModel,
      Arquivo: (await import('@/models/ArquivoCotacao')).ArquivoCotacaoModel,
      Designacao: (await import('@/models/DesignacaoMaterial')).DesignacaoMaterialModel,
      Config: (await import('@/models/MaterialConfig')).MaterialConfigModel,
      PauseLog: (await import('@/models/PauseLog')).PauseLogModel,
      History: (await import('@/models/ChamadoHistory')).ChamadoHistoryModel,
      Notification: (await import('@/models/Notification')).NotificationModel,
    };
    todos = Object.values(M).map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_paridade_lista');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    await M.User.collection.insertMany(
      Object.entries(ids).map(([k, id]) => ({
        _id: new Types.ObjectId(id),
        username: k,
        name: k,
        role: k === 'rt' ? 'Preposto' : 'Técnico',
        isActive: true,
      })),
    );
    await M.Designacao.create({
      userId: new Types.ObjectId(ids.rt),
      papel: 'responsavel_tecnico',
      faixaId: null,
      vigenciaInicio: '2000-01-01',
      ato: 'Portaria',
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  /** Uma cotação nova num chamado em atendimento, com o item do diagnóstico. */
  async function criada() {
    const _id = new Types.ObjectId();
    await M.Chamado.collection.insertOne({
      _id,
      ticket_number: `CHM-T-${String(_id).slice(-6)}`,
      titulo: 'Teste',
      status: 'em atendimento',
      assignedToUserId: new Types.ObjectId(ids.tecnico),
      solicitanteId: new Types.ObjectId(),
      createdAt: new Date(),
    });
    const r = await t.criarCotacao(
      { userId: ids.tecnico },
      { chamadoId: String(_id), itens: [itemBase] },
    );
    if (!r.ok) throw new Error(r.error);
    const cot = (await M.Cotacao.findById(r.id).lean())!;
    return { id: r.id, itemId: String(cot.itens[0]!._id), versao: cot.versao };
  }

  async function arquivo(cotacaoId: string) {
    const a = await M.Arquivo.create({
      cotacaoId: new Types.ObjectId(cotacaoId),
      tipo: 'orcamento',
      nomeOriginal: 'orcamento.pdf',
      mimeType: 'application/pdf',
      tamanho: 10,
      caminho: `cotacoes/${cotacaoId}/x.pdf`,
      enviadoPorUserId: new Types.ObjectId(ids.rt),
      em: new Date(),
    });
    return String(a._id);
  }

  /**
   * O formulário como o editor o guarda: o item do diagnóstico no caminho 3,
   * com uma referência livre, e um orçamento por raiz dada.
   */
  async function formulario(
    c: { id: string; itemId: string },
    raizes: string[],
    ajustes: { validadeVazia?: boolean; semReferencia?: boolean; preco?: string } = {},
  ): Promise<EstadoDoFormulario> {
    const item = {
      ...itemNovo(c.itemId),
      descricao: itemBase.descricao,
      unidade: itemBase.unidade,
      quantidade: '2',
      motivo: itemBase.motivo,
      doDiagnostico: true,
      referencias: ajustes.semReferencia
        ? []
        : [
            {
              entrada: {
                id: String(new Types.ObjectId()),
                fonte: 'Painel de preços do governo',
                valorUnitarioCentavos: 1_000_00,
                data: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10),
              },
              gravada: null,
            },
          ],
    };
    const orcamentos = [];
    for (const [n, raiz] of raizes.entries()) {
      orcamentos.push({
        ...orcamentoNovo(String(new Types.ObjectId())),
        fornecedor: `Loja ${n + 1}`,
        cnpj: cnpj(raiz, String(n + 1).padStart(4, '0')),
        data: '2026-10-01',
        validade: ajustes.validadeVazia && n === 0 ? '' : '2099-12-31',
        arquivoId: await arquivo(c.id),
        arquivoNome: 'orcamento.pdf',
        precos: { [c.itemId]: n === 0 && ajustes.preco ? ajustes.preco : `1${n},00` },
      });
    }
    return { itens: [item], orcamentos };
  }

  /** O que o navegador diz: o resultado, as linhas e se a lista está toda pronta. */
  function doNavegador(e: EstadoDoFormulario, cotacaoId: string, justificativa?: string) {
    const urgencia = justificativa !== undefined;
    const r = prontaParaEnviar(e, { cotacaoId, raizContratada: RAIZ_CONTRATADA, urgencia });
    const linhas = linhasDaLista(e, r, urgencia, urgencia ? { cotacaoId, justificativa } : null);
    return { r, linhas, pronta: linhas.every((l) => linhaPassa(l, r)) };
  }

  /** O que o servidor diz: as duas ações, na ordem do editor (salvar, depois enviar). */
  async function doServidor(
    e: EstadoDoFormulario,
    c: { id: string; versao: number },
    justificativa?: string,
  ): Promise<{ ok: boolean; erro?: string; impedimentos?: string[] }> {
    const ps = SalvarRascunhoSchema.safeParse(montarEntrada(e, c.id, c.versao));
    if (!ps.success) return { ok: false, erro: ps.error.issues[0]!.message };
    const s = await t.salvarRascunho(rt(), ps.data);
    if (!s.ok) return { ok: false, erro: s.error };
    const pe = EnviarSchema.safeParse({
      id: c.id,
      versao: s.versao,
      ...(justificativa !== undefined ? { urgencia: { justificativa } } : {}),
    });
    if (!pe.success) return { ok: false, erro: pe.error.issues[0]!.message };
    const env = await t.transicionar({
      cotacaoId: c.id,
      acao: 'enviar',
      versao: s.versao,
      ator: rt(),
      ...(pe.data.urgencia ? { urgencia: pe.data.urgencia } : {}),
    });
    return env.ok
      ? { ok: true }
      : { ok: false, erro: env.error, impedimentos: env.impedimentos ?? [] };
  }

  /** A mesma resposta dos dois lados para o mesmo formulário. */
  async function mesmaResposta(
    ajustar: (c: { id: string; itemId: string }) => Promise<EstadoDoFormulario>,
    justificativa?: string,
  ) {
    const c = await criada();
    const e = await ajustar(c);
    const nav = doNavegador(e, c.id, justificativa);
    const srv = await doServidor(e, c, justificativa);
    expect(nav.pronta).toBe(srv.ok);
    if (srv.impedimentos) {
      expect(nav.r.ok).toBe(true);
      expect(nav.r.ok && [...nav.r.impedimentos].sort()).toEqual([...srv.impedimentos].sort());
    }
    return { nav, srv };
  }

  it('formulário completo: a lista fica pronta e o envio passa', async () => {
    const { srv } = await mesmaResposta((c) => formulario(c, ['11222333', '22333444', '33444555']));
    expect(srv.ok).toBe(true);
  });

  it('cada impedimento de orçamento é o mesmo nos dois lados', async () => {
    const casos: [string, (c: { id: string; itemId: string }) => Promise<EstadoDoFormulario>][] = [
      ['orcamentos_insuficientes', (c) => formulario(c, ['11222333', '22333444'])],
      ['cnpj_mesma_raiz', (c) => formulario(c, ['11222333', '11222333', '33444555'])],
      ['cnpj_contratada', (c) => formulario(c, [RAIZ_CONTRATADA, '22333444', '33444555'])],
      [
        'validade_ausente',
        (c) => formulario(c, ['11222333', '22333444', '33444555'], { validadeVazia: true }),
      ],
      [
        'sem_referencia',
        (c) => formulario(c, ['11222333', '22333444', '33444555'], { semReferencia: true }),
      ],
    ];
    for (const [codigo, ajustar] of casos) {
      const { nav, srv } = await mesmaResposta(ajustar);
      expect(srv.ok, codigo).toBe(false);
      expect(nav.r.ok && nav.r.impedimentos, codigo).toContain(codigo);
      // O defeito do CNPJ do orçamento já é recusado no salvar (AC-31), sem chegar ao envio.
      if (codigo === 'cnpj_contratada') expect(srv.erro).toMatch(/contratada/i);
      else expect(srv.impedimentos, codigo).toContain(codigo);
    }
  });

  it('preço inválido: a lista mostra a mesma recusa do salvar', async () => {
    const { nav, srv } = await mesmaResposta((c) =>
      formulario(c, ['11222333', '22333444', '33444555'], { preco: '-5' }),
    );
    expect(srv.ok).toBe(false);
    expect(nav.r).toEqual({ ok: false, erro: srv.erro });
  });

  it('urgência com 1 orçamento e justificativa certa: pronta e o envio passa', async () => {
    const { srv } = await mesmaResposta(
      (c) => formulario(c, ['11222333']),
      'Elevador parado com gente dependendo dele',
    );
    expect(srv.ok).toBe(true);
  });

  it('urgência com justificativa curta: a linha da lista tem a recusa do envio', async () => {
    const { nav, srv } = await mesmaResposta((c) => formulario(c, ['11222333']), 'curta');
    expect(srv.ok).toBe(false);
    expect(nav.linhas.find((l) => l.chave === 'urgencia')?.erro).toBe(srv.erro);
  });
});
