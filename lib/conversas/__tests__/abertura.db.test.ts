import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  indicesDe,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

import type { DecisaoEntrada, Viewer } from '../types';

/**
 * Caminho feliz completo contra o MongoDB de verdade (spec 0002, AC-16).
 * Índice único, TTL e corrida não aparecem com mock.
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('abertura da conversa, contra o Mongo', () => {
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  let ConversaModel: typeof import('@/models/Conversa').ConversaModel;
  let ConversaMensagemModel: typeof import('@/models/ConversaMensagem').ConversaMensagemModel;
  let DecisaoIaModel: typeof import('@/models/DecisaoIa').DecisaoIaModel;
  let ServiceCatalogModel: typeof import('@/models/ServiceCatalog').ServiceCatalogModel;
  let ServiceSubTypeModel: typeof import('@/models/ServiceSubType').ServiceSubTypeModel;
  let ServiceTypeModel: typeof import('@/models/ServiceType').ServiceTypeModel;
  let UserModel: typeof import('@/models/user.model').UserModel;
  let UnitModel: typeof import('@/models/unit').UnitModel;
  let todos: ModelDeTeste[];
  let abrirChamadoDaConversa: typeof import('../abertura').abrirChamadoDaConversa;
  let criarConversa: typeof import('../conversa-store').criarConversa;
  let enviarMensagem: typeof import('../conversa-store').enviarMensagem;

  const solicitanteId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const typeId = new Types.ObjectId();
  const subtypeId = new Types.ObjectId();
  const catalogServiceId = new Types.ObjectId();
  const tecnicoId = new Types.ObjectId();

  const viewer: Viewer = { userId: String(solicitanteId), role: 'Solicitante' };

  const dadosChamado = () => ({
    titulo: 'Lâmpada queimada na sala 204',
    descricao: 'A lâmpada do fundo parou de acender.',
    status: 'aberto',
    solicitanteId,
    unitId,
    localExato: 'Sala 204, Fórum',
    tipoServico: 'Manutenção Predial',
    grauUrgencia: 'Normal',
    subtypeId,
    catalogServiceId,
  });

  const decisaoServico = (): DecisaoEntrada => ({
    campo: 'servico',
    decididoPor: 'ia',
    efeito: 'sugestao',
    valor: {
      catalogServiceId: String(catalogServiceId),
      subtypeId: String(subtypeId),
      tipoServico: 'Manutenção Predial',
    },
    motivo: 'O relato descreve lâmpada queimada, que é troca de luminária.',
    confianca: 0.87,
    meta: {
      model: 'qwen3',
      promptVersion: 'v1',
      task: 'abertura.classificar',
      callId: String(new Types.ObjectId()),
    },
  });

  const decisaoPrioridade = (): DecisaoEntrada => ({
    campo: 'prioridade',
    decididoPor: 'regra',
    efeito: 'sugestao',
    valor: { prioridade: 'NORMAL' },
    motivo: 'Sem risco à segurança e sem parada de serviço essencial.',
  });

  beforeAll(async () => {
    // Importação dinâmica: `tests/mongo-test-env` precisa ter apontado o
    // `MONGODB_URI` para o banco de teste antes de `lib/db` ser avaliado.
    ({ abrirChamadoDaConversa } = await import('../abertura'));
    ({ criarConversa, enviarMensagem } = await import('../conversa-store'));

    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ChamadoHistoryModel } = await import('@/models/ChamadoHistory'));
    ({ ConversaModel } = await import('@/models/Conversa'));
    ({ ConversaMensagemModel } = await import('@/models/ConversaMensagem'));
    ({ DecisaoIaModel } = await import('@/models/DecisaoIa'));
    ({ ServiceCatalogModel } = await import('@/models/ServiceCatalog'));
    ({ ServiceSubTypeModel } = await import('@/models/ServiceSubType'));
    ({ ServiceTypeModel } = await import('@/models/ServiceType'));
    ({ UserModel } = await import('@/models/user.model'));
    ({ UnitModel } = await import('@/models/unit'));

    todos = [
      ChamadoModel,
      ChamadoHistoryModel,
      ConversaModel,
      ConversaMensagemModel,
      DecisaoIaModel,
      ServiceCatalogModel,
      ServiceSubTypeModel,
      ServiceTypeModel,
      UserModel,
      UnitModel,
    ] as unknown as ModelDeTeste[];

    await conectarMongoDeTeste(todos, 'severino_test_abertura');
  }, 60_000);

  afterEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  /** Catálogo, unidade e usuários que a conferência no banco vai procurar. */
  async function semear() {
    await UnitModel.create({ _id: unitId, name: 'Fórum de Macapá' } as never);
    await UserModel.create({
      _id: solicitanteId,
      name: 'Maria Solicitante',
      username: 'maria',
      role: 'Solicitante',
    } as never);
    await UserModel.create({
      _id: tecnicoId,
      name: 'João Técnico',
      username: 'joao',
      role: 'Técnico',
    } as never);
    await ServiceTypeModel.create({ _id: typeId, name: 'Manutenção Predial' } as never);
    await ServiceSubTypeModel.create({ _id: subtypeId, typeId, name: 'Elétrica' } as never);
    await ServiceCatalogModel.create({
      _id: catalogServiceId,
      code: 'MANU-0001',
      name: 'Troca de lâmpada',
      typeId,
      subtypeId,
    } as never);
  }

  it('do rascunho ao chamado: conversa ligada, decisões e histórico (AC-1, AC-3, AC-6, AC-11)', async () => {
    await semear();

    const criada = await criarConversa(viewer);
    expect(criada.ok).toBe(true);
    const conversaId = criada.ok ? criada.conversaId : '';

    for (const texto of ['A lâmpada da sala 204 queimou', 'É a do fundo', 'Pode ser hoje?']) {
      const enviada = await enviarMensagem({
        viewer,
        conversaId,
        autor: 'solicitante',
        tipo: 'texto',
        texto,
      });
      expect(enviada.ok).toBe(true);
    }

    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId,
      dadosChamado: dadosChamado(),
      decisoes: [decisaoServico(), decisaoPrioridade()],
    });

    expect(aberto.ok).toBe(true);
    if (!aberto.ok) return;
    expect(aberto.jaExistia).toBe(false);
    expect(aberto.ticketNumber).toMatch(/^CHM-\d{4}-\d{5}$/);

    // O chamado nasceu ligado à conversa, pelo chat, com a IA só sugerindo.
    const chamado = (await ChamadoModel.findById(aberto.chamadoId).lean()) as Record<
      string,
      unknown
    > | null;
    expect(chamado).toBeTruthy();
    expect(String(chamado!.conversaId)).toBe(conversaId);
    expect(chamado!.canalAbertura).toBe('chat');
    expect(chamado!.iaSituacao).toBe('sugerida');

    // A conversa ficou ligada e perdeu a expiração, junto com as mensagens.
    const conversa = (await ConversaModel.findById(conversaId).lean()) as Record<
      string,
      unknown
    > | null;
    expect(String(conversa!.chamadoId)).toBe(aberto.chamadoId);
    expect(conversa!.expiresAt).toBeNull();
    expect(conversa!.vinculandoEm).toBeNull();
    expect(conversa!.mensagensCount).toBe(3);
    expect(conversa!.previa).toBe('A lâmpada da sala 204 queimou');

    const mensagens = (await ConversaMensagemModel.find({ conversaId }).lean()) as Record<
      string,
      unknown
    >[];
    expect(mensagens).toHaveLength(3);
    expect(mensagens.every((m) => m.expiresAt === null)).toBe(true);

    // As duas decisões, ainda sem revisão, com o rótulo lido do banco.
    const decisoes = (await DecisaoIaModel.find({ chamadoId: aberto.chamadoId })
      .sort({ campo: 1 })
      .lean()) as Record<string, unknown>[];
    expect(decisoes).toHaveLength(2);

    const servico = decisoes.find((d) => d.campo === 'servico')!;
    expect(servico.situacao).toBe('sem_revisao');
    expect(servico.decididoPor).toBe('ia');
    expect(servico.confianca).toBeCloseTo(0.87);
    expect(servico.modelo).toBe('qwen3');
    expect((servico.valorIa as Record<string, unknown>).rotulo).toBe('Troca de lâmpada');
    expect(servico.llmCallId).toBeTruthy();

    const prioridade = decisoes.find((d) => d.campo === 'prioridade')!;
    expect(prioridade.decididoPor).toBe('regra');
    // Com `regra`, os cinco campos de modelo ficam nulos (AC-6).
    expect(prioridade.confianca).toBeNull();
    expect(prioridade.modelo).toBeNull();
    expect(prioridade.promptVersion).toBeNull();
    expect(prioridade.task).toBeNull();
    expect(prioridade.llmCallId).toBeNull();

    // Histórico: uma abertura e uma decisao_ia por decisão, sem confiança nem motivo.
    const historico = (await ChamadoHistoryModel.find({
      chamadoId: aberto.chamadoId,
    }).lean()) as Record<string, unknown>[];
    expect(historico.filter((h) => h.action === 'abertura')).toHaveLength(1);

    const daIa = historico.filter((h) => h.action === 'decisao_ia');
    expect(daIa).toHaveLength(2);
    expect(daIa.find((h) => h.actorType === 'ia')).toBeTruthy();
    expect(daIa.find((h) => h.actorType === 'sistema')).toBeTruthy();
    for (const entrada of daIa) {
      expect(entrada.userId).toBeNull();
      expect(entrada.decisaoIaId).toBeTruthy();
      expect(String(entrada.observacoes)).not.toContain('0.87');
      expect(String(entrada.observacoes)).not.toContain('lâmpada queimada, que é');
    }
    expect(daIa.map((h) => String(h.observacoes)).sort()).toEqual([
      'prioridade: NORMAL',
      'serviço: Troca de lâmpada',
    ]);
  });

  it('os índices únicos e os TTL das coleções novas existem (AC-16, AC-2)', async () => {
    const conversas = await indicesDe(ConversaModel);
    const mensagens = await indicesDe(ConversaMensagemModel);
    const decisoes = await indicesDe(DecisaoIaModel);
    const chamados = await indicesDe(ChamadoModel);

    const temTtl = (indices: Record<string, unknown>[]) =>
      indices.some(
        (i) => (i.key as Record<string, number>).expiresAt === 1 && i.expireAfterSeconds === 0,
      );
    expect(temTtl(conversas)).toBe(true);
    expect(temTtl(mensagens)).toBe(true);

    const unicoParcial = (indices: Record<string, unknown>[], campo: string) =>
      indices.some(
        (i) =>
          (i.key as Record<string, number>)[campo] === 1 &&
          i.unique === true &&
          i.partialFilterExpression,
      );
    expect(unicoParcial(conversas, 'chamadoId')).toBe(true);
    expect(unicoParcial(chamados, 'conversaId')).toBe(true);

    expect(
      decisoes.some((i) => {
        const key = i.key as Record<string, number>;
        return key.chamadoId === 1 && key.campo === 1 && i.unique === true;
      }),
    ).toBe(true);
  });
});
