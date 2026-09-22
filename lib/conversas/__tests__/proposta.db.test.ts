import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

import type { PropostaEntrada } from '../proposta-store';
import type { Viewer } from '../types';

/**
 * A proposta da IA e o cartão resumo contra o MongoDB de verdade (spec 0004).
 * A gravação condicional ao rascunho e à ordem das mensagens só se prova com
 * o banco.
 *
 * covers: AC-3 (reescrita só por mensagem mais nova), AC-4 (ponteiro do
 * cartão), AC-12 (só no rascunho, ponteiro antes da mensagem), AC-13 (cartão
 * fora do teto), AC-15 (consulta da marca), AC-17 (só o dono)
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('proposta e cartão, contra o Mongo', () => {
  let ConversaModel: typeof import('@/models/Conversa').ConversaModel;
  let ConversaMensagemModel: typeof import('@/models/ConversaMensagem').ConversaMensagemModel;
  let DecisaoIaModel: typeof import('@/models/DecisaoIa').DecisaoIaModel;
  let store: typeof import('../proposta-store');
  let conversas: typeof import('../conversa-store');
  let todos: ModelDeTeste[];

  const solicitanteId = new Types.ObjectId();
  const viewer: Viewer = { userId: String(solicitanteId), role: 'Solicitante' };
  const estranho: Viewer = { userId: String(new Types.ObjectId()), role: 'Admin' };

  const payload = {
    modo: 'manual' as const,
    servico: null,
    unidade: null,
    localExato: null,
    faltando: ['tipo' as const, 'unidade' as const, 'local' as const],
  };

  function entrada(
    origemMensagemId: string,
    extra: Partial<PropostaEntrada> = {},
  ): PropostaEntrada {
    return {
      servico: {
        catalogServiceId: String(new Types.ObjectId()),
        subtypeId: String(new Types.ObjectId()),
        tipoServico: 'Manutenção Predial',
        confianca: 0.8,
        motivo: 'Motivo curto.',
      },
      prioridade: { prioridade: 'NORMAL', confianca: 0.5, motivo: 'Sem pressa.' },
      localExato: 'Sala 302',
      localForaDoPerfil: false,
      completo: true,
      llmCallId: String(new Types.ObjectId()),
      modelo: 'qwen3',
      promptVersion: '1',
      task: 'conversa.abertura',
      origemMensagemId,
      ...extra,
    };
  }

  async function rascunhoComMensagem(): Promise<{ conversaId: string; mensagemId: string }> {
    const criada = await conversas.criarConversa(viewer);
    if (!criada.ok) throw new Error('criar');
    const enviada = await conversas.enviarMensagem({
      viewer,
      conversaId: criada.conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'A lâmpada queimou.',
    });
    if (!enviada.ok) throw new Error('enviar');
    return { conversaId: criada.conversaId, mensagemId: enviada.id };
  }

  async function propostaDoBanco(conversaId: string): Promise<Record<string, unknown>> {
    const doc = (await ConversaModel.findById(conversaId).lean()) as Record<string, unknown>;
    return doc.propostaIa as Record<string, unknown>;
  }

  beforeAll(async () => {
    store = await import('../proposta-store');
    conversas = await import('../conversa-store');
    ({ ConversaModel } = await import('@/models/Conversa'));
    ({ ConversaMensagemModel } = await import('@/models/ConversaMensagem'));
    ({ DecisaoIaModel } = await import('@/models/DecisaoIa'));
    todos = [ConversaModel, ConversaMensagemModel, DecisaoIaModel] as unknown as ModelDeTeste[];
    await conectarMongoDeTeste(todos, 'severino_test_proposta');
  }, 60_000);

  afterEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  // ── gravarProposta · AC-3 ──────────────────────────────────────

  it('grava a primeira proposta e a devolve só para o dono', async () => {
    // Arrange
    const { conversaId, mensagemId } = await rascunhoComMensagem();

    // Act
    const gravada = await store.gravarProposta(viewer, conversaId, entrada(mensagemId));
    const lida = await store.lerProposta(viewer, conversaId);
    const alheia = await store.lerProposta(estranho, conversaId);

    // Assert
    expect(gravada).toEqual({ ok: true, gravada: true, origemGuardada: mensagemId });
    expect(lida.ok && lida.proposta).toMatchObject({
      localExato: 'Sala 302',
      completo: true,
      origemMensagemId: mensagemId,
      cartaoMensagemId: null,
    });
    expect(alheia).toEqual({ ok: false, reason: 'sem_permissao' });
  });

  it('resposta de mensagem mais antiga não reescreve a proposta de uma mais nova', async () => {
    // Arrange
    const { conversaId, mensagemId: antiga } = await rascunhoComMensagem();
    const nova = await conversas.enviarMensagem({
      viewer,
      conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'É na sala 305.',
    });
    if (!nova.ok) throw new Error('enviar');
    await store.gravarProposta(viewer, conversaId, entrada(nova.id, { localExato: 'Sala 305' }));

    // Act
    const atrasada = await store.gravarProposta(viewer, conversaId, entrada(antiga));

    // Assert
    expect(atrasada).toEqual({ ok: true, gravada: false, origemGuardada: nova.id });
    expect((await propostaDoBanco(conversaId)).localExato).toBe('Sala 305');
  });

  it('guarda texto do modelo começando com `$` como texto, nunca como caminho', async () => {
    // Arrange
    const { conversaId, mensagemId } = await rascunhoComMensagem();

    // Act
    await store.gravarProposta(viewer, conversaId, entrada(mensagemId, { localExato: '$previa' }));

    // Assert
    expect((await propostaDoBanco(conversaId)).localExato).toBe('$previa');
  });

  it('reescrever a proposta preserva o ponteiro do cartão', async () => {
    // Arrange
    const { conversaId, mensagemId } = await rascunhoComMensagem();
    await store.gravarProposta(viewer, conversaId, entrada(mensagemId));
    const cartao = await store.gravarCartao({
      viewer,
      conversaId,
      autor: 'sistema',
      texto: 'Resumo do chamado.',
      payload,
    });
    if (!cartao.ok) throw new Error('cartao');
    const nova = await conversas.enviarMensagem({
      viewer,
      conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'Mais um detalhe.',
    });
    if (!nova.ok) throw new Error('enviar');

    // Act
    await store.gravarProposta(viewer, conversaId, entrada(nova.id));

    // Assert
    expect(String((await propostaDoBanco(conversaId)).cartaoMensagemId)).toBe(cartao.mensagemId);
  });

  it('conversa que virou chamado não ganha proposta (AC-12)', async () => {
    // Arrange
    const { conversaId, mensagemId } = await rascunhoComMensagem();
    await ConversaModel.updateOne(
      { _id: conversaId },
      { $set: { chamadoId: new Types.ObjectId() } },
    );

    // Act
    const r = await store.gravarProposta(viewer, conversaId, entrada(mensagemId));

    // Assert
    expect(r).toEqual({ ok: false, reason: 'nao_encontrada' });
    expect(await propostaDoBanco(conversaId)).toBeNull();
  });

  it('conversa com confirmação em andamento não ganha proposta (AC-12)', async () => {
    // Arrange
    const { conversaId, mensagemId } = await rascunhoComMensagem();
    await ConversaModel.updateOne({ _id: conversaId }, { $set: { vinculandoEm: new Date() } });

    // Act
    const r = await store.gravarProposta(viewer, conversaId, entrada(mensagemId));

    // Assert
    expect(r).toEqual({ ok: false, reason: 'nao_encontrada' });
  });

  it('outra pessoa não grava proposta na conversa alheia', async () => {
    // Arrange
    const { conversaId, mensagemId } = await rascunhoComMensagem();

    // Act & Assert
    expect(await store.gravarProposta(estranho, conversaId, entrada(mensagemId))).toEqual({
      ok: false,
      reason: 'sem_permissao',
    });
  });

  // ── gravarCartao · AC-4, AC-12, AC-13 ──────────────────────────

  it('grava o cartão sem proposta, fora do teto e sem mexer na prévia', async () => {
    // Arrange
    const { conversaId } = await rascunhoComMensagem();
    const antes = (await ConversaModel.findById(conversaId).lean()) as Record<string, unknown>;

    // Act
    const r = await store.gravarCartao({
      viewer,
      conversaId,
      autor: 'sistema',
      texto: 'Resumo do chamado para você completar.',
      payload,
    });

    // Assert
    expect(r).toMatchObject({ ok: true, substituiId: null });
    if (!r.ok) return;
    const depois = (await ConversaModel.findById(conversaId).lean()) as Record<string, unknown>;
    expect(depois.mensagensCount).toBe(antes.mensagensCount);
    expect(depois.previa).toBe(antes.previa);
    expect((depois.ultimaMensagemEm as Date).getTime()).toBe(
      (antes.ultimaMensagemEm as Date).getTime(),
    );
    expect(String((depois.propostaIa as Record<string, unknown>).cartaoMensagemId)).toBe(
      r.mensagemId,
    );
    const mensagem = await ConversaMensagemModel.findById(r.mensagemId).lean();
    expect(mensagem).toMatchObject({ tipo: 'cartao', autor: 'sistema', userId: null });
    expect((mensagem?.expiresAt as Date).getTime()).toBe((antes.expiresAt as Date).getTime());
  });

  it('o segundo cartão substitui o primeiro e devolve o id dele', async () => {
    // Arrange
    const { conversaId } = await rascunhoComMensagem();
    const primeiro = await store.gravarCartao({
      viewer,
      conversaId,
      autor: 'sistema',
      texto: 'Resumo 1.',
      payload,
    });
    if (!primeiro.ok) throw new Error('primeiro');

    // Act
    const segundo = await store.gravarCartao({
      viewer,
      conversaId,
      autor: 'sistema',
      texto: 'Resumo 2.',
      payload: { ...payload, localExato: 'Sala 1', faltando: ['tipo', 'unidade'] },
    });

    // Assert
    expect(segundo).toMatchObject({ ok: true, substituiId: primeiro.mensagemId });
    const lida = await store.lerProposta(viewer, conversaId);
    expect(lida.ok && lida.cartaoAtual?.id).toBe(segundo.ok && segundo.mensagemId);
  });

  it('com origem, só grava se a proposta guardada ainda for daquela mensagem', async () => {
    // Arrange
    const { conversaId, mensagemId } = await rascunhoComMensagem();
    await store.gravarProposta(viewer, conversaId, entrada(mensagemId));

    // Act
    const outraOrigem = await store.gravarCartao({
      viewer,
      conversaId,
      autor: 'sistema',
      texto: 'Resumo.',
      payload,
      origemMensagemId: String(new Types.ObjectId()),
    });

    // Assert
    expect(outraOrigem).toEqual({ ok: false, reason: 'nao_encontrada' });
    expect(await ConversaMensagemModel.countDocuments({ conversaId, tipo: 'cartao' })).toBe(0);
  });

  it('recusa payload com campo a mais, como confiança', async () => {
    // Arrange
    const { conversaId } = await rascunhoComMensagem();

    // Act & Assert
    expect(
      await store.gravarCartao({
        viewer,
        conversaId,
        autor: 'ia',
        texto: 'Resumo.',
        payload: { ...payload, confianca: 0.9 } as never,
      }),
    ).toEqual({ ok: false, reason: 'invalida' });
  });

  it('ponteiro sem mensagem não conta como cartão atual (AC-12)', async () => {
    // Arrange
    const { conversaId } = await rascunhoComMensagem();
    await ConversaModel.updateOne(
      { _id: conversaId },
      { $set: { propostaIa: { cartaoMensagemId: new Types.ObjectId() } } },
    );

    // Act
    const lida = await store.lerProposta(viewer, conversaId);

    // Assert
    expect(lida.ok && lida.cartaoAtual).toBeNull();
  });

  // ── invalidarCartao · AC-4 ─────────────────────────────────────

  it('invalida só o cartão que ainda é o atual', async () => {
    // Arrange
    const { conversaId } = await rascunhoComMensagem();
    const cartao = await store.gravarCartao({
      viewer,
      conversaId,
      autor: 'sistema',
      texto: 'Resumo.',
      payload,
    });
    if (!cartao.ok) throw new Error('cartao');

    // Act
    await store.invalidarCartao(viewer, conversaId, String(new Types.ObjectId()));
    const depoisDoOutro = (await propostaDoBanco(conversaId)).cartaoMensagemId;
    await store.invalidarCartao(viewer, conversaId, cartao.mensagemId);

    // Assert
    expect(String(depoisDoOutro)).toBe(cartao.mensagemId);
    expect((await propostaDoBanco(conversaId)).cartaoMensagemId).toBeNull();
  });

  // ── leitura da tela · AC-5 ─────────────────────────────────────

  it('`lerConversa` devolve só o ponteiro do cartão, nunca a proposta', async () => {
    // Arrange
    const { conversaId, mensagemId } = await rascunhoComMensagem();
    await store.gravarProposta(viewer, conversaId, entrada(mensagemId));
    const cartao = await store.gravarCartao({
      viewer,
      conversaId,
      autor: 'sistema',
      texto: 'Resumo.',
      payload,
    });

    // Act
    const lida = await conversas.lerConversa(viewer, conversaId);

    // Assert
    expect(lida.ok && lida.conversa.cartaoAtualId).toBe(cartao.ok && cartao.mensagemId);
    expect(JSON.stringify(lida)).not.toMatch(/propostaIa|confianca|NORMAL|Motivo curto/);
  });

  // ── marca da IA · AC-15 ────────────────────────────────────────

  it('diz quais chamados têm decisão de serviço, numa consulta', async () => {
    // Arrange
    const comServico = new Types.ObjectId();
    const soPrioridade = new Types.ObjectId();
    const base = {
      decididoPor: 'ia',
      efeito: 'sugestao',
      motivo: 'm',
      situacao: 'sem_revisao',
      valorIa: { rotulo: 'x' },
      valorFinal: { rotulo: 'x' },
    };
    await DecisaoIaModel.create([
      { ...base, chamadoId: comServico, campo: 'servico' },
      { ...base, chamadoId: comServico, campo: 'prioridade' },
      { ...base, chamadoId: soPrioridade, campo: 'prioridade' },
    ] as never);

    // Act
    const marcados = await store.servicoSugeridoPelaIa([
      String(comServico),
      String(soPrioridade),
      'nao-e-id',
    ]);

    // Assert
    expect([...marcados]).toEqual([String(comServico)]);
  });
});
