import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

import type { DecisaoEntrada, Viewer } from '../types';

/**
 * Conferência no banco, correção do solicitante, veredito da gestão e falha do
 * gancho (spec 0002, AC-7 a AC-10, AC-16).
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('decisões, vereditos e correções, contra o Mongo', () => {
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
  let aplicarVeredito: typeof import('../decisoes').aplicarVeredito;
  let decisoesOcultas: typeof import('../decisoes').decisoesOcultas;
  let lerDecisoes: typeof import('../decisoes').lerDecisoes;
  let registrarDecisao: typeof import('../decisoes').registrarDecisao;
  let resolverDecisao: typeof import('../decisoes').resolverDecisao;
  let prioridadeValidadaPelaIa: typeof import('../proposta-store').prioridadeValidadaPelaIa;

  const solicitanteId = new Types.ObjectId();
  const prepostoId = new Types.ObjectId();
  const admin2Id = new Types.ObjectId();
  const tecnicoId = new Types.ObjectId();
  const naoTecnicoId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const typeId = new Types.ObjectId();
  const subtypeId = new Types.ObjectId();
  const outroSubtypeId = new Types.ObjectId();
  const catalogServiceId = new Types.ObjectId();

  const viewer: Viewer = { userId: String(solicitanteId), role: 'Solicitante' };
  const preposto: Viewer = { userId: String(prepostoId), role: 'Preposto' };

  const dadosChamado = () => ({
    titulo: 'Lâmpada queimada',
    status: 'aberto',
    solicitanteId,
    unitId,
    localExato: 'Sala 204',
    tipoServico: 'Manutenção Predial',
    grauUrgencia: 'Normal',
    subtypeId,
    catalogServiceId,
  });

  const decisaoPrioridade = (prioridade = 'NORMAL'): DecisaoEntrada => ({
    campo: 'prioridade',
    decididoPor: 'ia',
    efeito: 'sugestao',
    valor: { prioridade } as never,
    motivo: 'Sem risco à segurança.',
    confianca: 0.7,
  });

  beforeAll(async () => {
    ({ abrirChamadoDaConversa } = await import('../abertura'));
    ({ criarConversa, enviarMensagem } = await import('../conversa-store'));
    ({ aplicarVeredito, decisoesOcultas, lerDecisoes, registrarDecisao, resolverDecisao } =
      await import('../decisoes'));
    ({ prioridadeValidadaPelaIa } = await import('../proposta-store'));

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

    await conectarMongoDeTeste(todos, 'severino_test_decisoes');
  }, 60_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  async function semear() {
    await UnitModel.create({ _id: unitId, name: 'Fórum' } as never);
    await UserModel.create([
      { _id: solicitanteId, name: 'Maria', username: 'maria', role: 'Solicitante' },
      { _id: prepostoId, name: 'Ana Preposto', username: 'ana', role: 'Preposto' },
      { _id: admin2Id, name: 'Carlos Admin', username: 'carlos', role: 'Admin' },
      { _id: tecnicoId, name: 'João Técnico', username: 'joao', role: 'Técnico' },
      { _id: naoTecnicoId, name: 'Rita', username: 'rita', role: 'Solicitante' },
    ] as never);
    await ServiceTypeModel.create({ _id: typeId, name: 'Manutenção Predial' } as never);
    await ServiceSubTypeModel.create([
      { _id: subtypeId, typeId, name: 'Elétrica' },
      { _id: outroSubtypeId, typeId, name: 'Hidráulica' },
    ] as never);
    await ServiceCatalogModel.create({
      _id: catalogServiceId,
      code: 'MANU-0001',
      name: 'Troca de lâmpada',
      typeId,
      subtypeId,
    } as never);
  }

  async function chamadoComDecisao(decisoes: DecisaoEntrada[]) {
    const criada = await criarConversa(viewer);
    if (!criada.ok) throw new Error('não criou');
    await enviarMensagem({
      viewer,
      conversaId: criada.conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'A lâmpada queimou',
    });
    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId: criada.conversaId,
      dadosChamado: dadosChamado(),
      decisoes,
    });
    if (!aberto.ok) throw new Error(`não abriu: ${aberto.reason}`);
    return aberto.chamadoId;
  }

  it('id inventado pelo modelo é reprovado, sem criar chamado, decisão nem histórico (AC-7)', async () => {
    await semear();
    const criada = await criarConversa(viewer);
    if (!criada.ok) return;
    await enviarMensagem({
      viewer,
      conversaId: criada.conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'A lâmpada queimou',
    });

    // Serviço que não existe no catálogo.
    const inexistente = await abrirChamadoDaConversa({
      viewer,
      conversaId: criada.conversaId,
      dadosChamado: dadosChamado(),
      decisoes: [
        {
          campo: 'servico',
          decididoPor: 'ia',
          efeito: 'sugestao',
          valor: {
            catalogServiceId: String(new Types.ObjectId()),
            subtypeId: String(subtypeId),
          },
          motivo: 'Serviço inventado pelo modelo.',
        },
      ],
    });
    expect(inexistente).toEqual({ ok: false, reason: 'invalida' });

    // Serviço que existe mas não pertence ao subtipo informado.
    const subtipoErrado = await abrirChamadoDaConversa({
      viewer,
      conversaId: criada.conversaId,
      dadosChamado: dadosChamado(),
      decisoes: [
        {
          campo: 'servico',
          decididoPor: 'ia',
          efeito: 'sugestao',
          valor: {
            catalogServiceId: String(catalogServiceId),
            subtypeId: String(outroSubtypeId),
          },
          motivo: 'Serviço de outro subtipo.',
        },
      ],
    });
    expect(subtipoErrado).toEqual({ ok: false, reason: 'invalida' });

    // Usuário que existe mas não é Técnico.
    const naoEhTecnico = await abrirChamadoDaConversa({
      viewer,
      conversaId: criada.conversaId,
      dadosChamado: dadosChamado(),
      decisoes: [
        {
          campo: 'tecnico',
          decididoPor: 'ia',
          efeito: 'sugestao',
          valor: { tecnicoId: String(naoTecnicoId) },
          motivo: 'Usuário que não é técnico.',
        },
      ],
    });
    expect(naoEhTecnico).toEqual({ ok: false, reason: 'invalida' });

    expect(await ChamadoModel.countDocuments({})).toBe(0);
    expect(await DecisaoIaModel.countDocuments({})).toBe(0);
    expect(await ChamadoHistoryModel.countDocuments({})).toBe(0);
  });

  it('confirmar com valor diferente do proposto nasce corrigida, com correção do solicitante (AC-8)', async () => {
    await semear();
    const criada = await criarConversa(viewer);
    if (!criada.ok) return;
    await enviarMensagem({
      viewer,
      conversaId: criada.conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'A lâmpada queimou',
    });

    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId: criada.conversaId,
      dadosChamado: dadosChamado(),
      decisoes: [
        {
          ...decisaoPrioridade('NORMAL'),
          valorConfirmado: { prioridade: 'ALTA' } as never,
        },
      ],
    });
    expect(aberto.ok).toBe(true);
    if (!aberto.ok) return;

    const decisao = await DecisaoIaModel.findOne({ chamadoId: aberto.chamadoId }).lean();
    expect(decisao!.situacao).toBe('corrigida');
    expect((decisao!.valorIa as { prioridade?: string }).prioridade).toBe('NORMAL');
    expect((decisao!.valorFinal as { prioridade?: string }).prioridade).toBe('ALTA');
    expect(decisao!.correcoes).toHaveLength(1);
    expect(decisao!.correcoes[0].origem).toBe('solicitante');
    expect(String(decisao!.correcoes[0].userId)).toBe(String(solicitanteId));
  });

  it('registrar a mesma decisão duas vezes falha como ja_existe (AC-6)', async () => {
    await semear();
    const chamadoId = await chamadoComDecisao([decisaoPrioridade('NORMAL')]);

    const repetida = await registrarDecisao({
      chamadoId,
      campo: 'prioridade',
      decididoPor: 'ia',
      efeito: 'sugestao',
      valor: { prioridade: 'ALTA' } as never,
      motivo: 'Segunda decisão do mesmo campo.',
    });
    expect(repetida).toEqual({ ok: false, reason: 'ja_existe' });
    expect(await DecisaoIaModel.countDocuments({ chamadoId })).toBe(1);
  });

  it('veredito da gestão: igual confirma, diferente corrige, e voltar ao valor da IA confirma (AC-9)', async () => {
    await semear();
    const chamadoId = await chamadoComDecisao([decisaoPrioridade('NORMAL')]);

    // Mesmo valor: marca a revisão, sem criar correção.
    const igual = await resolverDecisao({
      viewer: preposto,
      chamadoId,
      campo: 'prioridade',
      valor: { prioridade: 'NORMAL' } as never,
      origem: 'gestao',
    });
    expect(igual).toEqual({ ok: true, situacao: 'confirmada', houveCorrecao: false });

    let decisao = await DecisaoIaModel.findOne({ chamadoId }).lean();
    expect(decisao!.correcoes).toHaveLength(0);
    expect(decisao!.revisadaEm).toBeTruthy();
    expect(String(decisao!.revisadaPorUserId)).toBe(String(prepostoId));

    let chamado = await ChamadoModel.findById(chamadoId).lean();
    expect(chamado!.iaSituacao).toBe('revisada');

    // Valor diferente: corrige e registra no histórico.
    const diferente = await resolverDecisao({
      viewer: preposto,
      chamadoId,
      campo: 'prioridade',
      valor: { prioridade: 'ALTA' } as never,
      origem: 'gestao',
      motivo: 'O caso é mais urgente do que parecia.',
    });
    expect(diferente).toEqual({ ok: true, situacao: 'corrigida', houveCorrecao: true });

    decisao = await DecisaoIaModel.findOne({ chamadoId }).lean();
    expect(decisao!.correcoes).toHaveLength(1);
    expect(decisao!.correcoes[0].origem).toBe('gestao');
    expect((decisao!.valorFinal as { prioridade?: string }).prioridade).toBe('ALTA');

    const correcaoNoHistorico = await ChamadoHistoryModel.findOne({
      chamadoId,
      action: 'correcao_ia',
    }).lean();
    expect(correcaoNoHistorico).toBeTruthy();
    expect(correcaoNoHistorico!.actorType).toBe('usuario');
    expect(String(correcaoNoHistorico!.userId)).toBe(String(prepostoId));
    expect(correcaoNoHistorico!.observacoes).toBe('prioridade: NORMAL → ALTA');
    // Nunca confiança nem motivo no histórico.
    expect(correcaoNoHistorico!.observacoes).not.toContain('0.7');
    expect(correcaoNoHistorico!.observacoes).not.toContain('urgente do que parecia');

    // Um segundo gestor volta ao valor da IA: volta a confirmada, com duas correções.
    const devolta = await resolverDecisao({
      viewer: { userId: String(admin2Id), role: 'Admin' },
      chamadoId,
      campo: 'prioridade',
      valor: { prioridade: 'NORMAL' } as never,
      origem: 'gestao',
    });
    expect(devolta).toEqual({ ok: true, situacao: 'confirmada', houveCorrecao: true });

    decisao = await DecisaoIaModel.findOne({ chamadoId }).lean();
    expect(decisao!.correcoes).toHaveLength(2);
    expect(decisao!.situacao).toBe('confirmada');
    expect((decisao!.valorFinal as { prioridade?: string }).prioridade).toBe('NORMAL');

    chamado = await ChamadoModel.findById(chamadoId).lean();
    expect(chamado!.iaSituacao).toBe('revisada');
  });

  it('duas correções simultâneas entram as duas e a situação combina com o valor final (AC-9, AC-16)', async () => {
    await semear();
    const chamadoId = await chamadoComDecisao([decisaoPrioridade('NORMAL')]);

    await Promise.all([
      resolverDecisao({
        viewer: preposto,
        chamadoId,
        campo: 'prioridade',
        valor: { prioridade: 'ALTA' } as never,
        origem: 'gestao',
      }),
      resolverDecisao({
        viewer: { userId: String(admin2Id), role: 'Admin' },
        chamadoId,
        campo: 'prioridade',
        valor: { prioridade: 'EMERGENCIAL' } as never,
        origem: 'gestao',
      }),
    ]);

    const decisao = await DecisaoIaModel.findOne({ chamadoId }).lean();
    expect(decisao!.correcoes).toHaveLength(2);

    const finalPrioridade = (decisao!.valorFinal as { prioridade?: string }).prioridade;
    const daIa = (decisao!.valorIa as { prioridade?: string }).prioridade;
    // A situação gravada tem que bater com o valor final que ficou.
    expect(decisao!.situacao).toBe(finalPrioridade === daIa ? 'confirmada' : 'corrigida');
  });

  it('só Preposto e Admin resolvem e leem as decisões (AC-14)', async () => {
    await semear();
    const chamadoId = await chamadoComDecisao([decisaoPrioridade('NORMAL')]);

    expect(
      await resolverDecisao({
        viewer,
        chamadoId,
        campo: 'prioridade',
        valor: { prioridade: 'ALTA' } as never,
        origem: 'gestao',
      }),
    ).toEqual({ ok: false, reason: 'sem_permissao' });

    // O técnico atribuído lê a conversa, mas não lê o detalhe da decisão.
    expect(await lerDecisoes({ userId: String(tecnicoId), role: 'Técnico' }, chamadoId)).toEqual({
      ok: false,
      reason: 'sem_permissao',
    });

    const doPreposto = await lerDecisoes(preposto, chamadoId);
    expect(doPreposto.ok).toBe(true);
    if (!doPreposto.ok) return;
    expect(doPreposto.decisoes).toHaveLength(1);
    expect(doPreposto.decisoes[0].confianca).toBeCloseTo(0.7);
    expect(doPreposto.decisoes[0].motivo).toBe('Sem risco à segurança.');
  });

  it('chamado sem decisão: o gancho sai em silêncio, sem gravar e sem logar (AC-9, AC-10)', async () => {
    await semear();
    const chamado = await ChamadoModel.create({
      ...dadosChamado(),
      ticket_number: 'CHM-2026-09999',
    } as never);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await aplicarVeredito({
      viewer: preposto,
      chamadoId: String(chamado._id),
      vereditos: [{ campo: 'prioridade', valor: { prioridade: 'ALTA' } as never }],
    });

    expect(log).not.toHaveBeenCalled();
    expect(await DecisaoIaModel.countDocuments({})).toBe(0);
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois!.iaSituacao).toBeNull();
  });

  it('falha ao gravar o veredito não quebra a ação e loga [conversa] sem texto de relato (AC-10)', async () => {
    await semear();
    const chamadoId = await chamadoComDecisao([decisaoPrioridade('NORMAL')]);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(DecisaoIaModel, 'updateOne').mockRejectedValueOnce(
      new Error('conexão perdida') as never,
    );

    // A promessa resolve: o gancho engole a falha.
    await expect(
      aplicarVeredito({
        viewer: preposto,
        chamadoId,
        vereditos: [{ campo: 'prioridade', valor: { prioridade: 'ALTA' } as never }],
      }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalled();
    const linha = JSON.stringify(log.mock.calls);
    expect(linha).toContain('[conversa]');
    expect(linha).toContain(chamadoId);
    expect(linha).toContain('prioridade');
    expect(linha).not.toContain('A lâmpada queimou');
  });

  it('decisoesOcultas só esconde prioridade em sugestao; aplicado fica visível (spec 0007, AC-6)', async () => {
    await semear();
    const sugerido = await chamadoComDecisao([decisaoPrioridade('NORMAL')]);
    const aplicado = await chamadoComDecisao([
      { ...decisaoPrioridade('ALTA'), efeito: 'aplicado' },
    ]);

    const ocultasSugerido = await decisoesOcultas(sugerido);
    expect(ocultasSugerido.size).toBe(1);

    const ocultasAplicado = await decisoesOcultas(aplicado);
    expect(ocultasAplicado.size).toBe(0);
  });

  it('o selo de validado pela IA continua depois de uma correção (spec 0007, AC-15)', async () => {
    await semear();
    const chamadoId = await chamadoComDecisao([
      { ...decisaoPrioridade('NORMAL'), efeito: 'aplicado' },
    ]);

    const antes = await prioridadeValidadaPelaIa([chamadoId]);
    expect(antes.has(chamadoId)).toBe(true);

    // A gestão corrige a prioridade: `iaSituacao` vira 'revisada', mas o
    // `efeito` da decisão nunca muda — é isso que o selo usa, nunca `iaSituacao`.
    await resolverDecisao({
      viewer: preposto,
      chamadoId,
      campo: 'prioridade',
      valor: { prioridade: 'EMERGENCIAL' } as never,
      origem: 'gestao',
      motivo: 'Reavaliado.',
    });

    const chamado = await ChamadoModel.findById(chamadoId).lean();
    expect(chamado!.iaSituacao).toBe('revisada');

    const depois = await prioridadeValidadaPelaIa([chamadoId]);
    expect(depois.has(chamadoId)).toBe(true);

    const decisao = await DecisaoIaModel.findOne({ chamadoId }).lean();
    expect(decisao!.efeito).toBe('aplicado');
  });
});

/**
 * `confirmarDecisao` e `camposPendentesDeConfirmacao` (spec 0009, AC-5): a
 * gestão confirma uma decisão da IA que já valeu sozinha, sem corrigir nada.
 */
