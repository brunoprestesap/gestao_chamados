import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

import type { DecisaoEntrada, Viewer } from '../types';

/**
 * A decisão `ativo` contra o Mongo de verdade (spec 0014): a observação da
 * abertura com o código (também no reparo), a decisão gravada fora da IA, as
 * exclusões da revisão e a correção pela gestão por `vincularAtivoAoChamado`.
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 *
 * covers: AC-8, AC-10, AC-11, AC-12
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('decisão ativo (banco real)', () => {
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
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
  let lerConversa: typeof import('../conversa-store').lerConversa;
  let registrarDecisao: typeof import('../decisoes').registrarDecisao;
  let camposPendentesDeConfirmacao: typeof import('../decisoes').camposPendentesDeConfirmacao;
  let temDecisoes: typeof import('../decisoes').temDecisoes;
  let vincularAtivoAoChamado: typeof import('@/lib/ativos/vinculo').vincularAtivoAoChamado;
  let idsDoRecorte: typeof import('@/lib/gestao/revisao-ia-filtro').idsDoRecorte;

  const solicitanteId = new Types.ObjectId();
  const prepostoId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const typeId = new Types.ObjectId();
  const subtypeId = new Types.ObjectId();
  const catalogServiceId = new Types.ObjectId();
  const categoriaId = new Types.ObjectId();
  const ativoA = new Types.ObjectId();
  const ativoB = new Types.ObjectId();

  const viewer: Viewer = { userId: String(solicitanteId), role: 'Solicitante' };

  const dadosChamado = (extra: Record<string, unknown> = {}) => ({
    titulo: 'Ar pingando',
    status: 'aberto',
    solicitanteId,
    unitId,
    localExato: 'Sala 302',
    tipoServico: 'Ar-Condicionado',
    grauUrgencia: 'Normal',
    subtypeId,
    catalogServiceId,
    ...extra,
  });

  const decisaoServico = (): DecisaoEntrada => ({
    campo: 'servico',
    decididoPor: 'ia',
    efeito: 'sugestao',
    valor: { catalogServiceId: String(catalogServiceId), subtypeId: String(subtypeId) },
    motivo: 'Relato de ar pingando.',
    confianca: 0.9,
  });

  const decisaoAtivo = (chamadoId: string, conversaId: string, ativoId = String(ativoA)) =>
    registrarDecisao({
      chamadoId,
      conversaId,
      campo: 'ativo',
      decididoPor: 'regra',
      efeito: 'aplicado',
      valor: { ativoId },
      motivo: 'Código do equipamento citado no relato.',
      confianca: null,
    });

  beforeAll(async () => {
    ({ abrirChamadoDaConversa } = await import('../abertura'));
    ({ criarConversa, enviarMensagem, lerConversa } = await import('../conversa-store'));
    ({ registrarDecisao, camposPendentesDeConfirmacao, temDecisoes } = await import('../decisoes'));
    ({ vincularAtivoAoChamado } = await import('@/lib/ativos/vinculo'));
    ({ idsDoRecorte } = await import('@/lib/gestao/revisao-ia-filtro'));

    ({ AtivoModel } = await import('@/models/Ativo'));
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
      AtivoModel,
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

    await conectarMongoDeTeste(todos, 'severino_test_decisao_ativo');
  }, 60_000);

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await UnitModel.create({ _id: unitId, name: 'Fórum' } as never);
    await UserModel.create({
      _id: solicitanteId,
      name: 'Maria',
      username: 'maria',
      role: 'Solicitante',
    } as never);
    await ServiceTypeModel.create({ _id: typeId, name: 'Ar-condicionado' } as never);
    await ServiceSubTypeModel.create({ _id: subtypeId, typeId, name: 'Split' } as never);
    await ServiceCatalogModel.create({
      _id: catalogServiceId,
      code: 'ARCO-0002',
      name: 'Reparo de split',
      typeId,
      subtypeId,
    } as never);
    const base = { categoriaId, tierManutencao: 'A', status: 'em_operacao', descricao: 'Split' };
    await AtivoModel.collection.insertMany([
      { ...base, _id: ativoA, codigo: '11997' },
      { ...base, _id: ativoB, codigo: '11998' },
    ]);
  });

  afterEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  async function rascunho() {
    const criada = await criarConversa(viewer);
    if (!criada.ok) throw new Error('não criou a conversa');
    await enviarMensagem({
      viewer,
      conversaId: criada.conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'O ar de tombo 11997 pinga',
    });
    return criada.conversaId;
  }

  async function abrirComAtivo(decisoes: DecisaoEntrada[] = [decisaoServico()]) {
    const conversaId = await rascunho();
    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId,
      dadosChamado: dadosChamado({ ativoId: ativoA }),
      decisoes,
      codigoAtivo: '11997',
    });
    if (!aberto.ok) throw new Error('não abriu');
    const decisao = await decisaoAtivo(aberto.chamadoId, conversaId);
    expect(decisao.ok).toBe(true);
    return { conversaId, chamadoId: aberto.chamadoId };
  }

  describe('abertura com ativo (AC-8, AC-10)', () => {
    it('a entrada abertura leva o código do equipamento', async () => {
      const { chamadoId } = await abrirComAtivo();
      const abertura = await ChamadoHistoryModel.findOne({ chamadoId, action: 'abertura' }).lean();
      expect(abertura?.observacoes).toBe('Chamado aberto pela conversa · Equipamento 11997');
    });

    it('sem ativo a observação é a de sempre', async () => {
      const conversaId = await rascunho();
      const aberto = await abrirChamadoDaConversa({
        viewer,
        conversaId,
        dadosChamado: dadosChamado(),
      });
      if (!aberto.ok) throw new Error('não abriu');
      const abertura = await ChamadoHistoryModel.findOne({
        chamadoId: aberto.chamadoId,
        action: 'abertura',
      }).lean();
      expect(abertura?.observacoes).toBe('Chamado aberto pela conversa');
    });

    it('a decisão é da regra, aplicada, sem confiança, com o código no rótulo', async () => {
      const { chamadoId } = await abrirComAtivo();
      const d = await DecisaoIaModel.findOne({ chamadoId, campo: 'ativo' }).lean();
      expect(d).toMatchObject({
        decididoPor: 'regra',
        efeito: 'aplicado',
        confianca: null,
        situacao: 'sem_revisao',
      });
      expect(String(d!.valorIa.ativoId)).toBe(String(ativoA));
      expect(d!.valorIa.rotulo).toBe('11997');
      expect(d!.valorFinal.rotulo).toBe('11997');
    });

    it('recusa um ativo que não existe', async () => {
      const { chamadoId, conversaId } = await abrirComAtivo();
      await DecisaoIaModel.deleteMany({ chamadoId, campo: 'ativo' });
      const r = await decisaoAtivo(chamadoId, conversaId, String(new Types.ObjectId()));
      expect(r).toEqual({ ok: false, reason: 'invalida' });
    });

    it('o reparo lê o código do próprio chamado', async () => {
      // Arrange: simula a falha do passo 5, com o histórico perdido
      const { conversaId, chamadoId } = await abrirComAtivo();
      await ConversaModel.updateOne(
        { _id: conversaId },
        { $set: { chamadoId: null, vinculandoEm: new Date() } },
      );
      await ChamadoHistoryModel.deleteMany({ chamadoId });

      // Act
      const lida = await lerConversa(viewer, conversaId);

      // Assert
      expect(lida.ok && lida.conversa.situacao).toBe('vinculada');
      const abertura = await ChamadoHistoryModel.findOne({ chamadoId, action: 'abertura' }).lean();
      expect(abertura?.observacoes).toBe('Chamado aberto pela conversa · Equipamento 11997');
      // Só a decisão de serviço vira `decisao_ia`; a de ativo não (AC-11)
      expect(await ChamadoHistoryModel.countDocuments({ chamadoId, action: 'decisao_ia' })).toBe(1);
    });
  });

  describe('a decisão ativo não contamina a IA (AC-11)', () => {
    it('não gera entrada decisao_ia na abertura', async () => {
      const { chamadoId } = await abrirComAtivo();
      const historico = await ChamadoHistoryModel.find({ chamadoId, action: 'decisao_ia' }).lean();
      expect(historico.map((h) => h.observacoes)).toEqual(['serviço: Reparo de split']);
    });

    it('chamado com decisão de serviço e de ativo continua com decisão para a gestão', async () => {
      const { chamadoId } = await abrirComAtivo();
      expect(await temDecisoes(chamadoId)).toBe(true);
    });

    it('chamado só com a decisão ativo fica sem_ia, fora dos recortes, sem pendência e sem decisão para a gestão', async () => {
      // Arrange
      const { chamadoId } = await abrirComAtivo([]);

      // Act
      const chamado = await ChamadoModel.findById(chamadoId).select('iaSituacao').lean();
      const semRevisao = await idsDoRecorte('sem_revisao');
      const pendentes = await camposPendentesDeConfirmacao(chamadoId);
      const pedindoAtivo = await camposPendentesDeConfirmacao(chamadoId, ['ativo']);
      const contaComoDecisao = await temDecisoes(chamadoId);

      // Assert
      expect(chamado?.iaSituacao).toBe('sem_ia');
      expect(semRevisao).not.toContain(chamadoId);
      expect(pendentes).toEqual([]);
      expect(pedindoAtivo).toEqual([]);
      expect(contaComoDecisao).toBe(false);
    });
  });

  describe('correção pela gestão (AC-12)', () => {
    it('trocar e depois tirar vira duas correções da gestão, sem mexer na IA', async () => {
      // Arrange
      const { chamadoId } = await abrirComAtivo();
      const antes = await ChamadoModel.findById(chamadoId).select('iaSituacao').lean();

      // Act
      const troca = await vincularAtivoAoChamado(chamadoId, String(ativoB), String(prepostoId));
      const remove = await vincularAtivoAoChamado(chamadoId, null, String(prepostoId));

      // Assert
      expect(troca).toEqual({ ok: true, mudou: true });
      expect(remove).toEqual({ ok: true, mudou: true });
      const d = await DecisaoIaModel.findOne({ chamadoId, campo: 'ativo' }).lean();
      expect(d!.situacao).toBe('corrigida');
      expect(d!.valorFinal).toMatchObject({ ativoId: null, rotulo: 'Nenhum equipamento' });
      expect(d!.correcoes.map((c) => [c.anterior.rotulo, c.novo.rotulo, c.origem])).toEqual([
        ['11997', '11998', 'gestao'],
        ['11998', 'Nenhum equipamento', 'gestao'],
      ]);
      const depois = await ChamadoModel.findById(chamadoId).select('iaSituacao').lean();
      expect(depois?.iaSituacao).toBe(antes?.iaSituacao);
      expect(await ChamadoHistoryModel.countDocuments({ chamadoId, action: 'correcao_ia' })).toBe(
        0,
      );
      expect(await ChamadoHistoryModel.countDocuments({ chamadoId, action: 'vinculo_ativo' })).toBe(
        2,
      );
      expect(await idsDoRecorte('corrigidos')).not.toContain(chamadoId);
    });

    it('voltar ao ativo sugerido devolve a decisão a sem_revisao', async () => {
      const { chamadoId } = await abrirComAtivo();
      await vincularAtivoAoChamado(chamadoId, String(ativoB), String(prepostoId));
      await vincularAtivoAoChamado(chamadoId, String(ativoA), String(prepostoId));
      const d = await DecisaoIaModel.findOne({ chamadoId, campo: 'ativo' }).lean();
      expect(d!.situacao).toBe('sem_revisao');
      expect(d!.correcoes).toHaveLength(2);
    });

    it('chamado sem decisão ativo continua sem ela depois do vínculo', async () => {
      const conversaId = await rascunho();
      const aberto = await abrirChamadoDaConversa({
        viewer,
        conversaId,
        dadosChamado: dadosChamado(),
      });
      if (!aberto.ok) throw new Error('não abriu');
      const r = await vincularAtivoAoChamado(aberto.chamadoId, String(ativoA), String(prepostoId));
      expect(r).toEqual({ ok: true, mudou: true });
      expect(
        await DecisaoIaModel.countDocuments({ chamadoId: aberto.chamadoId, campo: 'ativo' }),
      ).toBe(0);
    });
  });
});
