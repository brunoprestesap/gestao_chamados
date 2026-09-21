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

vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: vi.fn().mockResolvedValue(undefined) }));
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

type Modulos = {
  responderNaConversa: typeof import('../responder').responderNaConversa;
  revisarAbertura: typeof import('../cartao').revisarAbertura;
  confirmarAbertura: typeof import('../confirmar').confirmarAbertura;
  conversas: typeof import('@/lib/conversas');
  ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  ConversaModel: typeof import('@/models/Conversa').ConversaModel;
  ConversaMensagemModel: typeof import('@/models/ConversaMensagem').ConversaMensagemModel;
  DecisaoIaModel: typeof import('@/models/DecisaoIa').DecisaoIaModel;
  NotificationModel: typeof import('@/models/Notification').NotificationModel;
  ServiceCatalogModel: typeof import('@/models/ServiceCatalog').ServiceCatalogModel;
  ServiceSubTypeModel: typeof import('@/models/ServiceSubType').ServiceSubTypeModel;
  ServiceTypeModel: typeof import('@/models/ServiceType').ServiceTypeModel;
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
      ChamadoModel: (await import('@/models/Chamado')).ChamadoModel,
      ChamadoHistoryModel: (await import('@/models/ChamadoHistory')).ChamadoHistoryModel,
      ConversaModel: (await import('@/models/Conversa')).ConversaModel,
      ConversaMensagemModel: (await import('@/models/ConversaMensagem')).ConversaMensagemModel,
      DecisaoIaModel: (await import('@/models/DecisaoIa')).DecisaoIaModel,
      NotificationModel: (await import('@/models/Notification')).NotificationModel,
      ServiceCatalogModel: (await import('@/models/ServiceCatalog')).ServiceCatalogModel,
      ServiceSubTypeModel: (await import('@/models/ServiceSubType')).ServiceSubTypeModel,
      ServiceTypeModel: (await import('@/models/ServiceType')).ServiceTypeModel,
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
      m.NotificationModel,
      m.ServiceCatalogModel,
      m.ServiceSubTypeModel,
      m.ServiceTypeModel,
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
      expect(texto).not.toMatch(/propostaIa|confianca|"motivo"|prioridade|0\.87/);
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
});
