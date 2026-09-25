import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * `atribuicaoAutomatica` e o motivo nunca chegam a solicitante nem a técnico
 * (spec 0008, AC-16): nem em `/api/meus-chamados`, nem na leitura de
 * `/conversas`, nem em `chamados-atribuidos`, nem no histórico. Só a gestão lê.
 *
 * O campo é gravado com valores que só aparecem se vazarem (um técnico escolhido
 * diferente do técnico de hoje, e um motivo com texto próprio), e cada
 * superfície é lida de verdade contra o Mongo. O controle positivo, a lista da
 * gestão, prova que o dado estava ali para vazar.
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 *
 * covers: AC-15 (controle positivo da gestão), AC-16
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

const mockSession = vi.fn();
vi.mock('@/lib/dal', () => ({
  verifySession: () => mockSession(),
  requireManager: () => mockSession(),
}));

const mockEmitToRoom = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: (...a: unknown[]) => mockEmitToRoom(...a) }));

type Modulos = {
  meusChamados: typeof import('@/app/api/meus-chamados/route');
  meusChamadosId: typeof import('@/app/api/meus-chamados/[id]/route');
  atribuidos: typeof import('@/app/api/chamados-atribuidos/route');
  atribuidosId: typeof import('@/app/api/chamados-atribuidos/[id]/route');
  historico: typeof import('@/app/api/chamados/[id]/history/route');
  gestao: typeof import('@/app/api/gestao/chamados/route');
  leitura: typeof import('@/app/(dashboard)/conversas/_lib/leitura');
  lateral: typeof import('@/app/(dashboard)/conversas/_lib/lateral');
  ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  DecisaoIaModel: typeof import('@/models/DecisaoIa').DecisaoIaModel;
  UserModel: typeof import('@/models/user.model').UserModel;
  UnitModel: typeof import('@/models/unit').UnitModel;
};

