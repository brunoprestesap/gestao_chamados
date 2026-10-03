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
 * Preventiva por categoria de ativo contra o Mongo de verdade (spec 0013,
 * AC-16 a AC-25): o lote nasce `validado` com SLA, pula o ativo com preventiva
 * aberta, pausa o modelo sem categoria, recorta pelo local, sai um lote só com
 * o cron atrasado ou rodando em paralelo, e o ramo `template` segue igual.
 */

const emit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: emit }));

// Número de chamado: o real, com a opção de repetir um já usado na próxima chamada.
const numero = vi.hoisted(() => ({ repetir: null as string | null }));
vi.mock('@/lib/chamado-utils', async (original) => {
  const real = await original<typeof import('@/lib/chamado-utils')>();
  return {
    ...real,
    generateTicketNumber: async () => {
      if (numero.repetir) {
        const n = numero.repetir;
        numero.repetir = null;
        return n;
      }
      return real.generateTicketNumber();
    },
  };
});

const rodar = temMongoDeTeste ? describe : describe.skip;
const DIA = 24 * 60 * 60 * 1000;

rodar('preventiva por categoria, contra o Mongo', () => {
  let job: typeof import('@/lib/recurring-job');
  let RecurringTicketModel: typeof import('@/models/RecurringTicket').RecurringTicketModel;
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let CategoriaAtivoModel: typeof import('@/models/CategoriaAtivo').CategoriaAtivoModel;
  let LocalizacaoModel: typeof import('@/models/Localizacao').LocalizacaoModel;
  let NotificationModel: typeof import('@/models/Notification').NotificationModel;
  let UserModel: typeof import('@/models/user.model').UserModel;
  let SlaConfigModel: typeof import('@/models/SlaConfig').SlaConfigModel;
  let todos: ModelDeTeste[];

  const unitId = new Types.ObjectId();
  const solicitanteId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const prepostoId = new Types.ObjectId();
  let categoriaId: Types.ObjectId;
  let sedeId: Types.ObjectId;
  let salaSedeId: Types.ObjectId;
  let anexoId: Types.ObjectId;

  beforeAll(async () => {
    job = await import('@/lib/recurring-job');
    ({ RecurringTicketModel } = await import('@/models/RecurringTicket'));
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ChamadoHistoryModel } = await import('@/models/ChamadoHistory'));
    ({ AtivoModel } = await import('@/models/Ativo'));
    ({ CategoriaAtivoModel } = await import('@/models/CategoriaAtivo'));
    ({ LocalizacaoModel } = await import('@/models/Localizacao'));
    ({ NotificationModel } = await import('@/models/Notification'));
    ({ UserModel } = await import('@/models/user.model'));
    ({ SlaConfigModel } = await import('@/models/SlaConfig'));
    todos = [
      RecurringTicketModel,
      ChamadoModel,
      ChamadoHistoryModel,
      AtivoModel,
      CategoriaAtivoModel,
      LocalizacaoModel,
      NotificationModel,
      UserModel,
      SlaConfigModel,
    ];
    await conectarMongoDeTeste(todos, 'severino_test_preventiva');
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    emit.mockClear();
    numero.repetir = null;
    await UserModel.create([
      { _id: solicitanteId, name: 'Maria', username: 'maria', role: 'Solicitante', isActive: true },
      { _id: adminId, name: 'Beto', username: 'beto', role: 'Admin', isActive: true },
      { _id: prepostoId, name: 'Ana', username: 'ana', role: 'Preposto', isActive: true },
    ] as never);
    await SlaConfigModel.create({
      priority: 'BAIXA',
      responseTargetMinutes: 240,
      resolutionTargetMinutes: 2880,
      businessHoursOnly: false,
    } as never);
    const cat = await CategoriaAtivoModel.create({
      chave: 'climatizacao',
      nome: 'Climatização',
      criticidadePadrao: 'media',
    });
    categoriaId = cat._id;
    const sede = await LocalizacaoModel.create({ nome: 'Sede', tipo: 'predio', caminho: 'Sede' });
    sedeId = sede._id;
    const sala = await LocalizacaoModel.create({
      nome: 'Sala 1',
      tipo: 'sala',
      parentId: sedeId,
      caminho: 'Sede/Sala 1',
    });
    salaSedeId = sala._id;
    const anexo = await LocalizacaoModel.create({
      nome: 'Anexo',
      tipo: 'predio',
      caminho: 'Anexo',
    });
    anexoId = anexo._id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function ativo(codigo: string, campos: Record<string, unknown> = {}) {
    return AtivoModel.create({
      codigo,
      origemCodigo: 'interno',
      descricao: `Split ${codigo}`,
      categoriaId,
      localizacaoId: salaSedeId,
      criticidade: 'media',
      tierManutencao: 'A',
      status: 'em_operacao',
      statusCadastro: 'validado',
      ...campos,
    });
  }

  async function modelo(campos: Record<string, unknown> = {}) {
    return RecurringTicketModel.create({
      name: 'Splits Sede',
      titulo: 'Preventiva split',
      descricao: 'Limpeza de filtros',
      unitId,
      tipoServico: 'Ar-Condicionado',
      naturezaAtendimento: 'Padrão',
      grauUrgencia: 'Normal',
      subtypeId: new Types.ObjectId(),
      catalogServiceId: new Types.ObjectId(),
      recurrenceType: 'custom',
      intervalDays: 30,
      nextRunAt: new Date(Date.now() - 60_000),
      createdByUserId: adminId,
      solicitanteId,
      escopo: 'categoria_ativo',
      categoriaAtivoId: categoriaId,
      finalPriority: 'BAIXA',
      ...campos,
    });
  }

  async function voltarNoTempo(id: Types.ObjectId) {
    await RecurringTicketModel.updateOne(
      { _id: id },
      { $set: { nextRunAt: new Date(Date.now() - 60_000) } },
    );
  }

  it('gera um chamado validado com SLA por ativo Tier A em operação (AC-17 a AC-19, AC-21, AC-25)', async () => {
    const a1 = await ativo('MNT-0001');
    await ativo('MNT-0002');
    await ativo('MNT-0003', { localizacaoId: null });
    await ativo('MNT-0004', { status: 'inoperante' });
    await ativo('MNT-0005', { tierManutencao: 'B' });
    const m = await modelo();

    const r = await job.processRecurringTickets();
    expect(r.created).toBe(3);

    const chamados = await ChamadoModel.find({ originTemplateId: m._id })
      .sort({ titulo: 1 })
      .lean();
    expect(chamados.map((c) => c.titulo)).toEqual([
      'Preventiva split · MNT-0001',
      'Preventiva split · MNT-0002',
      'Preventiva split · MNT-0003',
    ]);
    const c1 = chamados[0];
    expect(c1.status).toBe('validado');
    expect(c1.finalPriority).toBe('BAIXA');
    expect(c1.attendanceNature).toBe('PADRAO');
    expect(c1.classifiedAt).toBeInstanceOf(Date);
    expect(c1.sla?.resolutionDueAt).toBeInstanceOf(Date);
    expect(c1.assignedToUserId ?? null).toBeNull();
    expect(String(c1.ativoId)).toBe(String(a1._id));
    expect(String(c1.unitId)).toBe(String(unitId));
    expect(c1.localExato).toBe('Sede/Sala 1');
    expect(chamados[2].localExato).toBe('Conforme agendamento');

    const hist = await ChamadoHistoryModel.findOne({ chamadoId: c1._id }).lean();
    expect(hist).toMatchObject({
      action: 'abertura',
      actorType: 'sistema',
      statusNovo: 'validado',
      observacoes: 'Preventiva gerada pelo agendamento Splits Sede',
    });

    // Um aviso de lote por gestor; nenhum ticket:new nem e-mail por chamado.
    const notas = await NotificationModel.find().lean();
    expect(notas.map((n) => n.type)).toEqual(['preventiva:lote', 'preventiva:lote']);
    expect(notas[0].title).toBe('Preventiva Splits Sede: 3 gerados, 0 pulados');
    expect(emit).not.toHaveBeenCalled();

    const depois = await RecurringTicketModel.findById(m._id).lean();
    expect(depois?.ultimoLote).toMatchObject({ situacao: 'concluido', gerados: 3, pulados: 0 });
    expect(depois?.totalGenerated).toBe(3);
    expect(depois!.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('pula o ativo que ainda tem preventiva aberta do mesmo modelo (AC-20)', async () => {
    await ativo('MNT-0001');
    await ativo('MNT-0002');
    const m = await modelo();
    await job.processRecurringTickets();
    await ChamadoModel.updateOne(
      { titulo: 'Preventiva split · MNT-0001' },
      { $set: { status: 'em atendimento' } },
    );
    await ChamadoModel.updateOne(
      { titulo: 'Preventiva split · MNT-0002' },
      { $set: { status: 'encerrado' } },
    );
    await voltarNoTempo(m._id);

    await job.processRecurringTickets();
    const depois = await RecurringTicketModel.findById(m._id).lean();
    expect(depois?.ultimoLote).toMatchObject({ gerados: 1, pulados: 1 });
    expect(await ChamadoModel.countDocuments({ originTemplateId: m._id })).toBe(3);
  });

  it('com o cron atrasado três períodos, sai um lote só e o próximo fica no futuro (AC-22)', async () => {
    await ativo('MNT-0001');
    const m = await modelo({
      intervalDays: 7,
      nextRunAt: new Date(Date.now() - 21 * DIA - 60_000),
    });
    await job.processRecurringTickets();
    await job.processRecurringTickets();
    expect(await ChamadoModel.countDocuments({ originTemplateId: m._id })).toBe(1);
    const depois = await RecurringTicketModel.findById(m._id).lean();
    expect(depois!.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(depois!.nextRunAt.getTime()).toBeLessThanOrEqual(Date.now() + 8 * DIA);
  });

  it('duas execuções em paralelo geram um lote só (AC-22)', async () => {
    await ativo('MNT-0001');
    await ativo('MNT-0002');
    const m = await modelo();
    await Promise.all([job.processRecurringTickets(), job.processRecurringTickets()]);
    expect(await ChamadoModel.countDocuments({ originTemplateId: m._id })).toBe(2);
    expect(await NotificationModel.countDocuments({ type: 'preventiva:lote' })).toBe(2);
  });

  it('recorta pelo local do modelo e deixa de fora o ativo sem local (AC-17)', async () => {
    await ativo('MNT-0001');
    await ativo('MNT-0002', { localizacaoId: anexoId });
    await ativo('MNT-0003', { localizacaoId: null });
    const m = await modelo({ localizacaoId: sedeId });
    await job.processRecurringTickets();
    const titulos = (await ChamadoModel.find({ originTemplateId: m._id }).lean()).map(
      (c) => c.titulo,
    );
    expect(titulos).toEqual(['Preventiva split · MNT-0001']);
  });

  it('sem SLA para a prioridade, todos nascem abertos e contam como sem SLA (AC-19)', async () => {
    await SlaConfigModel.deleteMany({});
    await ativo('MNT-0001');
    await ativo('MNT-0002');
    const m = await modelo();
    await job.processRecurringTickets();
    const chamados = await ChamadoModel.find({ originTemplateId: m._id }).lean();
    expect(chamados.map((c) => c.status)).toEqual(['aberto', 'aberto']);
    expect(chamados[0].finalPriority ?? null).toBeNull();
    const notas = await NotificationModel.find().lean();
    expect(notas[0].title).toBe('Preventiva Splits Sede: 2 gerados, 0 pulados, 2 sem SLA');
  });

  it('categoria desativada pausa o modelo e avisa o motivo (AC-23)', async () => {
    await ativo('MNT-0001');
    await CategoriaAtivoModel.updateOne({ _id: categoriaId }, { $set: { isActive: false } });
    const m = await modelo();
    await job.processRecurringTickets();
    const depois = await RecurringTicketModel.findById(m._id).lean();
    expect(depois?.isActive).toBe(false);
    expect(depois?.ultimoLote).toMatchObject({
      situacao: 'concluido',
      motivo: 'categoria desativada',
    });
    expect(await ChamadoModel.countDocuments()).toBe(0);
    const [nota] = await NotificationModel.find().lean();
    expect(nota.title).toBe('Preventiva Splits Sede pausada: categoria desativada');
  });

  it('solicitante inativo também pausa (AC-23)', async () => {
    await ativo('MNT-0001');
    await UserModel.updateOne({ _id: solicitanteId }, { $set: { isActive: false } });
    const m = await modelo();
    await job.processRecurringTickets();
    const depois = await RecurringTicketModel.findById(m._id).lean();
    expect(depois?.ultimoLote?.motivo).toBe('solicitante inativo');
  });

  it('sem ativo elegível, o aviso pede para conferir a categoria e o local (AC-21)', async () => {
    await modelo();
    await job.processRecurringTickets();
    const [nota] = await NotificationModel.find().lean();
    expect(nota.title).toBe(
      'Preventiva Splits Sede: nenhum ativo elegível, confira a categoria e o local do modelo',
    );
  });

  it('número repetido tenta de novo; outra falha conta em erros e o lote segue (AC-23)', async () => {
    await ativo('MNT-0001');
    await ativo('MNT-0002');
    await ativo('MNT-0003');
    const m = await modelo();

    // Um chamado qualquer já com o número que a geração vai repetir.
    await ChamadoModel.create({
      ticket_number: 'CHM-REPETIDO-1',
      titulo: 'outro',
      descricao: 'x',
      status: 'aberto',
      solicitanteId,
      unitId,
      localExato: 'x',
      tipoServico: 'Ar-Condicionado',
      naturezaAtendimento: 'Padrão',
      subtypeId: new Types.ObjectId(),
      catalogServiceId: new Types.ObjectId(),
    });
    numero.repetir = 'CHM-REPETIDO-1';

    // O segundo ativo falha por outro motivo.
    const criarReal = ChamadoModel.create.bind(ChamadoModel);
    vi.spyOn(ChamadoModel, 'create').mockImplementation(((doc: { titulo?: string }) => {
      if (doc?.titulo === 'Preventiva split · MNT-0002') {
        return Promise.reject(new Error('falha forçada'));
      }
      return criarReal(doc as never);
    }) as never);

    await job.processRecurringTickets();
    const titulos = (await ChamadoModel.find({ originTemplateId: m._id }).lean())
      .map((c) => c.titulo)
      .sort();
    expect(titulos).toEqual(['Preventiva split · MNT-0001', 'Preventiva split · MNT-0003']);
    const depois = await RecurringTicketModel.findById(m._id).lean();
    expect(depois?.ultimoLote).toMatchObject({ gerados: 2, erros: 1 });
  });

  it('o modelo de chamado único continua igual: um aberto e um ticket:new (AC-24)', async () => {
    await ativo('MNT-0001');
    const m = await modelo({
      escopo: 'template',
      categoriaAtivoId: null,
      finalPriority: null,
    });
    const r = await job.processRecurringTickets();
    expect(r.created).toBe(1);
    const chamados = await ChamadoModel.find({ originTemplateId: m._id }).lean();
    expect(chamados).toHaveLength(1);
    expect(chamados[0]).toMatchObject({ status: 'aberto', localExato: 'Conforme agendamento' });
    expect(chamados[0].ativoId ?? null).toBeNull();
    expect(emit).toHaveBeenCalledWith('managers', 'ticket:new', expect.anything());
    const depois = await RecurringTicketModel.findById(m._id).lean();
    expect(depois?.ultimoLote ?? null).toBeNull();
  });
});
