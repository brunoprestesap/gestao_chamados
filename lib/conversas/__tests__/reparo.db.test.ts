import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

import { CONVERSA_MENSAGENS_MAX, CONVERSA_RASCUNHOS_MAX, CONVERSA_RESERVA_MS } from '../config';
import type { DecisaoEntrada, Viewer } from '../types';

/**
 * Expiração, limites, clique duplo e reparo do vínculo (spec 0002, AC-1, AC-2,
 * AC-4, AC-5, AC-16). Tudo contra o MongoDB de verdade: índice único e TTL não
 * aparecem com mock, e o reparo é o caminho menos exercitado do código.
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('expiração, limites e reparo, contra o Mongo', () => {
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
  let descartarRascunho: typeof import('../conversa-store').descartarRascunho;
  let enviarMensagem: typeof import('../conversa-store').enviarMensagem;
  let lerConversa: typeof import('../conversa-store').lerConversa;
  let listarRascunhos: typeof import('../conversa-store').listarRascunhos;

  const solicitanteId = new Types.ObjectId();
  const outroId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const typeId = new Types.ObjectId();
  const subtypeId = new Types.ObjectId();
  const catalogServiceId = new Types.ObjectId();

  const viewer: Viewer = { userId: String(solicitanteId), role: 'Solicitante' };

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

  const decisaoServico = (): DecisaoEntrada => ({
    campo: 'servico',
    decididoPor: 'ia',
    efeito: 'sugestao',
    valor: {
      catalogServiceId: String(catalogServiceId),
      subtypeId: String(subtypeId),
    },
    motivo: 'Relato de lâmpada queimada.',
    confianca: 0.9,
  });

  beforeAll(async () => {
    ({ abrirChamadoDaConversa } = await import('../abertura'));
    ({ criarConversa, descartarRascunho, enviarMensagem, lerConversa, listarRascunhos } =
      await import('../conversa-store'));

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

    await conectarMongoDeTeste(todos, 'severino_test_reparo');
  }, 60_000);

  afterEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  async function semear() {
    await UnitModel.create({ _id: unitId, name: 'Fórum' } as never);
    await UserModel.create({
      _id: solicitanteId,
      name: 'Maria',
      username: 'maria',
      role: 'Solicitante',
    } as never);
    await UserModel.create({
      _id: outroId,
      name: 'Pedro',
      username: 'pedro',
      role: 'Solicitante',
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

  async function rascunhoCom(texto = 'A lâmpada queimou') {
    const criada = await criarConversa(viewer);
    if (!criada.ok) throw new Error('não criou a conversa');
    await enviarMensagem({
      viewer,
      conversaId: criada.conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto,
    });
    return criada.conversaId;
  }

  it('o rascunho nasce com expiração 30 dias à frente e cada mensagem empurra as duas datas (AC-2)', async () => {
    await semear();
    const criada = await criarConversa(viewer);
    expect(criada.ok).toBe(true);
    if (!criada.ok) return;

    const nova = await ConversaModel.findById(criada.conversaId).lean();
    const dias = (nova!.expiresAt!.getTime() - nova!.ultimaMensagemEm.getTime()) / 86_400_000;
    expect(Math.round(dias)).toBe(30);

    const antes = nova!.expiresAt!.getTime();
    await new Promise((r) => setTimeout(r, 15));
    await enviarMensagem({
      viewer,
      conversaId: criada.conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'A lâmpada queimou',
    });

    const depois = await ConversaModel.findById(criada.conversaId).lean();
    expect(depois!.expiresAt!.getTime()).toBeGreaterThan(antes);

    // A mensagem herda a mesma data de expiração da conversa.
    const mensagem = await ConversaMensagemModel.findOne({ conversaId: criada.conversaId }).lean();
    expect(mensagem!.expiresAt!.getTime()).toBe(depois!.expiresAt!.getTime());
  });

  it('o sexto rascunho, a mensagem 31 e o texto grande demais falham sem gravar nada (AC-1)', async () => {
    await semear();

    for (let i = 0; i < CONVERSA_RASCUNHOS_MAX; i += 1) {
      expect((await criarConversa(viewer)).ok).toBe(true);
    }
    const sexto = await criarConversa(viewer);
    expect(sexto).toEqual({ ok: false, reason: 'limite_rascunhos' });
    expect(await ConversaModel.countDocuments({ solicitanteId })).toBe(CONVERSA_RASCUNHOS_MAX);

    const conversaId = String((await ConversaModel.findOne({ solicitanteId }).lean())!._id);
    for (let i = 0; i < CONVERSA_MENSAGENS_MAX; i += 1) {
      const enviada = await enviarMensagem({
        viewer,
        conversaId,
        autor: 'solicitante',
        tipo: 'texto',
        texto: `mensagem ${i}`,
      });
      expect(enviada.ok).toBe(true);
    }

    const passouDoTeto = await enviarMensagem({
      viewer,
      conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'mensagem 31',
    });
    expect(passouDoTeto).toEqual({ ok: false, reason: 'limite_mensagens' });
    expect(await ConversaMensagemModel.countDocuments({ conversaId })).toBe(CONVERSA_MENSAGENS_MAX);

    const grandeDemais = await enviarMensagem({
      viewer,
      conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'x'.repeat(2001),
    });
    expect(grandeDemais).toEqual({ ok: false, reason: 'invalida' });
    expect(await ConversaMensagemModel.countDocuments({ conversaId })).toBe(CONVERSA_MENSAGENS_MAX);
  });

  it('descartar apaga a conversa e as mensagens, e só o dono descarta (AC-2, AC-14)', async () => {
    await semear();
    const conversaId = await rascunhoCom();

    const deOutro = await descartarRascunho(
      { userId: String(outroId), role: 'Solicitante' },
      conversaId,
    );
    expect(deOutro).toEqual({ ok: false, reason: 'sem_permissao' });

    // Nem o Admin descarta rascunho alheio.
    const doAdmin = await descartarRascunho({ userId: String(outroId), role: 'Admin' }, conversaId);
    expect(doAdmin).toEqual({ ok: false, reason: 'sem_permissao' });

    expect(await descartarRascunho(viewer, conversaId)).toEqual({ ok: true });
    expect(await ConversaModel.countDocuments({ _id: conversaId })).toBe(0);
    expect(await ConversaMensagemModel.countDocuments({ conversaId })).toBe(0);
  });

  it('clique duplo: duas confirmações devolvem o mesmo chamado, a segunda com jaExistia (AC-4)', async () => {
    await semear();
    const conversaId = await rascunhoCom();

    const primeira = await abrirChamadoDaConversa({
      viewer,
      conversaId,
      dadosChamado: dadosChamado(),
      decisoes: [decisaoServico()],
    });
    const segunda = await abrirChamadoDaConversa({
      viewer,
      conversaId,
      dadosChamado: dadosChamado(),
      decisoes: [decisaoServico()],
    });

    expect(primeira.ok && segunda.ok).toBe(true);
    if (!primeira.ok || !segunda.ok) return;
    expect(segunda.chamadoId).toBe(primeira.chamadoId);
    expect(segunda.jaExistia).toBe(true);

    expect(await ChamadoModel.countDocuments({ conversaId })).toBe(1);
    expect(await DecisaoIaModel.countDocuments({ chamadoId: primeira.chamadoId })).toBe(1);
    // O histórico também não duplicou.
    expect(
      await ChamadoHistoryModel.countDocuments({
        chamadoId: primeira.chamadoId,
        action: 'abertura',
      }),
    ).toBe(1);
    expect(
      await ChamadoHistoryModel.countDocuments({
        chamadoId: primeira.chamadoId,
        action: 'decisao_ia',
      }),
    ).toBe(1);
  });

  it('duas confirmações ao mesmo tempo nunca criam dois chamados (AC-4)', async () => {
    await semear();
    const conversaId = await rascunhoCom();

    const [a, b] = await Promise.all([
      abrirChamadoDaConversa({ viewer, conversaId, dadosChamado: dadosChamado() }),
      abrirChamadoDaConversa({ viewer, conversaId, dadosChamado: dadosChamado() }),
    ]);

    expect(await ChamadoModel.countDocuments({ conversaId })).toBe(1);

    const resultados = [a, b];
    const okays = resultados.filter((r) => r.ok);
    const emAndamento = resultados.filter((r) => !r.ok && r.reason === 'confirmacao_em_andamento');
    // Ou uma recusa por reserva em andamento, ou dois resultados iguais.
    expect(okays.length + emAndamento.length).toBe(2);
    if (okays.length === 2) {
      expect(okays[0].ok && okays[1].ok && okays[0].chamadoId === okays[1].chamadoId).toBe(true);
    }
  });

  it('vínculo interrompido: a leitura seguinte completa histórico e vínculo, sem duplicar (AC-5)', async () => {
    await semear();
    const conversaId = await rascunhoCom();

    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId,
      dadosChamado: dadosChamado(),
      decisoes: [decisaoServico()],
    });
    expect(aberto.ok).toBe(true);
    if (!aberto.ok) return;

    // Simula a falha do passo 5: o chamado existe, o vínculo não foi gravado.
    await ConversaModel.updateOne(
      { _id: conversaId },
      { $set: { chamadoId: null, vinculandoEm: new Date() } },
    );
    await ChamadoHistoryModel.deleteMany({ chamadoId: aberto.chamadoId });

    const lida = await lerConversa(viewer, conversaId);
    expect(lida.ok).toBe(true);
    if (!lida.ok) return;

    expect(lida.conversa.chamadoId).toBe(aberto.chamadoId);
    expect(lida.conversa.expiresAt).toBeNull();
    expect(lida.conversa.situacao).toBe('vinculada');

    // O histórico que faltava foi refeito, uma vez só.
    expect(
      await ChamadoHistoryModel.countDocuments({ chamadoId: aberto.chamadoId, action: 'abertura' }),
    ).toBe(1);
    expect(
      await ChamadoHistoryModel.countDocuments({
        chamadoId: aberto.chamadoId,
        action: 'decisao_ia',
      }),
    ).toBe(1);

    // Ler de novo não duplica nada.
    await lerConversa(viewer, conversaId);
    expect(await ChamadoHistoryModel.countDocuments({ chamadoId: aberto.chamadoId })).toBe(2);
  });

  it('vínculo interrompido de chamado validado pela IA: o reparo também grava a classificacao (spec 0007, AC-3)', async () => {
    await semear();
    const conversaId = await rascunhoCom();

    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId,
      dadosChamado: {
        ...dadosChamado(),
        status: 'validado',
        finalPriority: 'NORMAL',
        classifiedAt: new Date(),
      },
      decisoes: [
        decisaoServico(),
        {
          campo: 'prioridade',
          decididoPor: 'ia',
          efeito: 'aplicado',
          valor: { prioridade: 'NORMAL' },
          motivo: 'Lâmpada sem risco.',
          confianca: 0.95,
        },
      ],
    });
    expect(aberto.ok).toBe(true);
    if (!aberto.ok) return;

    // Simula a queda logo depois do passo 3: sem histórico nenhum e sem vínculo.
    await ConversaModel.updateOne(
      { _id: conversaId },
      { $set: { chamadoId: null, vinculandoEm: new Date() } },
    );
    await ChamadoHistoryModel.deleteMany({ chamadoId: aberto.chamadoId });

    const lida = await lerConversa(viewer, conversaId);
    expect(lida.ok).toBe(true);

    const classificacoes = await ChamadoHistoryModel.find({
      chamadoId: aberto.chamadoId,
      action: 'classificacao',
    }).lean();
    expect(classificacoes).toHaveLength(1);
    expect(classificacoes[0].actorType).toBe('ia');
    expect(classificacoes[0].statusNovo).toBe('validado');

    // Ler de novo não duplica.
    await lerConversa(viewer, conversaId);
    expect(
      await ChamadoHistoryModel.countDocuments({
        chamadoId: aberto.chamadoId,
        action: 'classificacao',
      }),
    ).toBe(1);
  });

  it('vínculo interrompido de chamado aberto (sugestão): o reparo não inventa classificacao', async () => {
    await semear();
    const conversaId = await rascunhoCom();

    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId,
      dadosChamado: dadosChamado(),
      decisoes: [decisaoServico()],
    });
    expect(aberto.ok).toBe(true);
    if (!aberto.ok) return;

    await ConversaModel.updateOne(
      { _id: conversaId },
      { $set: { chamadoId: null, vinculandoEm: new Date() } },
    );
    await ChamadoHistoryModel.deleteMany({ chamadoId: aberto.chamadoId });

    await lerConversa(viewer, conversaId);

    expect(
      await ChamadoHistoryModel.countDocuments({
        chamadoId: aberto.chamadoId,
        action: 'classificacao',
      }),
    ).toBe(0);
  });

  it('reserva abandonada volta a rascunho, com expiração restaurada e decisões órfãs apagadas (AC-5, AC-2)', async () => {
    await semear();
    const conversaId = await rascunhoCom();

    // Reserva de mais de 2 minutos, sem chamado nenhum, e uma decisão órfã.
    const reservadoId = new Types.ObjectId();
    await ConversaModel.updateOne(
      { _id: conversaId },
      {
        $set: {
          chamadoIdReservado: reservadoId,
          vinculandoEm: new Date(Date.now() - CONVERSA_RESERVA_MS - 1000),
          expiresAt: null,
        },
      },
    );
    await ConversaMensagemModel.updateMany({ conversaId }, { $set: { expiresAt: null } });
    await DecisaoIaModel.create({
      chamadoId: reservadoId,
      campo: 'servico',
      decididoPor: 'ia',
      efeito: 'sugestao',
      valorIa: { rotulo: 'Troca de lâmpada', catalogServiceId, subtypeId },
      valorFinal: { rotulo: 'Troca de lâmpada', catalogServiceId, subtypeId },
      motivo: 'Decisão órfã de uma reserva que nunca virou chamado.',
      situacao: 'sem_revisao',
    } as never);

    const lista = await listarRascunhos(viewer);
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;

    const rascunho = lista.rascunhos.find((r) => r.id === conversaId);
    expect(rascunho).toBeTruthy();
    expect(rascunho!.confirmando).toBe(false);
    expect(rascunho!.expiresAt).toBeTruthy();

    const conversa = await ConversaModel.findById(conversaId).lean();
    expect(conversa!.vinculandoEm).toBeNull();
    expect(conversa!.expiresAt).toBeTruthy();

    const mensagem = await ConversaMensagemModel.findOne({ conversaId }).lean();
    expect(mensagem!.expiresAt).toBeTruthy();

    // As decisões daquele id reservado sumiram.
    expect(await DecisaoIaModel.countDocuments({ chamadoId: reservadoId })).toBe(0);
  });

  it('a reserva em andamento aparece na lista marcada como confirmando (AC-5)', async () => {
    await semear();
    const conversaId = await rascunhoCom();

    await ConversaModel.updateOne(
      { _id: conversaId },
      {
        $set: {
          chamadoIdReservado: new Types.ObjectId(),
          vinculandoEm: new Date(),
          expiresAt: null,
        },
      },
    );

    const lista = await listarRascunhos(viewer);
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;

    const rascunho = lista.rascunhos.find((r) => r.id === conversaId);
    expect(rascunho?.confirmando).toBe(true);
  });

  it('um processo lento que ressurge não grava por cima de um reparo já feito (AC-5, AC-2)', async () => {
    await semear();
    const conversaId = await rascunhoCom();

    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId,
      dadosChamado: dadosChamado(),
    });
    expect(aberto.ok).toBe(true);
    if (!aberto.ok) return;

    // O reparo já aconteceu e a conversa está ligada. Um passo de vínculo antigo,
    // com outro id reservado, encontra a condição falsa e não grava nada.
    const idVelho = new Types.ObjectId();
    await ConversaModel.updateOne(
      { _id: conversaId, chamadoIdReservado: idVelho, chamadoId: null },
      { $set: { chamadoId: idVelho, expiresAt: new Date() } },
    );

    const conversa = await ConversaModel.findById(conversaId).lean();
    expect(String(conversa!.chamadoId)).toBe(aberto.chamadoId);
    // A conversa nunca fica com chamadoId e expiresAt ao mesmo tempo.
    expect(conversa!.expiresAt).toBeNull();
  });
});