rodar('atribuicaoAutomatica nunca vaza para solicitante nem técnico, contra o Mongo', () => {
  let m: Modulos;
  let todos: ModelDeTeste[];

  const solicitanteId = new Types.ObjectId();
  const tecnicoHojeId = new Types.ObjectId();
  const tecnicoEscolhidoId = new Types.ObjectId();
  const prepostoId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const subtypeId = new Types.ObjectId();

  /** Textos e ids que só aparecem na resposta se o campo vazar. */
  const MOTIVO_DA_DECISAO = 'Menor carga entre 3 técnicos elegíveis: 1 de 5 chamados ativos.';
  const ROTULOS_DE_MOTIVO = [
    'nenhum técnico ativo com a especialidade',
    'todos os técnicos no limite de carga',
    'falha na atribuição automática',
  ];

  let chamadoAtribuido: string;
  let chamadoSemTecnico: string;

  const solicitante = { userId: String(solicitanteId), role: 'Solicitante' as const };
  const tecnico = { userId: String(tecnicoHojeId), role: 'Técnico' as const };
  const preposto = { userId: String(prepostoId), role: 'Preposto' as const };

  function ctx(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  async function texto(res: Response): Promise<string> {
    return JSON.stringify(await res.json());
  }

  /** O que nenhuma superfície de solicitante ou técnico pode conter. */
  function expectSemVazamento(conteudo: string, origem: string) {
    expect(conteudo, `${origem}: chave do campo`).not.toContain('atribuicaoAutomatica');
    expect(conteudo, `${origem}: motivo gravado`).not.toContain('sem_especialidade');
    expect(conteudo, `${origem}: motivo gravado`).not.toContain('sem_vaga');
    expect(conteudo, `${origem}: técnico escolhido pela regra`).not.toContain(
      String(tecnicoEscolhidoId),
    );
    expect(conteudo, `${origem}: motivo da decisão`).not.toContain(MOTIVO_DA_DECISAO);
    for (const rotulo of ROTULOS_DE_MOTIVO) {
      expect(conteudo, `${origem}: ${rotulo}`).not.toContain(rotulo);
    }
  }

  beforeAll(async () => {
    m = {
      meusChamados: await import('@/app/api/meus-chamados/route'),
      meusChamadosId: await import('@/app/api/meus-chamados/[id]/route'),
      atribuidos: await import('@/app/api/chamados-atribuidos/route'),
      atribuidosId: await import('@/app/api/chamados-atribuidos/[id]/route'),
      historico: await import('@/app/api/chamados/[id]/history/route'),
      gestao: await import('@/app/api/gestao/chamados/route'),
      leitura: await import('@/app/(dashboard)/conversas/_lib/leitura'),
      lateral: await import('@/app/(dashboard)/conversas/_lib/lateral'),
      ChamadoModel: (await import('@/models/Chamado')).ChamadoModel,
      ChamadoHistoryModel: (await import('@/models/ChamadoHistory')).ChamadoHistoryModel,
      DecisaoIaModel: (await import('@/models/DecisaoIa')).DecisaoIaModel,
      UserModel: (await import('@/models/user.model')).UserModel,
      UnitModel: (await import('@/models/unit')).UnitModel,
    };
    todos = [
      m.ChamadoModel,
      m.ChamadoHistoryModel,
      m.DecisaoIaModel,
      m.UserModel,
      m.UnitModel,
    ] as unknown as ModelDeTeste[];
    await conectarMongoDeTeste(todos, 'severino_test_atribuicao_visibilidade');
  }, 60_000);

  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSession.mockReset();

    await m.UnitModel.create({ _id: unitId, name: 'Fórum Central', floor: '3º andar' } as never);
    await m.UserModel.create([
      { _id: solicitanteId, name: 'Maria', username: 'maria', role: 'Solicitante', unitId },
      {
        _id: tecnicoHojeId,
        name: 'Diego',
        username: 'diego',
        role: 'Técnico',
        specialties: [subtypeId],
      },
      {
        _id: tecnicoEscolhidoId,
        name: 'Carla',
        username: 'carla',
        role: 'Técnico',
        specialties: [subtypeId],
      },
      { _id: prepostoId, name: 'Paulo', username: 'paulo', role: 'Preposto' },
    ] as never);

    const base = {
      titulo: 'Troca de lâmpada — Sala 302',
      descricao: 'A lâmpada da sala 302 queimou.',
      solicitanteId,
      unitId,
      localExato: 'Sala 302',
      tipoServico: 'Manutenção Predial',
      canalAbertura: 'chat',
      finalPriority: 'NORMAL',
      iaSituacao: 'decidida',
    };
    // A regra escolheu a Carla, e o Preposto reatribuiu ao Diego: o campo guarda a escolha original.
    const atribuido = await m.ChamadoModel.create({
      ...base,
      ticket_number: '2026-0001',
      status: 'em atendimento',
      assignedToUserId: tecnicoHojeId,
      assignedAt: new Date(),
      atribuicaoAutomatica: {
        resultado: 'atribuido',
        motivo: null,
        tecnicoId: tecnicoEscolhidoId,
        em: new Date(),
      },
    } as never);
    const semTecnico = await m.ChamadoModel.create({
      ...base,
      ticket_number: '2026-0002',
      status: 'validado',
      atribuicaoAutomatica: {
        resultado: 'sem_tecnico',
        motivo: 'sem_especialidade',
        tecnicoId: null,
        em: new Date(),
      },
    } as never);
    chamadoAtribuido = String(atribuido._id);
    chamadoSemTecnico = String(semTecnico._id);

    await m.DecisaoIaModel.create({
      chamadoId: atribuido._id,
      campo: 'tecnico',
      decididoPor: 'regra',
      efeito: 'aplicado',
      valorIa: { tecnicoId: tecnicoEscolhidoId, rotulo: 'Carla' },
      valorFinal: { tecnicoId: tecnicoEscolhidoId, rotulo: 'Carla' },
      confianca: null,
      motivo: MOTIVO_DA_DECISAO,
    } as never);
    await m.ChamadoHistoryModel.create({
      chamadoId: atribuido._id,
      userId: null,
      actorType: 'sistema',
      action: 'atribuicao_tecnico',
      statusAnterior: 'validado',
      statusNovo: 'em atendimento',
      observacoes: 'Atribuído automaticamente a Carla',
    } as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  // ── controle positivo · AC-15 ────────────────────────────────────

  it('a lista da gestão traz o campo, o que prova que havia o que vazar (AC-15)', async () => {
    // Arrange
    mockSession.mockResolvedValue(preposto);

    // Act
    const res = await m.gestao.GET(new Request('http://localhost/api/gestao/chamados'));
    const corpo = (await res.json()) as {
      items: { _id: string; atribuicaoAutomatica: Record<string, unknown> | null }[];
    };

    // Assert
    const atribuido = corpo.items.find((i) => i._id === chamadoAtribuido);
    const semTecnico = corpo.items.find((i) => i._id === chamadoSemTecnico);
    expect(atribuido?.atribuicaoAutomatica).toMatchObject({
      resultado: 'atribuido',
      tecnicoNome: 'Carla',
    });
    expect(semTecnico?.atribuicaoAutomatica).toMatchObject({
      resultado: 'sem_tecnico',
      motivo: 'sem_especialidade',
    });
  });

  // ── solicitante · AC-16 ──────────────────────────────────────────

  describe('solicitante', () => {
    beforeEach(() => mockSession.mockResolvedValue(solicitante));

    it('lista de /api/meus-chamados', async () => {
      const res = await m.meusChamados.GET(new Request('http://localhost/api/meus-chamados'));

      expect(res.status).toBe(200);
      const conteudo = await texto(res);
      expect(conteudo).toContain('2026-0001');
      expect(conteudo).toContain('2026-0002');
      expectSemVazamento(conteudo, 'GET /api/meus-chamados');
    });

    it.each([
      ['atribuído pela regra', () => chamadoAtribuido],
      ['sem técnico', () => chamadoSemTecnico],
    ])('detalhe de /api/meus-chamados/[id] (%s)', async (_nome, id) => {
      const res = await m.meusChamadosId.GET(
        new Request('http://localhost/api/meus-chamados/x'),
        ctx(id()),
      );

      expect(res.status).toBe(200);
      expectSemVazamento(await texto(res), 'GET /api/meus-chamados/[id]');
    });

    it('histórico do chamado', async () => {
      const res = await m.historico.GET(
        new Request('http://localhost/api/chamados/x/history'),
        ctx(chamadoAtribuido),
      );

      expect(res.status).toBe(200);
      const conteudo = await texto(res);
      // O fato aparece, sem id, motivo nem carga
      expect(conteudo).toContain('Atribuído automaticamente a Carla');
      expectSemVazamento(conteudo, 'GET /api/chamados/[id]/history');
    });

    it.each([
      ['atribuído pela regra', () => chamadoAtribuido],
      ['sem técnico', () => chamadoSemTecnico],
    ])('leitura de /conversas do chamado (%s)', async (_nome, id) => {
      const leitura = await m.leitura.lerChamadoEmLeitura(solicitante, id());

      expect(leitura.ok).toBe(true);
      expectSemVazamento(JSON.stringify(leitura), 'lerChamadoEmLeitura (solicitante)');
    });

    it('lateral de /conversas', async () => {
      const lateral = await m.lateral.montarLateral(solicitante);

      expect(JSON.stringify(lateral)).toContain('2026-0001');
      expectSemVazamento(JSON.stringify(lateral), 'montarLateral (solicitante)');
    });
  });

  // ── técnico · AC-16 ──────────────────────────────────────────────

  describe('técnico atribuído', () => {
    beforeEach(() => mockSession.mockResolvedValue(tecnico));

    it('lista de chamados-atribuidos', async () => {
      const res = await m.atribuidos.GET(new Request('http://localhost/api/chamados-atribuidos'));

      expect(res.status).toBe(200);
      const conteudo = await texto(res);
      expect(conteudo).toContain('2026-0001');
      expectSemVazamento(conteudo, 'GET /api/chamados-atribuidos');
    });

    it('detalhe de chamados-atribuidos/[id]', async () => {
      const res = await m.atribuidosId.GET(
        new Request('http://localhost/api/chamados-atribuidos/x'),
        ctx(chamadoAtribuido),
      );

      expect(res.status).toBe(200);
      expectSemVazamento(await texto(res), 'GET /api/chamados-atribuidos/[id]');
    });

    it('histórico do chamado', async () => {
      const res = await m.historico.GET(
        new Request('http://localhost/api/chamados/x/history'),
        ctx(chamadoAtribuido),
      );

      expect(res.status).toBe(200);
      expectSemVazamento(await texto(res), 'GET /api/chamados/[id]/history (técnico)');
    });

    it('leitura de /conversas do chamado', async () => {
      const leitura = await m.leitura.lerChamadoEmLeitura(tecnico, chamadoAtribuido);

      expect(leitura.ok).toBe(true);
      expectSemVazamento(JSON.stringify(leitura), 'lerChamadoEmLeitura (técnico)');
    });

    it('lateral de /conversas', async () => {
      const lateral = await m.lateral.montarLateral(tecnico);

      expect(JSON.stringify(lateral)).toContain('2026-0001');
      expectSemVazamento(JSON.stringify(lateral), 'montarLateral (técnico)');
    });
  });
});
