import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type LlmStub, startLlmStub } from '@/e2e/fixtures/llm-stub';
import {
  resetLlmRuntimeState,
  restoreLlmDefaults,
  setLlmEnv,
  TEST_API_KEY,
  TEST_MODEL,
  useStubEnv,
} from '@/lib/llm/__tests__/llm-test-env';
import type { QuadroResposta } from '@/shared/conversas/quadro.schemas';
import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

const mockEmitToRoom = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: (...a: unknown[]) => mockEmitToRoom(...a) }));
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

/**
 * A abertura do chamado pela conversa de ponta a ponta (spec 0004): o servidor
 * falso do vLLM responde, o MongoDB de verdade guarda, e o chamado nasce pela
 * confirmação do cartão. Índice único, gravação condicional e corrida não
 * aparecem com mock.
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 *
 * covers: AC-1, AC-3, AC-4, AC-5, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-17
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

/**
 * O que a leitura do solicitante nunca pode trazer: a proposta, a confiança, o
 * motivo e a prioridade sugerida. O `0.87` é a confiança do vLLM falso. Ele é
 * ancorado porque um timestamp ISO como `…10.874Z` também contém "0.87", e sem
 * a âncora o teste falhava ao acaso (cerca de 0,1% por timestamp serializado).
 */
const VAZAMENTO_DA_PROPOSTA = /propostaIa|confianca|"motivo"|prioridade|(?<![\d.])0\.87(?!\d)/;

describe('padrão de vazamento da proposta', () => {
  it('pega a confiança de verdade e não confunde um timestamp com ela', () => {
    // Act & Assert: a confiança vazada é pega, em qualquer lugar do JSON
    expect(VAZAMENTO_DA_PROPOSTA.test('{"x":0.87}')).toBe(true);
    expect(VAZAMENTO_DA_PROPOSTA.test('[0.87,1]')).toBe(true);
    expect(VAZAMENTO_DA_PROPOSTA.test('{"propostaIa":{}}')).toBe(true);
    // E o timestamp que contém "0.87" não é
    for (const em of [
      '2026-09-25T12:52:10.874Z',
      '2026-01-01T00:00:00.870Z',
      '2026-09-25T09:20:50.879Z',
    ]) {
      expect(VAZAMENTO_DA_PROPOSTA.test(JSON.stringify({ em }))).toBe(false);
    }
  });
});

type Modulos = {
  responderNaConversa: typeof import('../responder').responderNaConversa;
  revisarAbertura: typeof import('../cartao').revisarAbertura;
  confirmarAbertura: typeof import('../confirmar').confirmarAbertura;
  conversas: typeof import('@/lib/conversas');
  salvarConfig: typeof import('@/lib/ia-confianca/config').salvarConfig;
  medirCalibragem: typeof import('@/lib/ia-confianca/calibragem').medirCalibragem;
  ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  ConversaModel: typeof import('@/models/Conversa').ConversaModel;
  ConversaMensagemModel: typeof import('@/models/ConversaMensagem').ConversaMensagemModel;
  DecisaoIaModel: typeof import('@/models/DecisaoIa').DecisaoIaModel;
  IaAutonomiaConfigModel: typeof import('@/models/IaAutonomiaConfig').IaAutonomiaConfigModel;
  NotificationModel: typeof import('@/models/Notification').NotificationModel;
  ServiceCatalogModel: typeof import('@/models/ServiceCatalog').ServiceCatalogModel;
  ServiceSubTypeModel: typeof import('@/models/ServiceSubType').ServiceSubTypeModel;
  ServiceTypeModel: typeof import('@/models/ServiceType').ServiceTypeModel;
  SlaConfigModel: typeof import('@/models/SlaConfig').SlaConfigModel;
  UnitModel: typeof import('@/models/unit').UnitModel;
  UserModel: typeof import('@/models/user.model').UserModel;
  LlmCallModel: typeof import('@/models/LlmCall').LlmCallModel;
};

