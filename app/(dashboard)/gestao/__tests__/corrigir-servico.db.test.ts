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
 * `corrigirServicoAction` contra o Mongo de verdade (spec 0009, AC-11, AC-12,
 * AC-13, AC-16, AC-21): a troca de técnico dentro da mesma gravação, a
 * atomicidade do filtro (serviço e técnico lidos) e a corrida entre a leitura
 * e a gravação só se provam com o banco de verdade, não com mock.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: vi.fn().mockResolvedValue(undefined) }));

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('corrigirServicoAction, contra o Mongo', () => {
  let corrigirServicoAction: typeof import('../actions').corrigirServicoAction;
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  let ServiceCatalogModel: typeof import('@/models/ServiceCatalog').ServiceCatalogModel;
  let ServiceSubTypeModel: typeof import('@/models/ServiceSubType').ServiceSubTypeModel;
  let ServiceTypeModel: typeof import('@/models/ServiceType').ServiceTypeModel;
  let UserModel: typeof import('@/models/user.model').UserModel;
  let UnitModel: typeof import('@/models/unit').UnitModel;
  let todos: ModelDeTeste[];

  const prepostoId = new Types.ObjectId();
  const solicitanteId = new Types.ObjectId();
  const unitId = new Types.ObjectId();

  const typeEletricaId = new Types.ObjectId();
  const typeArId = new Types.ObjectId();
  const subtypeEletricaId = new Types.ObjectId();
  const subtypeArId = new Types.ObjectId();
  const servicoEletricaId = new Types.ObjectId();
  const servicoArId = new Types.ObjectId();

  const anaId = new Types.ObjectId(); // só especialidade elétrica
  const betoId = new Types.ObjectId(); // só especialidade ar-condicionado
  const carlaId = new Types.ObjectId(); // as duas especialidades

  // Roda entre a leitura do serviço anterior e a gravação atômica: é a janela
  // onde uma implementação em dois passos deixaria uma corrida passar despercebida.
  let antesDaGravacao: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    vi.doMock('@/lib/dal', () => ({
      requireManager: async () => ({ userId: String(prepostoId), role: 'Preposto' }),
    }));
    ({ corrigirServicoAction } = await import('../actions'));
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ChamadoHistoryModel } = await import('@/models/ChamadoHistory'));
    ({ ServiceCatalogModel } = await import('@/models/ServiceCatalog'));
    ({ ServiceSubTypeModel } = await import('@/models/ServiceSubType'));
    ({ ServiceTypeModel } = await import('@/models/ServiceType'));
    ({ UserModel } = await import('@/models/user.model'));
    ({ UnitModel } = await import('@/models/unit'));

    // Intercepta a última leitura antes da gravação atômica (o nome do
    // serviço anterior), para simular uma correção concorrente no meio.
    const originalFindById = ServiceCatalogModel.findById.bind(ServiceCatalogModel);
    vi.spyOn(ServiceCatalogModel, 'findById').mockImplementation((...args: unknown[]) => {
      const query = originalFindById(...(args as [string]));
      const idArg = args[0];
      if (antesDaGravacao && String(idArg) === String(servicoEletricaId)) {
        const hook = antesDaGravacao;
        antesDaGravacao = null;
        const originalSelect = query.select.bind(query);
        query.select = ((...selectArgs: unknown[]) => {
          const selected = originalSelect(...(selectArgs as [string]));
          const originalLean = selected.lean.bind(selected);
          selected.lean = (async () => {
            await hook();
            return originalLean();
          }) as typeof selected.lean;
          return selected;
        }) as typeof query.select;
      }
      return query;
    });

    todos = [
      ChamadoModel,
      ChamadoHistoryModel,
      ServiceCatalogModel,
      ServiceSubTypeModel,
      ServiceTypeModel,
      UserModel,
      UnitModel,
    ] as never;
    await conectarMongoDeTeste(todos, 'severino_test_corrigir_servico');
  }, 60_000);

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await UnitModel.create({ _id: unitId, name: 'Fórum' } as never);
    await UserModel.create([
      { _id: prepostoId, name: 'Preposto', username: 'preposto', role: 'Preposto' },
      {
        _id: anaId,
        name: 'Ana',
        username: 'ana',
        role: 'Técnico',
        specialties: [subtypeEletricaId],
        maxAssignedTickets: 5,
      },
      {
        _id: betoId,
        name: 'Beto',
        username: 'beto',
        role: 'Técnico',
        specialties: [subtypeArId],
        maxAssignedTickets: 5,
      },
      {
        _id: carlaId,
        name: 'Carla',
        username: 'carla',
        role: 'Técnico',
        specialties: [subtypeEletricaId, subtypeArId],
        maxAssignedTickets: 5,
      },
      { _id: solicitanteId, name: 'Maria', username: 'maria', role: 'Solicitante' },
    ] as never);
    await ServiceTypeModel.create([
      { _id: typeEletricaId, name: 'Manutenção Predial' },
      { _id: typeArId, name: 'Ar-Condicionado' },
    ] as never);
    await ServiceSubTypeModel.create([
      { _id: subtypeEletricaId, typeId: typeEletricaId, name: 'Elétrica' },
      { _id: subtypeArId, typeId: typeArId, name: 'Refrigeração' },
    ] as never);
    await ServiceCatalogModel.create([
      {
        _id: servicoEletricaId,
        code: 'ELET-0001',
        name: 'Troca de tomada',
        typeId: typeEletricaId,
        subtypeId: subtypeEletricaId,
      },
      {
        _id: servicoArId,
        code: 'ARCO-0001',
        name: 'Reparo de ar-condicionado',
        typeId: typeArId,
        subtypeId: subtypeArId,
      },
    ] as never);
  });

  afterEach(async () => {
    antesDaGravacao = null;
    vi.restoreAllMocks();
    // `restoreAllMocks` desfaz também o spy do ServiceCatalogModel.findById
    // interceptador — recria pro próximo teste continuar funcionando.
    const originalFindById = ServiceCatalogModel.findById.bind(ServiceCatalogModel);
    vi.spyOn(ServiceCatalogModel, 'findById').mockImplementation((...args: unknown[]) => {
      const query = originalFindById(...(args as [string]));
      const idArg = args[0];
      if (antesDaGravacao && String(idArg) === String(servicoEletricaId)) {
        const hook = antesDaGravacao;
        antesDaGravacao = null;
        const originalSelect = query.select.bind(query);
        query.select = ((...selectArgs: unknown[]) => {
          const selected = originalSelect(...(selectArgs as [string]));
          const originalLean = selected.lean.bind(selected);
          selected.lean = (async () => {
            await hook();
            return originalLean();
          }) as typeof selected.lean;
          return selected;
        }) as typeof query.select;
      }
      return query;
    });
    await limparColecoes(todos);
  });

  afterAll(async () => {
    vi.doUnmock('@/lib/dal');
    vi.restoreAllMocks();
    await desconectarMongoDeTeste();
  });

  const MOTIVO = 'Motivo com mais de dez caracteres para a correção.';

  async function chamadoComServico(overrides: Record<string, unknown> = {}) {
    return ChamadoModel.create({
      ticket_number: `CHM-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      titulo: 'Tomada não funciona',
      status: 'validado',
      solicitanteId,
      unitId,
      localExato: 'Sala 10',
      tipoServico: 'Manutenção Predial',
      naturezaAtendimento: 'Padrão',
      catalogServiceId: servicoEletricaId,
      subtypeId: subtypeEletricaId,
      finalPriority: 'NORMAL',
      classifiedAt: new Date(),
      ...overrides,
    } as never);
  }

  // ── janela e recusas sem gravar nada ───────────────────────────

  it.each(['aberto', 'aguardando_solicitante', 'concluído', 'encerrado'])(
    'recusa fora da janela: status %s, sem gravar nada',
    async (status) => {
      const chamado = await chamadoComServico({ status });

      const result = await corrigirServicoAction({
        chamadoId: String(chamado._id),
        catalogServiceId: String(servicoArId),
        motivo: MOTIVO,
      });

      expect(result.ok).toBe(false);
      const depois = await ChamadoModel.findById(chamado._id).lean();
      expect(String(depois?.catalogServiceId)).toBe(String(servicoEletricaId));
      const historico = await ChamadoHistoryModel.find({ chamadoId: chamado._id }).lean();
      expect(historico).toHaveLength(0);
    },
  );

  it('aceita a janela em atendimento', async () => {
    const chamado = await chamadoComServico({
      status: 'em atendimento',
      assignedToUserId: carlaId,
    });

    const result = await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(servicoArId),
      motivo: MOTIVO,
    });

    expect(result).toEqual({ ok: true });
  });

  it('recusa trocar para o mesmo serviço, sem gravar nada', async () => {
    const chamado = await chamadoComServico();

    const result = await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(servicoEletricaId),
      motivo: MOTIVO,
    });

    expect(result.ok).toBe(false);
    const historico = await ChamadoHistoryModel.find({ chamadoId: chamado._id }).lean();
    expect(historico).toHaveLength(0);
  });

  it('recusa tipo de serviço desconhecido (ServiceType sem mapeamento), sem gravar nada', async () => {
    const outroTypeId = new Types.ObjectId();
    const outroSubtypeId = new Types.ObjectId();
    const outroServicoId = new Types.ObjectId();
    await ServiceTypeModel.create({ _id: outroTypeId, name: 'Paisagismo' } as never);
    await ServiceSubTypeModel.create({
      _id: outroSubtypeId,
      typeId: outroTypeId,
      name: 'Jardinagem',
    } as never);
    await ServiceCatalogModel.create({
      _id: outroServicoId,
      code: 'JARD-0001',
      name: 'Poda de árvore',
      typeId: outroTypeId,
      subtypeId: outroSubtypeId,
    } as never);
    const chamado = await chamadoComServico();

    const result = await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(outroServicoId),
      motivo: MOTIVO,
    });

    expect(result.ok).toBe(false);
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(String(depois?.catalogServiceId)).toBe(String(servicoEletricaId));
  });

  // ── técnico ─────────────────────────────────────────────────────

  it('mantém o técnico quando ele tem a especialidade do serviço novo', async () => {
    const chamado = await chamadoComServico({
      status: 'em atendimento',
      assignedToUserId: carlaId,
    });

    const result = await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(servicoArId),
      motivo: MOTIVO,
    });

    expect(result).toEqual({ ok: true });
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(String(depois?.assignedToUserId)).toBe(String(carlaId));
    expect(String(depois?.catalogServiceId)).toBe(String(servicoArId));
    expect(String(depois?.subtypeId)).toBe(String(subtypeArId));
    expect(depois?.tipoServico).toBe('Ar-Condicionado');
    const reatribuicao = await ChamadoHistoryModel.find({
      chamadoId: chamado._id,
      action: 'reatribuicao_tecnico',
    }).lean();
    expect(reatribuicao).toHaveLength(0);
  });

  it('exige novoTecnicoId quando o técnico atual não tem a especialidade, sem gravar nada', async () => {
    const chamado = await chamadoComServico({ status: 'em atendimento', assignedToUserId: anaId });

    const result = await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(servicoArId),
      motivo: MOTIVO,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('especialidade');
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(String(depois?.catalogServiceId)).toBe(String(servicoEletricaId));
    expect(String(depois?.assignedToUserId)).toBe(String(anaId));
  });

  it('troca para o novoTecnicoId válido: grava reatribuicao_tecnico sem "Observações" e o veredito do técnico', async () => {
    const chamado = await chamadoComServico({ status: 'em atendimento', assignedToUserId: anaId });

    const result = await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(servicoArId),
      novoTecnicoId: String(betoId),
      motivo: MOTIVO,
    });

    expect(result).toEqual({ ok: true });
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(String(depois?.assignedToUserId)).toBe(String(betoId));
    const reatribuicao = await ChamadoHistoryModel.findOne({
      chamadoId: chamado._id,
      action: 'reatribuicao_tecnico',
    }).lean();
    expect(reatribuicao?.observacoes).not.toContain('Observações');
    expect(reatribuicao?.observacoes).toContain('Ana');
    expect(reatribuicao?.observacoes).toContain('Beto');
  });

  it('recusa novoTecnicoId sem a especialidade do serviço novo, sem gravar nada', async () => {
    const chamado = await chamadoComServico({ status: 'em atendimento', assignedToUserId: anaId });
    const outroSemEspecialidade = new Types.ObjectId();
    await UserModel.create({
      _id: outroSemEspecialidade,
      name: 'Duda',
      username: 'duda',
      role: 'Técnico',
      specialties: [subtypeEletricaId],
      maxAssignedTickets: 5,
    } as never);

    const result = await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(servicoArId),
      novoTecnicoId: String(outroSemEspecialidade),
      motivo: MOTIVO,
    });

    expect(result.ok).toBe(false);
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(String(depois?.assignedToUserId)).toBe(String(anaId));
  });

  it('recusa novoTecnicoId inválido: usuário inexistente, sem gravar nada', async () => {
    const chamado = await chamadoComServico({ status: 'em atendimento', assignedToUserId: anaId });

    const result = await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(servicoArId),
      novoTecnicoId: String(new Types.ObjectId()),
      motivo: MOTIVO,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('inválido');
  });

  it('novoTecnicoId só vale em em atendimento: recusa num chamado validado sem técnico', async () => {
    const chamado = await chamadoComServico({ status: 'validado', assignedToUserId: null });

    const result = await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(servicoArId),
      novoTecnicoId: String(betoId),
      motivo: MOTIVO,
    });

    expect(result.ok).toBe(false);
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(String(depois?.catalogServiceId)).toBe(String(servicoEletricaId));
  });

  it('chamado validado sem técnico corrige o serviço normalmente (sem exigir novoTecnicoId)', async () => {
    const chamado = await chamadoComServico({ status: 'validado', assignedToUserId: null });

    const result = await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(servicoArId),
      motivo: MOTIVO,
    });

    expect(result).toEqual({ ok: true });
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(String(depois?.catalogServiceId)).toBe(String(servicoArId));
    expect(depois?.assignedToUserId).toBeFalsy();
  });

  // ── trilha (AC-13, AC-12) ───────────────────────────────────────

  it('grava correcao_gestao com o motivo e a entrada neutra sem motivo', async () => {
    const chamado = await chamadoComServico();

    await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(servicoArId),
      motivo: MOTIVO,
    });

    const historico = await ChamadoHistoryModel.find({ chamadoId: chamado._id }).lean();
    const correcaoGestao = historico.find((h) => h.action === 'correcao_gestao');
    const neutra = historico.find((h) => h.action === 'classificacao');
    expect(correcaoGestao?.observacoes).toContain(MOTIVO);
    expect(neutra?.observacoes).not.toContain(MOTIVO);
    expect(neutra?.observacoes).toContain('Reparo de ar-condicionado');
  });

  it('motivo ausente: correcao_gestao registra "não informado"', async () => {
    const chamado = await chamadoComServico();

    await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(servicoArId),
      motivo: '',
    });

    const correcao = await ChamadoHistoryModel.findOne({
      chamadoId: chamado._id,
      action: 'correcao_gestao',
    }).lean();
    expect(correcao?.observacoes).toContain('não informado');
  });

  // ── atomicidade e corrida ───────────────────────────────────────

  it('duas correções concorrentes: só a primeira a gravar aplica, a outra é recusada (AC-21)', async () => {
    const chamado = await chamadoComServico();

    antesDaGravacao = async () => {
      const segunda = await corrigirServicoAction({
        chamadoId: String(chamado._id),
        catalogServiceId: String(servicoArId),
        motivo: 'Segunda correção concorrente.',
      });
      expect(segunda.ok).toBe(true);
    };

    const primeira = await corrigirServicoAction({
      chamadoId: String(chamado._id),
      catalogServiceId: String(servicoArId),
      motivo: 'Primeira correção concorrente.',
    });

    expect(primeira.ok).toBe(false);
    if (!primeira.ok) expect(primeira.error).toContain('tente de novo');
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(String(depois?.catalogServiceId)).toBe(String(servicoArId));
  });
});