rodar('confirmarDecisao e camposPendentesDeConfirmacao, contra o Mongo', () => {
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
  let camposPendentesDeConfirmacao: typeof import('../decisoes').camposPendentesDeConfirmacao;
  let confirmarDecisao: typeof import('../decisoes').confirmarDecisao;
  let resolverDecisao: typeof import('../decisoes').resolverDecisao;

  const solicitanteId = new Types.ObjectId();
  const prepostoId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const typeId = new Types.ObjectId();
  const subtypeId = new Types.ObjectId();
  const catalogServiceId = new Types.ObjectId();

  const viewer: Viewer = { userId: String(solicitanteId), role: 'Solicitante' };
  const preposto: Viewer = { userId: String(prepostoId), role: 'Preposto' };

  const dadosChamado = () => ({
    titulo: 'Lâmpada queimada',
    status: 'aberto',
    solicitanteId,
    unitId,
    localExato: 'Sala 204',
    tipoServico: 'Manutenção Predial',
    grauUrgencia: 'Normal',
    subtypeId,
    catalogServiceId,
  });

  beforeAll(async () => {
    ({ abrirChamadoDaConversa } = await import('../abertura'));
    ({ criarConversa, enviarMensagem } = await import('../conversa-store'));
    ({ camposPendentesDeConfirmacao, confirmarDecisao, resolverDecisao } =
      await import('../decisoes'));

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

    await conectarMongoDeTeste(todos, 'severino_test_confirmar_decisao');
  }, 60_000);

  afterEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  async function semear() {
    await UnitModel.create({ _id: unitId, name: 'Fórum' } as never);
    await UserModel.create([
      { _id: solicitanteId, name: 'Maria', username: 'maria', role: 'Solicitante' },
      { _id: prepostoId, name: 'Ana Preposto', username: 'ana', role: 'Preposto' },
    ] as never);
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

  /** Chamado do chat, nascido validado com a prioridade e o serviço que a IA decidiu sozinha. */
  async function chamadoDecididoSozinho() {
    const criada = await criarConversa(viewer);
    if (!criada.ok) throw new Error('não criou');
    await enviarMensagem({
      viewer,
      conversaId: criada.conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'A lâmpada queimou',
    });
    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId: criada.conversaId,
      dadosChamado: { ...dadosChamado(), status: 'validado', finalPriority: 'NORMAL' },
      decisoes: [
        {
          campo: 'prioridade',
          decididoPor: 'ia',
          efeito: 'aplicado',
          valor: { prioridade: 'NORMAL' } as never,
          motivo: 'Sem risco à segurança.',
          confianca: 0.91,
        },
        {
          campo: 'servico',
          decididoPor: 'ia',
          efeito: 'aplicado',
          valor: {
            catalogServiceId: String(catalogServiceId),
            subtypeId: String(subtypeId),
          } as never,
          motivo: 'Lâmpada queimada é troca de lâmpada.',
          confianca: 0.95,
        },
      ],
    });
    if (!aberto.ok) throw new Error(`não abriu: ${aberto.reason}`);
    return aberto.chamadoId;
  }

  it('confirma a decisão pendente: grava revisadaEm, revisadaPorUserId e a entrada confirmacao_ia', async () => {
    await semear();
    const chamadoId = await chamadoDecididoSozinho();

    const resultado = await confirmarDecisao({ viewer: preposto, chamadoId, campo: 'prioridade' });
    expect(resultado).toEqual({ ok: true, situacao: 'confirmada' });

    const decisao = await DecisaoIaModel.findOne({ chamadoId, campo: 'prioridade' }).lean();
    expect(decisao!.situacao).toBe('confirmada');
    expect(decisao!.revisadaEm).toBeTruthy();
    expect(String(decisao!.revisadaPorUserId)).toBe(String(prepostoId));
    // Confirmar nunca regrava valorFinal nem acrescenta correção.
    expect(decisao!.correcoes).toHaveLength(0);
    expect((decisao!.valorFinal as { prioridade?: string }).prioridade).toBe('NORMAL');

    const entrada = await ChamadoHistoryModel.findOne({
      chamadoId,
      action: 'confirmacao_ia',
    }).lean();
    expect(entrada).toBeTruthy();
    expect(String(entrada!.userId)).toBe(String(prepostoId));
    expect(entrada!.actorType).toBe('usuario');
    expect(String(entrada!.decisaoIaId)).toBe(String(decisao!._id));
  });

  it('confirmar duas vezes (corrida) só grava uma vez: a segunda não bate no filtro e não duplica o histórico', async () => {
    await semear();
    const chamadoId = await chamadoDecididoSozinho();

    const [primeira, segunda] = await Promise.all([
      confirmarDecisao({ viewer: preposto, chamadoId, campo: 'prioridade' }),
      confirmarDecisao({ viewer: preposto, chamadoId, campo: 'prioridade' }),
    ]);
    const resultados = [primeira, segunda];

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok && r.reason === 'nada_a_confirmar')).toHaveLength(1);

    const entradas = await ChamadoHistoryModel.countDocuments({
      chamadoId,
      action: 'confirmacao_ia',
    });
    expect(entradas).toBe(1);
  });

  it('uma decisão de sugestão (efeito: sugestao) nunca é confirmada', async () => {
    await semear();
    const criada = await criarConversa(viewer);
    if (!criada.ok) return;
    await enviarMensagem({
      viewer,
      conversaId: criada.conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'A lâmpada queimou',
    });
    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId: criada.conversaId,
      dadosChamado: dadosChamado(),
      decisoes: [
        {
          campo: 'prioridade',
          decididoPor: 'ia',
          efeito: 'sugestao',
          valor: { prioridade: 'NORMAL' } as never,
          motivo: 'Sem risco à segurança.',
          confianca: 0.6,
        },
      ],
    });
    expect(aberto.ok).toBe(true);
    if (!aberto.ok) return;

    const resultado = await confirmarDecisao({
      viewer: preposto,
      chamadoId: aberto.chamadoId,
      campo: 'prioridade',
    });
    expect(resultado).toEqual({ ok: false, reason: 'nada_a_confirmar' });
  });

  it('uma decisão já revisada (confirmada ou corrigida) não é confirmada de novo', async () => {
    await semear();
    const chamadoId = await chamadoDecididoSozinho();

    await resolverDecisao({
      viewer: preposto,
      chamadoId,
      campo: 'prioridade',
      valor: { prioridade: 'ALTA' } as never,
      origem: 'gestao',
      motivo: 'Reavaliado como mais urgente.',
    });

    const resultado = await confirmarDecisao({ viewer: preposto, chamadoId, campo: 'prioridade' });
    expect(resultado).toEqual({ ok: false, reason: 'nada_a_confirmar' });
  });

  it('divergente: o valor final da decisão não é mais o valor atual do chamado, recusa sem gravar', async () => {
    await semear();
    const chamadoId = await chamadoDecididoSozinho();

    // O chamado mudou por fora (outra correção sem passar pelo veredito),
    // então a decisão de prioridade ficou desatualizada em relação a ele.
    await ChamadoModel.updateOne({ _id: chamadoId }, { $set: { finalPriority: 'ALTA' } });

    const resultado = await confirmarDecisao({ viewer: preposto, chamadoId, campo: 'prioridade' });
    expect(resultado).toEqual({ ok: false, reason: 'divergente' });

    const decisao = await DecisaoIaModel.findOne({ chamadoId, campo: 'prioridade' }).lean();
    expect(decisao!.situacao).toBe('sem_revisao');
    expect(decisao!.revisadaEm).toBeNull();
    expect(await ChamadoHistoryModel.countDocuments({ chamadoId, action: 'confirmacao_ia' })).toBe(
      0,
    );
  });

  it('só Preposto e Admin confirmam', async () => {
    await semear();
    const chamadoId = await chamadoDecididoSozinho();

    const resultado = await confirmarDecisao({ viewer, chamadoId, campo: 'prioridade' });
    expect(resultado).toEqual({ ok: false, reason: 'sem_permissao' });
  });

  it('camposPendentesDeConfirmacao lista só os campos aplicado + sem_revisao, dentre os pedidos', async () => {
    await semear();
    const chamadoId = await chamadoDecididoSozinho();

    // Sem filtro: os dois campos que nasceram aplicados e pendentes.
    expect(new Set(await camposPendentesDeConfirmacao(chamadoId))).toEqual(
      new Set(['prioridade', 'servico']),
    );

    // Confirmando um deles, some da lista.
    await confirmarDecisao({ viewer: preposto, chamadoId, campo: 'prioridade' });
    expect(await camposPendentesDeConfirmacao(chamadoId)).toEqual(['servico']);

    // Filtrado por um campo que não está mais pendente: lista vazia.
    expect(await camposPendentesDeConfirmacao(chamadoId, ['prioridade'])).toEqual([]);

    // Filtrado pelo campo que ainda está pendente: continua aparecendo.
    expect(await camposPendentesDeConfirmacao(chamadoId, ['servico'])).toEqual(['servico']);
  });

  it('camposPendentesDeConfirmacao devolve lista vazia para um chamado sem decisão', async () => {
    await semear();
    const chamado = await ChamadoModel.create({
      ...dadosChamado(),
      ticket_number: 'CHM-2026-08888',
    } as never);

    expect(await camposPendentesDeConfirmacao(String(chamado._id))).toEqual([]);
  });
});