rodar('abertura do chamado pela conversa, contra o Mongo e o vLLM falso', () => {
  let m: Modulos;
  let todos: ModelDeTeste[];
  let stub: LlmStub;

  const solicitanteId = new Types.ObjectId();
  const prepostoId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const outraUnitId = new Types.ObjectId();
  const typeId = new Types.ObjectId();
  const subtypeId = new Types.ObjectId();
  const catalogServiceId = new Types.ObjectId();

  const viewer = { userId: String(solicitanteId), role: 'Solicitante' as const };
  const outro = { userId: String(new Types.ObjectId()), role: 'Admin' as const };

  /** A resposta do modelo como texto JSON, na ordem do schema. */
  function respostaDoModelo(extra: Record<string, unknown> = {}) {
    return JSON.stringify({
      servicoCodigo: 'ELET-0001',
      servicoConfianca: 0.87,
      servicoMotivo: 'Lâmpada queimada é troca de lâmpada.',
      prioridade: 'NORMAL',
      prioridadeConfianca: 0.6,
      prioridadeMotivo: 'Atrapalha sem parar o trabalho.',
      localExato: 'Sala 302',
      localForaDoPerfil: false,
      completo: true,
      resposta: 'Entendi: a lâmpada da sala 302 queimou. Confira o resumo abaixo.',
      ...extra,
    });
  }

  function enfileirar(extra: Record<string, unknown> = {}) {
    const texto = respostaDoModelo(extra);
    const meio = Math.floor(texto.length / 2);
    stub.enqueue({ type: 'stream', chunks: [texto.slice(0, meio), texto.slice(meio)] });
  }

  async function coletar(gerador: AsyncGenerator<QuadroResposta>): Promise<QuadroResposta[]> {
    const quadros: QuadroResposta[] = [];
    for await (const q of gerador) quadros.push(q);
    return quadros;
  }

  async function novaConversa(): Promise<string> {
    const criada = await m.conversas.criarConversa(viewer);
    if (!criada.ok) throw new Error(`criarConversa: ${criada.reason}`);
    return criada.conversaId;
  }

  async function responder(conversaId: string, texto: string): Promise<QuadroResposta[]> {
    const r = await m.responderNaConversa({ viewer, conversaId, texto });
    if (!r.ok) throw new Error(`responder: ${r.reason}`);
    return coletar(r.quadros);
  }

  function cartaoDe(quadros: QuadroResposta[]) {
    const q = quadros.find((x) => x.tipo === 'cartao');
    return q && q.tipo === 'cartao' ? q : null;
  }

  beforeAll(async () => {
    const [responder, cartao, confirmar, conversas] = await Promise.all([
      import('../responder'),
      import('../cartao'),
      import('../confirmar'),
      import('@/lib/conversas'),
    ]);
    m = {
      responderNaConversa: responder.responderNaConversa,
      revisarAbertura: cartao.revisarAbertura,
      confirmarAbertura: confirmar.confirmarAbertura,
      conversas,
      salvarConfig: (await import('@/lib/ia-confianca/config')).salvarConfig,
      medirCalibragem: (await import('@/lib/ia-confianca/calibragem')).medirCalibragem,
      ChamadoModel: (await import('@/models/Chamado')).ChamadoModel,
      ChamadoHistoryModel: (await import('@/models/ChamadoHistory')).ChamadoHistoryModel,
      ConversaModel: (await import('@/models/Conversa')).ConversaModel,
      ConversaMensagemModel: (await import('@/models/ConversaMensagem')).ConversaMensagemModel,
      DecisaoIaModel: (await import('@/models/DecisaoIa')).DecisaoIaModel,
      IaAutonomiaConfigModel: (await import('@/models/IaAutonomiaConfig')).IaAutonomiaConfigModel,
      NotificationModel: (await import('@/models/Notification')).NotificationModel,
      ServiceCatalogModel: (await import('@/models/ServiceCatalog')).ServiceCatalogModel,
      ServiceSubTypeModel: (await import('@/models/ServiceSubType')).ServiceSubTypeModel,
      ServiceTypeModel: (await import('@/models/ServiceType')).ServiceTypeModel,
      SlaConfigModel: (await import('@/models/SlaConfig')).SlaConfigModel,
      UnitModel: (await import('@/models/unit')).UnitModel,
      UserModel: (await import('@/models/user.model')).UserModel,
      LlmCallModel: (await import('@/models/LlmCall')).LlmCallModel,
    };
    todos = [
      m.ChamadoModel,
      m.ChamadoHistoryModel,
      m.ConversaModel,
      m.ConversaMensagemModel,
      m.DecisaoIaModel,
      m.IaAutonomiaConfigModel,
      m.NotificationModel,
      m.ServiceCatalogModel,
      m.ServiceSubTypeModel,
      m.ServiceTypeModel,
      m.SlaConfigModel,
      m.UnitModel,
      m.UserModel,
      m.LlmCallModel,
    ] as unknown as ModelDeTeste[];

    await conectarMongoDeTeste(todos, 'severino_test_abertura_chat');
    stub = await startLlmStub({ apiKey: TEST_API_KEY, model: TEST_MODEL });
  }, 60_000);

  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockEmitToRoom.mockReset().mockResolvedValue(undefined);
    stub.reset();
    resetLlmRuntimeState();
    useStubEnv(stub.baseUrl);

    await m.UnitModel.create({ _id: unitId, name: 'Fórum Central', floor: '3º andar' } as never);
    await m.UnitModel.create({ _id: outraUnitId, name: 'Anexo', floor: 'Térreo' } as never);
    await m.UserModel.create([
      { _id: solicitanteId, name: 'Maria', username: 'maria', role: 'Solicitante', unitId },
      { _id: prepostoId, name: 'Paulo', username: 'paulo', role: 'Preposto', isActive: true },
      { _id: adminId, name: 'Ana', username: 'ana', role: 'Admin', isActive: true },
    ] as never);
    await m.ServiceTypeModel.create({ _id: typeId, name: 'Manutenção Predial' } as never);
    await m.ServiceSubTypeModel.create({ _id: subtypeId, typeId, name: 'Iluminação' } as never);
    await m.ServiceCatalogModel.create({
      _id: catalogServiceId,
      code: 'ELET-0001',
      name: 'Troca de lâmpada',
      description: 'Lâmpada queimada ou piscando',
      typeId,
      subtypeId,
    } as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await limparColecoes(todos);
  });

  afterAll(async () => {
    restoreLlmDefaults();
    await stub?.close();
    await desconectarMongoDeTeste();
  });

  // ── caminho feliz · AC-1, AC-3, AC-4, AC-10, AC-11 ─────────────

  it('do relato ao chamado com a sugestão da IA gravada', async () => {
    // Arrange
    const conversaId = await novaConversa();
    enfileirar();

    // Act 1: a mensagem vira resposta, proposta e cartão
    const quadros = await responder(conversaId, 'A lâmpada da sala 302 queimou.');

    // Assert 1
    expect(quadros.map((q) => q.tipo)).toEqual(expect.arrayContaining(['inicio', 'fim', 'cartao']));
    expect(quadros.at(-1)?.tipo).toBe('cartao');
    const cartao = cartaoDe(quadros);
    expect(cartao?.cartao).toMatchObject({
      modo: 'ia',
      servico: { rotuloServico: 'Troca de lâmpada', rotuloSubtipo: 'Iluminação' },
      unidade: { unitId: String(unitId), rotulo: 'Fórum Central', andar: '3º andar' },
      localExato: 'Sala 302',
      faltando: [],
    });
    expect(stub.completionRequests()).toHaveLength(1);

    // O cartão não conta no teto nem mexe na prévia (AC-13)
    const conversa = (await m.ConversaModel.findById(conversaId).lean()) as Record<string, unknown>;
    expect(conversa.mensagensCount).toBe(2);
    expect(conversa.previa).toBe('A lâmpada da sala 302 queimou.');
    const proposta = conversa.propostaIa as Record<string, unknown>;
    expect(String(proposta.cartaoMensagemId)).toBe(cartao?.mensagemId);
    // O LlmCall é gravado sem esperar (lib/llm/call-run.ts), então a escrita pode
    // ainda não ter chegado ao Mongo quando a resposta termina.
    const llmCall = await vi.waitFor(async () => {
      const doc = await m.LlmCallModel.findOne({}).lean();
      expect(doc).not.toBeNull();
      return doc;
    });
    expect(String(proposta.llmCallId)).toBe(String(llmCall?._id));

    // Act 2: a pessoa confirma
    const confirmado = await m.confirmarAbertura(viewer, {
      conversaId,
      cartaoId: cartao!.mensagemId!,
      unitId: String(unitId),
      localExato: 'Sala 302',
    });

    // Assert 2: o chamado nasceu aberto, pelo chat, com a sugestão da IA
    expect(confirmado).toMatchObject({ ok: true, jaExistia: false });
    if (!confirmado.ok) return;
    const chamado = (await m.ChamadoModel.findById(confirmado.chamadoId).lean()) as Record<
      string,
      unknown
    >;
    expect(chamado).toMatchObject({
      status: 'aberto',
      canalAbertura: 'chat',
      iaSituacao: 'sugerida',
      titulo: 'Troca de lâmpada — Sala 302',
      descricao: 'A lâmpada da sala 302 queimou.',
      localExato: 'Sala 302',
      tipoServico: 'Manutenção Predial',
      grauUrgencia: 'Normal',
      naturezaAtendimento: 'Padrão',
      telefoneContato: '',
    });
    expect(String(chamado.unitId)).toBe(String(unitId));
    expect(String(chamado.catalogServiceId)).toBe(String(catalogServiceId));

    // Duas decisões `sugestao`, com o `llmCallId` da proposta
    const decisoes = await m.DecisaoIaModel.find({ chamadoId: confirmado.chamadoId }).lean();
    expect(decisoes.map((d) => d.campo).sort()).toEqual(['prioridade', 'servico']);
    for (const decisao of decisoes) {
      expect(decisao.efeito).toBe('sugestao');
      expect(String(decisao.llmCallId)).toBe(String(llmCall?._id));
    }

    // Histórico: abertura mais uma `decisao_ia` por decisão
    const historico = await m.ChamadoHistoryModel.find({ chamadoId: confirmado.chamadoId }).lean();
    expect(historico.map((h) => h.action).sort()).toEqual(['abertura', 'decisao_ia', 'decisao_ia']);

    // A mensagem de chamado aberto e uma notificação por gestor
    const ultima = await m.ConversaMensagemModel.findOne({ conversaId })
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    expect(ultima).toMatchObject({ autor: 'sistema', tipo: 'texto' });
    expect(ultima?.texto).toContain(`#${confirmado.ticketNumber}`);
    expect(await m.NotificationModel.countDocuments({ type: 'ticket:new' })).toBe(2);
  });

  it('clique duplo devolve o mesmo chamado, sem segunda mensagem nem notificação (AC-11)', async () => {
    // Arrange
    const conversaId = await novaConversa();
    enfileirar();
    const cartao = cartaoDe(await responder(conversaId, 'A lâmpada da sala 302 queimou.'));
    const entrada = {
      conversaId,
      cartaoId: cartao!.mensagemId!,
      unitId: String(unitId),
      localExato: 'Sala 302',
    };

    // Act
    const primeira = await m.confirmarAbertura(viewer, entrada);
    const segunda = await m.confirmarAbertura(viewer, entrada);

    // Assert
    expect(primeira.ok && segunda.ok).toBe(true);
    if (!primeira.ok || !segunda.ok) return;
    expect(segunda.chamadoId).toBe(primeira.chamadoId);
    expect(segunda.jaExistia).toBe(true);
    expect(await m.ChamadoModel.countDocuments({})).toBe(1);
    expect(await m.NotificationModel.countDocuments({})).toBe(2);
    const avisos = await m.ConversaMensagemModel.countDocuments({
      conversaId,
      autor: 'sistema',
      texto: { $regex: 'aberto' },
    });
    expect(avisos).toBe(1);
  });

  it('mesma proposta duas vezes não grava segundo cartão (AC-4)', async () => {
    // Arrange
    const conversaId = await novaConversa();
    enfileirar();
    enfileirar({ resposta: 'Anotado, é isso mesmo.' });

    // Act
    const primeira = await responder(conversaId, 'A lâmpada da sala 302 queimou.');
    const segunda = await responder(conversaId, 'É a do fundo.');

    // Assert
    expect(cartaoDe(primeira)).not.toBeNull();
    expect(cartaoDe(segunda)).toBeNull();
    expect(await m.ConversaMensagemModel.countDocuments({ conversaId, tipo: 'cartao' })).toBe(1);
  });

  it('serviço que muda sem completar invalida o cartão e confirmar o velho falha (AC-4, AC-12)', async () => {
    // Arrange: um segundo serviço no catálogo
    await m.ServiceCatalogModel.create({
      code: 'ELET-0002',
      name: 'Troca de tomada',
      typeId,
      subtypeId,
    } as never);
    const conversaId = await novaConversa();
    enfileirar();
    enfileirar({ servicoCodigo: 'ELET-0002', completo: false });
    const cartao = cartaoDe(await responder(conversaId, 'A lâmpada da sala 302 queimou.'));

    // Act
    const segunda = await responder(conversaId, 'Na verdade é a tomada.');
    const confirmado = await m.confirmarAbertura(viewer, {
      conversaId,
      cartaoId: cartao!.mensagemId!,
      unitId: String(unitId),
      localExato: 'Sala 302',
    });

    // Assert
    expect(cartaoDe(segunda)).toEqual({
      tipo: 'cartao',
      mensagemId: null,
      cartao: null,
      substituiId: cartao!.mensagemId,
    });
    expect(confirmado).toEqual({ ok: false, reason: 'cartao_desatualizado' });
    expect(await m.ChamadoModel.countDocuments({})).toBe(0);
  });

  it('código inventado não vira serviço, e `Revisar e abrir` monta o cartão manual (AC-3, AC-7)', async () => {
    // Arrange
    const conversaId = await novaConversa();
    enfileirar({ servicoCodigo: 'XXXX-9999' });

    // Act
    const quadros = await responder(conversaId, 'A lâmpada da sala 302 queimou.');
    const revisado = await m.revisarAbertura(viewer, conversaId);

    // Assert
    expect(cartaoDe(quadros)).toBeNull();
    const conversa = (await m.ConversaModel.findById(conversaId).lean()) as Record<string, unknown>;
    expect((conversa.propostaIa as Record<string, unknown>).servico).toBeNull();
    expect(revisado).toMatchObject({
      ok: true,
      cartao: { modo: 'manual', servico: null, localExato: 'Sala 302', faltando: ['tipo'] },
    });
  });

  // ── sem IA · AC-8, AC-9 ────────────────────────────────────────

  it('com a IA desligada, reserva e cartão manual, e o chamado abre sem serviço', async () => {
    // Arrange
    setLlmEnv({ LLM_ENABLED: 'false' });
    const conversaId = await novaConversa();

    // Act 1
    const quadros = await responder(conversaId, 'O elevador social parou no térreo.');

    // Assert 1
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio', 'reserva', 'cartao']);
    const cartao = cartaoDe(quadros);
    expect(cartao?.cartao).toMatchObject({ modo: 'manual', servico: null });
    expect(stub.completionRequests()).toHaveLength(0);

    // Act 2
    const confirmado = await m.confirmarAbertura(viewer, {
      conversaId,
      cartaoId: cartao!.mensagemId!,
      unitId: String(unitId),
      localExato: 'Hall do térreo',
      tipoServico: 'Elevador',
    });

    // Assert 2
    expect(confirmado.ok).toBe(true);
    if (!confirmado.ok) return;
    const chamado = (await m.ChamadoModel.findById(confirmado.chamadoId).lean()) as Record<
      string,
      unknown
    >;
    expect(chamado).toMatchObject({
      tipoServico: 'Elevador',
      titulo: 'Elevador — Hall do térreo',
      descricao: 'O elevador social parou no térreo.',
      iaSituacao: 'sem_ia',
      catalogServiceId: null,
      subtypeId: null,
    });
    expect(await m.DecisaoIaModel.countDocuments({})).toBe(0);
  });

  it('formulário continua exigindo serviço: só o chamado do chat nasce sem ele (AC-9)', async () => {
    // Act
    const erro = await m.ChamadoModel.create({
      ticket_number: 'CHM-2026-99999',
      titulo: 'Sem serviço',
      solicitanteId,
      unitId,
      localExato: 'Sala 1',
      tipoServico: 'Elevador',
    } as never).catch((e: unknown) => e);

    // Assert
    expect(erro).toBeInstanceOf(Error);
    expect(String((erro as Error).message)).toMatch(/catalogServiceId|subtypeId/);
  });

  it('reserva com cartão já valendo não grava cartão novo, e ele segue confirmável (AC-8)', async () => {
    // Arrange
    const conversaId = await novaConversa();
    enfileirar();
    const cartao = cartaoDe(await responder(conversaId, 'A lâmpada da sala 302 queimou.'));
    stub.enqueue({ type: 'status', status: 500 });

    // Act
    const quadros = await responder(conversaId, 'Ainda está apagada.');
    const confirmado = await m.confirmarAbertura(viewer, {
      conversaId,
      cartaoId: cartao!.mensagemId!,
      unitId: String(unitId),
      localExato: 'Sala 302',
    });

    // Assert
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio', 'reserva']);
    expect(confirmado.ok).toBe(true);
  });

  // ── unidade · AC-6, AC-10 ──────────────────────────────────────

  it('sem unidade no perfil, o cartão pede a unidade e confirmar sem ela não cria nada', async () => {
    // Arrange
    await m.UserModel.updateOne({ _id: solicitanteId }, { $unset: { unitId: 1 } });
    const conversaId = await novaConversa();
    enfileirar();

    // Act
    const quadros = await responder(conversaId, 'A lâmpada da sala 302 queimou.');
    const cartao = cartaoDe(quadros);
    const semUnidade = await m.confirmarAbertura(viewer, {
      conversaId,
      cartaoId: cartao!.mensagemId!,
      unitId: String(new Types.ObjectId()),
      localExato: 'Sala 302',
    });

    // Assert
    const system: string = stub.completionRequests()[0].body.messages[0].content;
    expect(system).toContain('não tem unidade no perfil');
    expect(cartao?.cartao).toMatchObject({ unidade: null, faltando: ['unidade'] });
    expect(semUnidade).toEqual({ ok: false, reason: 'dados_invalidos' });
    expect(await m.ChamadoModel.countDocuments({})).toBe(0);
  });

  it('a pessoa troca a unidade no cartão e o chamado vai para a escolhida (AC-6)', async () => {
    // Arrange
    const conversaId = await novaConversa();
    enfileirar();
    const cartao = cartaoDe(await responder(conversaId, 'A lâmpada da sala 302 queimou.'));

    // Act
    const confirmado = await m.confirmarAbertura(viewer, {
      conversaId,
      cartaoId: cartao!.mensagemId!,
      unitId: String(outraUnitId),
      localExato: 'Sala 12 do anexo',
    });

    // Assert
    if (!confirmado.ok) throw new Error(confirmado.reason);
    const chamado = await m.ChamadoModel.findById(confirmado.chamadoId).lean();
    expect(String(chamado?.unitId)).toBe(String(outraUnitId));
    expect(chamado?.localExato).toBe('Sala 12 do anexo');
  });

  // ── corridas · AC-3, AC-12 ─────────────────────────────────────

  it('resposta que termina depois do vínculo não grava proposta nem cartão (AC-12)', async () => {
    // Arrange: um cartão manual já pronto para confirmar
    setLlmEnv({ LLM_ENABLED: 'false' });
    const conversaId = await novaConversa();
    const cartao = cartaoDe(await responder(conversaId, 'O elevador parou.'));
    useStubEnv(stub.baseUrl);
    enfileirar();

    // Act: a mensagem nova grava e a resposta só corre depois do vínculo
    const iniciada = await m.responderNaConversa({
      viewer,
      conversaId,
      texto: 'Está parado ainda.',
    });
    if (!iniciada.ok) throw new Error(iniciada.reason);
    const confirmado = await m.confirmarAbertura(viewer, {
      conversaId,
      cartaoId: cartao!.mensagemId!,
      unitId: String(unitId),
      localExato: 'Hall',
      tipoServico: 'Elevador',
    });
    const quadros = await coletar(iniciada.quadros);

    // Assert
    expect(confirmado.ok).toBe(true);
    expect(cartaoDe(quadros)).toBeNull();
    const conversa = (await m.ConversaModel.findById(conversaId).lean()) as Record<string, unknown>;
    const proposta = conversa.propostaIa as Record<string, unknown>;
    expect(proposta.origemMensagemId).toBeNull();
    expect(String(proposta.cartaoMensagemId)).toBe(cartao!.mensagemId);
  });

  it('resposta de mensagem mais antiga que chega por último não passa por cima (AC-3)', async () => {
    // Arrange: duas abas mandam mensagem; a segunda responde primeiro
    const conversaId = await novaConversa();
    const a = await m.responderNaConversa({ viewer, conversaId, texto: 'Lâmpada queimada.' });
    const b = await m.responderNaConversa({ viewer, conversaId, texto: 'É na sala 305.' });
    if (!a.ok || !b.ok) throw new Error('envio');
    enfileirar({ localExato: 'Sala 305' });
    enfileirar({ localExato: 'Sala 302' });

    // Act
    const deB = await coletar(b.quadros);
    const deA = await coletar(a.quadros);

    // Assert
    expect(cartaoDe(deB)?.cartao?.localExato).toBe('Sala 305');
    expect(cartaoDe(deA)).toBeNull();
    const conversa = (await m.ConversaModel.findById(conversaId).lean()) as Record<string, unknown>;
    const proposta = conversa.propostaIa as Record<string, unknown>;
    expect(String(proposta.origemMensagemId)).toBe(b.mensagemId);
    expect(proposta.localExato).toBe('Sala 305');
  });

  // ── teto de 30 · AC-13 ─────────────────────────────────────────

  it('no teto de 30, `Revisar e abrir` grava o cartão e o chamado nasce', async () => {
    // Arrange
    const conversaId = await novaConversa();
    for (let i = 0; i < 30; i += 1) {
      const enviada = await m.conversas.enviarMensagem({
        viewer,
        conversaId,
        autor: 'solicitante',
        tipo: 'texto',
        texto: `Mensagem ${i}`,
      });
      expect(enviada.ok).toBe(true);
    }

    // Act
    const revisado = await m.revisarAbertura(viewer, conversaId);
    if (!revisado.ok) throw new Error(revisado.reason);
    const confirmado = await m.confirmarAbertura(viewer, {
      conversaId,
      cartaoId: revisado.mensagemId,
      unitId: String(unitId),
      localExato: 'Sala 302',
      tipoServico: 'Manutenção Predial',
    });

    // Assert
    const conversa = (await m.ConversaModel.findById(conversaId).lean()) as Record<string, unknown>;
    expect(confirmado.ok).toBe(true);
    // 30 do solicitante; o cartão não conta, e o aviso de chamado aberto já é
    // de conversa ligada, onde o teto não vale mais
    expect(conversa.mensagensCount).toBeGreaterThanOrEqual(30);
    expect(await m.ConversaMensagemModel.countDocuments({ conversaId, tipo: 'cartao' })).toBe(1);
  });

  // ── nada vaza · AC-5, AC-17 ────────────────────────────────────

  it('nem a leitura da conversa nem a linha do tempo devolvem a proposta', async () => {
    // Arrange
    const conversaId = await novaConversa();
    enfileirar();
    const cartao = cartaoDe(await responder(conversaId, 'A lâmpada da sala 302 queimou.'));

    // Act
    const lida = await m.conversas.lerConversa(viewer, conversaId);
    const confirmado = await m.confirmarAbertura(viewer, {
      conversaId,
      cartaoId: cartao!.mensagemId!,
      unitId: String(unitId),
      localExato: 'Sala 302',
    });
    if (!confirmado.ok) throw new Error(confirmado.reason);
    const linha = await m.conversas.lerLinhaDoTempo(viewer, confirmado.chamadoId);

    // Assert
    for (const resultado of [lida, linha]) {
      const texto = JSON.stringify(resultado);
      expect(texto).not.toMatch(VAZAMENTO_DA_PROPOSTA);
    }
    expect(lida.ok && lida.conversa.cartaoAtualId).toBe(cartao!.mensagemId);
  });

  it('outra pessoa, mesmo Admin, recebe `nao_encontrada` nas duas ações (AC-17)', async () => {
    // Arrange
    const conversaId = await novaConversa();
    enfileirar();
    const cartao = cartaoDe(await responder(conversaId, 'A lâmpada da sala 302 queimou.'));

    // Act
    const revisado = await m.revisarAbertura(outro, conversaId);
    const confirmado = await m.confirmarAbertura(outro, {
      conversaId,
      cartaoId: cartao!.mensagemId!,
      unitId: String(unitId),
      localExato: 'Sala 302',
    });

    // Assert
    expect(revisado).toEqual({ ok: false, reason: 'nao_encontrada' });
    expect(confirmado).toEqual({ ok: false, reason: 'nao_encontrada' });
    expect(await m.ChamadoModel.countDocuments({})).toBe(0);
  });

  // ── portão de confiança · spec 0007, AC-1 a AC-5, AC-7 ─────────

  describe('portão de confiança: caminho confiante valida sozinho', () => {
    async function ligarAutonomia(limiteConfianca: number | null) {
      await m.salvarConfig(
        {
          servico: { limiteConfianca: null, amostraMinima: 30 },
          prioridade: { limiteConfianca, amostraMinima: 30 },
          autonomiaAtiva: true,
          atribuicaoAutomaticaAtiva: false,
        },
        String(adminId),
      );
    }

    it('confiança acima do limite: nasce validado, com o mesmo SLA que a classificação manual geraria (AC-1, AC-3, AC-5)', async () => {
      // Arrange
      await m.SlaConfigModel.create({
        priority: 'NORMAL',
        responseTargetMinutes: 120,
        resolutionTargetMinutes: 480,
        businessHoursOnly: true,
        isActive: true,
        version: 'v1',
      } as never);
      await ligarAutonomia(0.5); // proposta vem com prioridadeConfianca: 0.6
      const conversaId = await novaConversa();
      enfileirar();
      const cartao = cartaoDe(await responder(conversaId, 'A lâmpada da sala 302 queimou.'));
      // Quem recebe o evento e recarrega a tela precisa já ler a conversa vinculada.
      let vinculadaNoEvento: boolean | null = null;
      mockEmitToRoom.mockImplementation(async (_sala: unknown, evento: unknown) => {
        if (evento !== 'ticket:classified') return;
        const conversa = await m.ConversaModel.findById(conversaId).lean();
        vinculadaNoEvento = Boolean(conversa?.chamadoId);
      });

      // Act
      const confirmado = await m.confirmarAbertura(viewer, {
        conversaId,
        cartaoId: cartao!.mensagemId!,
        unitId: String(unitId),
        localExato: 'Sala 302',
      });

      // Assert
      expect(confirmado).toMatchObject({ ok: true, jaExistia: false });
      if (!confirmado.ok) return;
      expect(vinculadaNoEvento).toBe(true);

      const chamado = (await m.ChamadoModel.findById(confirmado.chamadoId).lean()) as Record<
        string,
        unknown
      >;
      expect(chamado.status).toBe('validado');
      expect(chamado.finalPriority).toBe('NORMAL');
      expect(chamado.iaSituacao).toBe('decidida');
      const sla = chamado.sla as Record<string, unknown>;
      expect(sla.priority).toBe('NORMAL');
      expect(sla.responseTargetMinutes).toBe(120);
      expect(sla.resolutionTargetMinutes).toBe(480);

      // O prazo esperado, calculado sem passar por `montarSnapshotSla`: direto
      // das primitivas de SLA, com os números da config deste teste e a partir
      // do `classifiedAt` gravado (a âncora que a classificação manual usa).
      expect(sla.computedAt).toEqual(chamado.classifiedAt);
      const { getBusinessCalendarConfig } = await import('@/lib/expediente-config');
      const { getActiveHolidaysForRange } = await import('@/lib/holidays');
      const { computeSlaDueDatesFromConfig } = await import('@/lib/sla-utils');
      const inicio = chamado.classifiedAt as Date;
      const calendario = await getBusinessCalendarConfig();
      const feriados = await getActiveHolidaysForRange(
        inicio,
        new Date(inicio.getTime() + 365 * 24 * 60 * 60 * 1000),
        calendario.timezone,
      );
      const esperado = computeSlaDueDatesFromConfig(inicio, 120, 480, true, calendario, feriados);
      expect(sla.responseDueAt).toEqual(esperado.responseDueAt);
      expect(sla.resolutionDueAt).toEqual(esperado.resolutionDueAt);

      // Decisão de prioridade aplicada; serviço continua sugestão (nunca precisou de triagem).
      const decisoes = await m.DecisaoIaModel.find({ chamadoId: confirmado.chamadoId }).lean();
      expect(decisoes.find((d) => d.campo === 'prioridade')?.efeito).toBe('aplicado');
      expect(decisoes.find((d) => d.campo === 'servico')?.efeito).toBe('sugestao');

      // Histórico: abertura + classificação da IA + decisao_ia por decisão, no mesmo formato da manual.
      const historico = await m.ChamadoHistoryModel.find({
        chamadoId: confirmado.chamadoId,
      }).lean();
      expect(historico.map((h) => h.action).sort()).toEqual([
        'abertura',
        'classificacao',
        'decisao_ia',
        'decisao_ia',
      ]);
      const classificacao = historico.find((h) => h.action === 'classificacao');
      expect(classificacao?.actorType).toBe('ia');
      expect(classificacao?.userId).toBeNull();
      expect(classificacao?.statusAnterior).toBe('aberto');
      expect(classificacao?.statusNovo).toBe('validado');

      // A mensagem ao solicitante confirma a prioridade, sem prometer análise de Preposto (AC-14).
      const ultima = await m.ConversaMensagemModel.findOne({ conversaId })
        .sort({ createdAt: -1, _id: -1 })
        .lean();
      expect(ultima?.texto).not.toContain('Preposto');
      expect(ultima?.texto).toContain('prioridade normal');

      // A notificação da gestão usa o texto de validado automaticamente (AC-13).
      const notificacao = await m.NotificationModel.findOne({ type: 'ticket:new' }).lean();
      expect(notificacao?.title).toContain('validado automaticamente');

      // Dispara o mesmo evento em tempo real que a classificação manual dispara (AC-5).
      const evento = mockEmitToRoom.mock.calls.find(
        (c) =>
          c[1] === 'ticket:classified' &&
          (c[2] as { ticketId?: string }).ticketId === confirmado.chamadoId,
      );
      expect(evento).toBeDefined();
      expect(evento?.[0]).toBe(`user:${String(solicitanteId)}`);
      expect(evento?.[2]).toMatchObject({ finalPriority: 'NORMAL' });
    });

    it('confiante mas sem config de SLA ativa: cai no caminho de sempre, sem lançar (AC-4)', async () => {
      // Arrange: sem SlaConfigModel.create — nenhuma config ativa para NORMAL
      await ligarAutonomia(0.5);
      const conversaId = await novaConversa();
      enfileirar();
      const cartao = cartaoDe(await responder(conversaId, 'A lâmpada da sala 302 queimou.'));

      // Act
      const confirmado = await m.confirmarAbertura(viewer, {
        conversaId,
        cartaoId: cartao!.mensagemId!,
        unitId: String(unitId),
        localExato: 'Sala 302',
      });

      // Assert
      expect(confirmado.ok).toBe(true);
      if (!confirmado.ok) return;
      const chamado = (await m.ChamadoModel.findById(confirmado.chamadoId).lean()) as Record<
        string,
        unknown
      >;
      expect(chamado.status).toBe('aberto');
      expect(chamado.finalPriority).toBeFalsy();
      const decisoes = await m.DecisaoIaModel.find({ chamadoId: confirmado.chamadoId }).lean();
      expect(decisoes.find((d) => d.campo === 'prioridade')?.efeito).toBe('sugestao');
      const historico = await m.ChamadoHistoryModel.find({
        chamadoId: confirmado.chamadoId,
      }).lean();
      expect(historico.map((h) => h.action).sort()).not.toContain('classificacao');
    });

    it('confiança abaixo do limite: nasce aberto, com sugestão (AC-2)', async () => {
      // Arrange: limite mais alto que a confiança da proposta (0.6)
      await ligarAutonomia(0.9);
      const conversaId = await novaConversa();
      enfileirar();
      const cartao = cartaoDe(await responder(conversaId, 'A lâmpada da sala 302 queimou.'));

      // Act
      const confirmado = await m.confirmarAbertura(viewer, {
        conversaId,
        cartaoId: cartao!.mensagemId!,
        unitId: String(unitId),
        localExato: 'Sala 302',
      });

      // Assert
      expect(confirmado.ok).toBe(true);
      if (!confirmado.ok) return;
      const chamado = await m.ChamadoModel.findById(confirmado.chamadoId).lean();
      expect(chamado?.status).toBe('aberto');
    });

    it('a amostra de calibragem nunca inclui uma decisão aplicada (AC-7)', async () => {
      // Arrange
      await m.SlaConfigModel.create({
        priority: 'NORMAL',
        responseTargetMinutes: 120,
        resolutionTargetMinutes: 480,
        businessHoursOnly: true,
        isActive: true,
        version: 'v1',
      } as never);
      await ligarAutonomia(0.5);
      const conversaId = await novaConversa();
      enfileirar();
      const cartao = cartaoDe(await responder(conversaId, 'A lâmpada da sala 302 queimou.'));
      const confirmado = await m.confirmarAbertura(viewer, {
        conversaId,
        cartaoId: cartao!.mensagemId!,
        unitId: String(unitId),
        localExato: 'Sala 302',
      });
      if (!confirmado.ok) throw new Error(confirmado.reason);

      // A decisão aplicada nunca passa por revisão, mas mesmo forçando
      // `revisadaEm` (como se tivesse sido revisada) ela não deve entrar.
      await m.DecisaoIaModel.updateOne(
        { chamadoId: confirmado.chamadoId, campo: 'prioridade' },
        { $set: { revisadaEm: new Date() } },
      );

      // Act
      const relatorio = await m.medirCalibragem({ servico: 1, prioridade: 1 });

      // Assert
      expect(relatorio.prioridade.totalElegivel).toBe(0);
    });
  });

  // ── atribuição automática · spec 0008, AC-1, AC-5, AC-6, AC-7, AC-10, AC-12, AC-13, AC-16 ──

  describe('atribuição automática ao técnico pelo chat', () => {
    const tecnicoId = new Types.ObjectId();

    async function prepararSla() {
      await m.SlaConfigModel.create({
        priority: 'NORMAL',
        responseTargetMinutes: 120,
        resolutionTargetMinutes: 480,
        businessHoursOnly: true,
        isActive: true,
        version: 'v1',
      } as never);
    }

    async function ligar(limiteConfianca: number | null, atribuicao = true) {
      await m.salvarConfig(
        {
          servico: { limiteConfianca: null, amostraMinima: 30 },
          prioridade: { limiteConfianca, amostraMinima: 30 },
          autonomiaAtiva: true,
          atribuicaoAutomaticaAtiva: atribuicao,
        },
        String(adminId),
      );
    }

    async function criarTecnico(extra: Record<string, unknown> = {}) {
      await m.UserModel.create({
        _id: tecnicoId,
        name: 'Carla',
        username: 'carla',
        role: 'Técnico',
        isActive: true,
        specialties: [subtypeId],
        maxAssignedTickets: 5,
        ...extra,
      } as never);
    }

    async function confirmar() {
      const conversaId = await novaConversa();
      enfileirar();
      const cartao = cartaoDe(await responder(conversaId, 'A lâmpada da sala 302 queimou.'));
      const entrada = {
        conversaId,
        cartaoId: cartao!.mensagemId!,
        unitId: String(unitId),
        localExato: 'Sala 302',
      };
      const confirmado = await m.confirmarAbertura(viewer, entrada);
      if (!confirmado.ok) throw new Error(confirmado.reason);
      return { conversaId, entrada, confirmado };
    }

    async function ultimaMensagem(conversaId: string) {
      return m.ConversaMensagemModel.findOne({ conversaId })
        .sort({ createdAt: -1, _id: -1 })
        .lean();
    }

    it('do relato ao técnico designado: chamado em atendimento, chat, gestão e técnico avisados (AC-1, AC-10, AC-12, AC-13)', async () => {
      // Arrange
      await prepararSla();
      await ligar(0.5);
      await criarTecnico();

      // Act
      const { conversaId, confirmado } = await confirmar();

      // Assert: o chamado terminou a mesma confirmação em atendimento
      const chamado = (await m.ChamadoModel.findById(confirmado.chamadoId).lean()) as Record<
        string,
        any // eslint-disable-line @typescript-eslint/no-explicit-any
      >;
      expect(chamado.status).toBe('em atendimento');
      expect(String(chamado.assignedToUserId)).toBe(String(tecnicoId));
      expect(chamado.assignedByUserId).toBeUndefined();
      expect(chamado.sla.responseStartedAt).toEqual(chamado.assignedAt);
      expect(chamado.atribuicaoAutomatica).toMatchObject({ resultado: 'atribuido' });

      // A frase final do chat diz quem foi designado, sem prometer o Preposto (AC-12)
      const ultima = await ultimaMensagem(conversaId);
      expect(ultima?.texto).toContain('o técnico Carla já foi designado');
      expect(ultima?.texto).not.toContain('Preposto');

      // A gestão lê o resultado, e nunca que "falta atribuir" (AC-13)
      const paraGestores = await m.NotificationModel.find({ type: 'ticket:new' }).lean();
      expect(paraGestores).toHaveLength(2);
      for (const n of paraGestores) {
        expect(n.title).toBe(`Chamado #${confirmado.ticketNumber} validado e atribuído a Carla`);
        expect(JSON.stringify(n)).not.toContain('falta atribuir');
      }

      // O técnico recebeu a notificação de sempre, em variante automática (AC-11)
      const doTecnico = await m.NotificationModel.find({ type: 'ticket:assigned' }).lean();
      expect(doTecnico).toHaveLength(1);
      expect(String(doTecnico[0].userId)).toBe(String(tecnicoId));
      expect(doTecnico[0].title).toContain('automaticamente');

      // O histórico conta o fato uma vez, e a decisão de técnico não vira `decisao_ia` (AC-10)
      const historico = await m.ChamadoHistoryModel.find({
        chamadoId: confirmado.chamadoId,
      }).lean();
      expect(historico.map((h) => h.action).sort()).toEqual([
        'abertura',
        'atribuicao_tecnico',
        'classificacao',
        'decisao_ia',
        'decisao_ia',
      ]);
      const atribuicao = historico.find((h) => h.action === 'atribuicao_tecnico');
      expect(atribuicao).toMatchObject({
        actorType: 'sistema',
        userId: null,
        observacoes: 'Atribuído automaticamente a Carla',
      });
      const decisao = await m.DecisaoIaModel.findOne({
        chamadoId: confirmado.chamadoId,
        campo: 'tecnico',
      }).lean();
      expect(decisao).toMatchObject({ decididoPor: 'regra', efeito: 'aplicado', confianca: null });
    });

    it('o solicitante lê o técnico na linha do tempo, sem motivo, carga nem id (AC-10, AC-16)', async () => {
      // Arrange
      await prepararSla();
      await ligar(0.5);
      await criarTecnico();
      const { confirmado } = await confirmar();

      // Act
      const linha = await m.conversas.lerLinhaDoTempo(viewer, confirmado.chamadoId);

      // Assert
      expect(linha.ok).toBe(true);
      if (!linha.ok) return;
      const historico = linha.itens.filter((i) => i.fonte === 'historico');
      const atribuicao = historico.find((i) => i.dados.action === 'atribuicao_tecnico');
      expect(atribuicao?.dados).toMatchObject({
        actorType: 'sistema',
        observacoes: 'Atribuído automaticamente a Carla',
      });
      const tudo = JSON.stringify(linha.itens);
      expect(tudo).not.toContain(String(tecnicoId));
      expect(tudo).not.toContain('atribuicaoAutomatica');
      expect(tudo).not.toContain('sem_vaga');
      expect(tudo).not.toContain('chamados ativos');
    });

    it('ninguém com a especialidade: o chamado fica validado e a gestão recebe o motivo (AC-3, AC-12, AC-13, AC-16)', async () => {
      // Arrange: nenhum técnico criado
      await prepararSla();
      await ligar(0.5);

      // Act
      const { conversaId, confirmado } = await confirmar();

      // Assert
      const chamado = (await m.ChamadoModel.findById(confirmado.chamadoId).lean()) as Record<
        string,
        any // eslint-disable-line @typescript-eslint/no-explicit-any
      >;
      expect(chamado.status).toBe('validado');
      expect(chamado.assignedToUserId).toBeUndefined();
      expect(chamado.atribuicaoAutomatica).toMatchObject({
        resultado: 'sem_tecnico',
        motivo: 'sem_especialidade',
      });

      // O solicitante não vê erro nem motivo: só que um Preposto vai designar
      const ultima = await ultimaMensagem(conversaId);
      expect(ultima?.texto).toContain('Um Preposto vai designar o técnico');
      expect(ultima?.texto).not.toContain('especialidade');

      // A gestão vê o motivo em português
      const paraGestores = await m.NotificationModel.find({ type: 'ticket:new' }).lean();
      expect(paraGestores).toHaveLength(2);
      for (const n of paraGestores) {
        expect(n.title).toBe(
          `Chamado #${confirmado.ticketNumber} validado, sem técnico disponível`,
        );
        expect(n.body).toContain('nenhum técnico ativo com a especialidade');
      }
      expect(await m.NotificationModel.countDocuments({ type: 'ticket:assigned' })).toBe(0);
    });

    it('interruptor da atribuição desligado, com a autonomia ligada: chamado validado, como na 0007 (AC-5)', async () => {
      // Arrange
      await prepararSla();
      await ligar(0.5, false);
      await criarTecnico();

      // Act
      const { conversaId, confirmado } = await confirmar();

      // Assert
      const chamado = (await m.ChamadoModel.findById(confirmado.chamadoId).lean()) as Record<
        string,
        any // eslint-disable-line @typescript-eslint/no-explicit-any
      >;
      expect(chamado.status).toBe('validado');
      expect(chamado.atribuicaoAutomatica).toBeUndefined();
      const ultima = await ultimaMensagem(conversaId);
      expect(ultima?.texto).toContain('já validada. Você acompanha o atendimento por aqui.');
      const notificacao = await m.NotificationModel.findOne({ type: 'ticket:new' }).lean();
      expect(notificacao?.title).toBe(
        `Chamado #${confirmado.ticketNumber} validado automaticamente`,
      );
    });

    it('confiança abaixo do limite: nasce aberto e o passo nunca roda, mesmo com as duas chaves ligadas (AC-6)', async () => {
      // Arrange
      await prepararSla();
      await ligar(0.9);
      await criarTecnico();

      // Act
      const { confirmado } = await confirmar();

      // Assert
      const chamado = (await m.ChamadoModel.findById(confirmado.chamadoId).lean()) as Record<
        string,
        any // eslint-disable-line @typescript-eslint/no-explicit-any
      >;
      expect(chamado.status).toBe('aberto');
      expect(chamado.assignedToUserId).toBeUndefined();
      expect(chamado.atribuicaoAutomatica).toBeUndefined();
    });

    it('clique duplo: a segunda confirmação não atribui, não avisa e não grava frase de novo (AC-7)', async () => {
      // Arrange
      await prepararSla();
      await ligar(0.5);
      await criarTecnico();
      const { conversaId, entrada, confirmado } = await confirmar();
      const avisosAntes = await m.NotificationModel.countDocuments({});
      const mensagensAntes = await m.ConversaMensagemModel.countDocuments({ conversaId });

      // Act
      const segunda = await m.confirmarAbertura(viewer, entrada);

      // Assert
      expect(segunda).toMatchObject({ ok: true, jaExistia: true, chamadoId: confirmado.chamadoId });
      expect(await m.NotificationModel.countDocuments({})).toBe(avisosAntes);
      expect(await m.ConversaMensagemModel.countDocuments({ conversaId })).toBe(mensagensAntes);
      expect(
        await m.ChamadoHistoryModel.countDocuments({
          chamadoId: confirmado.chamadoId,
          action: 'atribuicao_tecnico',
        }),
      ).toBe(1);
      expect(await m.DecisaoIaModel.countDocuments({ campo: 'tecnico' })).toBe(1);
    });
  });
});
