import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

import { LINHA_DO_TEMPO_MAX } from '../config';
import type { DecisaoEntrada, Viewer } from '../types';

/**
 * Leitura combinada, visibilidade por perfil, mensagem depois da abertura e
 * autorização negada (spec 0002, AC-11 a AC-14).
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('linha do tempo e visibilidade, contra o Mongo', () => {
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ChamadoCommentModel: typeof import('@/models/ChamadoComment').ChamadoCommentModel;
  let ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  let ConversaModel: typeof import('@/models/Conversa').ConversaModel;
  let ConversaMensagemModel: typeof import('@/models/ConversaMensagem').ConversaMensagemModel;
  let DecisaoIaModel: typeof import('@/models/DecisaoIa').DecisaoIaModel;
  let NotificationModel: typeof import('@/models/Notification').NotificationModel;
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
  let lerLinhaDoTempo: typeof import('../linha-do-tempo').lerLinhaDoTempo;
  let resolverDecisao: typeof import('../decisoes').resolverDecisao;

  const solicitanteId = new Types.ObjectId();
  const outroId = new Types.ObjectId();
  const prepostoId = new Types.ObjectId();
  const tecnicoId = new Types.ObjectId();
  const outroTecnicoId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const typeId = new Types.ObjectId();
  const subtypeId = new Types.ObjectId();
  const catalogServiceId = new Types.ObjectId();

  const viewer: Viewer = { userId: String(solicitanteId), role: 'Solicitante' };
  const preposto: Viewer = { userId: String(prepostoId), role: 'Preposto' };
  const tecnico: Viewer = { userId: String(tecnicoId), role: 'Técnico' };

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
      tipoServico: 'Manutenção Predial',
    } as never,
    motivo: 'Lâmpada queimada é troca de lâmpada.',
    confianca: 0.81,
  });

  const decisaoPrioridade = (): DecisaoEntrada => ({
    campo: 'prioridade',
    decididoPor: 'ia',
    efeito: 'sugestao',
    valor: { prioridade: 'NORMAL' } as never,
    motivo: 'Sem risco à segurança, então prioridade normal.',
    confianca: 0.73,
  });

  beforeAll(async () => {
    ({ abrirChamadoDaConversa } = await import('../abertura'));
    ({ criarConversa, enviarMensagem, lerConversa } = await import('../conversa-store'));
    ({ lerLinhaDoTempo } = await import('../linha-do-tempo'));
    ({ resolverDecisao } = await import('../decisoes'));

    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ChamadoCommentModel } = await import('@/models/ChamadoComment'));
    ({ ChamadoHistoryModel } = await import('@/models/ChamadoHistory'));
    ({ ConversaModel } = await import('@/models/Conversa'));
    ({ ConversaMensagemModel } = await import('@/models/ConversaMensagem'));
    ({ DecisaoIaModel } = await import('@/models/DecisaoIa'));
    ({ NotificationModel } = await import('@/models/Notification'));
    ({ ServiceCatalogModel } = await import('@/models/ServiceCatalog'));
    ({ ServiceSubTypeModel } = await import('@/models/ServiceSubType'));
    ({ ServiceTypeModel } = await import('@/models/ServiceType'));
    ({ UserModel } = await import('@/models/user.model'));
    ({ UnitModel } = await import('@/models/unit'));

    todos = [
      ChamadoModel,
      ChamadoCommentModel,
      ChamadoHistoryModel,
      ConversaModel,
      ConversaMensagemModel,
      DecisaoIaModel,
      NotificationModel,
      ServiceCatalogModel,
      ServiceSubTypeModel,
      ServiceTypeModel,
      UserModel,
      UnitModel,
    ] as unknown as ModelDeTeste[];

    await conectarMongoDeTeste(todos, 'severino_test_timeline');
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
      { _id: outroId, name: 'Pedro', username: 'pedro', role: 'Solicitante' },
      { _id: prepostoId, name: 'Ana', username: 'ana', role: 'Preposto' },
      { _id: tecnicoId, name: 'João Técnico', username: 'joao', role: 'Técnico' },
      { _id: outroTecnicoId, name: 'Luís Técnico', username: 'luis', role: 'Técnico' },
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

  /** Conversa com duas mensagens, virada em chamado com uma decisão. */
  async function chamadoPronto() {
    const criada = await criarConversa(viewer);
    if (!criada.ok) throw new Error('não criou');
    for (const texto of ['A lâmpada queimou', 'É a do fundo']) {
      await enviarMensagem({
        viewer,
        conversaId: criada.conversaId,
        autor: 'solicitante',
        tipo: 'texto',
        texto,
      });
    }
    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId: criada.conversaId,
      dadosChamado: dadosChamado(),
      decisoes: [decisaoServico(), decisaoPrioridade()],
    });
    if (!aberto.ok) throw new Error('não abriu');
    return { conversaId: criada.conversaId, chamadoId: aberto.chamadoId };
  }

  it('junta mensagens, comentários e histórico em ordem, escondendo o interno do solicitante (AC-12)', async () => {
    await semear();
    const { chamadoId } = await chamadoPronto();

    await ChamadoModel.updateOne({ _id: chamadoId }, { $set: { assignedToUserId: tecnicoId } });
    await ChamadoCommentModel.create([
      { chamadoId, userId: solicitanteId, content: 'Alguma novidade?', visibility: 'publico' },
      { chamadoId, userId: prepostoId, content: 'Peça em falta no estoque', visibility: 'interno' },
    ] as never);

    // Uma correção da gestão, para ter também uma entrada correcao_ia.
    await resolverDecisao({
      viewer: preposto,
      chamadoId,
      campo: 'prioridade',
      valor: { prioridade: 'ALTA' } as never,
      origem: 'gestao',
      motivo: 'Sala de audiência, precisa de luz hoje.',
    });

    const doPreposto = await lerLinhaDoTempo(preposto, chamadoId);
    expect(doPreposto.ok).toBe(true);
    if (!doPreposto.ok) return;

    expect(doPreposto.truncado).toBe(false);
    // 2 mensagens + 2 comentários + 2 de histórico (abertura e a decisao_ia do
    // serviço). A decisão de prioridade e a correção dela ficam escondidas de
    // todos, até da gestão (spec 0004, AC-15).
    expect(doPreposto.itens).toHaveLength(6);
    expect(doPreposto.itens.filter((i) => i.fonte === 'mensagem')).toHaveLength(2);
    expect(doPreposto.itens.filter((i) => i.fonte === 'comentario')).toHaveLength(2);

    // Ordem por data, sempre crescente.
    const datas = doPreposto.itens.map((i) => i.em.getTime());
    expect([...datas].sort((a, b) => a - b)).toEqual(datas);

    // O solicitante não vê o comentário interno.
    const doSolicitante = await lerLinhaDoTempo(viewer, chamadoId);
    expect(doSolicitante.ok).toBe(true);
    if (!doSolicitante.ok) return;
    expect(doSolicitante.itens).toHaveLength(5);
    expect(
      doSolicitante.itens.filter(
        (i) => i.fonte === 'comentario' && i.dados.visibility === 'interno',
      ),
    ).toHaveLength(0);

    // As entradas da IA aparecem para os dois, sem confiança e sem motivo.
    for (const linha of [doPreposto, doSolicitante]) {
      const daIa = linha.itens.filter(
        (i) => i.fonte === 'historico' && ['decisao_ia', 'correcao_ia'].includes(i.dados.action),
      );
      expect(daIa).toHaveLength(1);
      for (const item of daIa) {
        if (item.fonte !== 'historico') continue;
        expect(item.dados.observacoes).toContain('Troca de lâmpada');
        expect(item.dados.observacoes).not.toContain('0.81');
        expect(item.dados.observacoes).not.toContain('prioridade');
        expect(item.dados.observacoes).not.toContain('0.73');
        expect(item.dados.observacoes).not.toContain('Sem risco à segurança');
        expect(item.dados.observacoes).not.toContain('Sala de audiência');
        expect(item.dados.decisaoIaId).toBeTruthy();
      }
    }

    // A entrada decisao_ia não tem usuário e se diz da IA (AC-11).
    const decisao = doPreposto.itens.find(
      (i) => i.fonte === 'historico' && i.dados.action === 'decisao_ia',
    );
    expect(decisao?.fonte === 'historico' && decisao.dados.userId).toBeNull();
    expect(decisao?.fonte === 'historico' && decisao.dados.actorType).toBe('ia');
  });

  it('com mais de 300 itens numa fonte devolve os mais recentes e marca truncado (AC-12)', async () => {
    await semear();
    const { chamadoId } = await chamadoPronto();

    const base = Date.now();
    await ChamadoCommentModel.create(
      Array.from({ length: LINHA_DO_TEMPO_MAX + 20 }, (_, i) => ({
        chamadoId,
        userId: solicitanteId,
        content: `comentário ${i}`,
        visibility: 'publico',
        createdAt: new Date(base + i * 1000),
        updatedAt: new Date(base + i * 1000),
      })) as never,
    );

    const linha = await lerLinhaDoTempo(preposto, chamadoId);
    expect(linha.ok).toBe(true);
    if (!linha.ok) return;

    expect(linha.truncado).toBe(true);
    const comentarios = linha.itens.filter((i) => i.fonte === 'comentario');
    expect(comentarios).toHaveLength(LINHA_DO_TEMPO_MAX);
    // Os devolvidos são os mais recentes: o primeiro corte sumiu.
    const textos = comentarios.map((c) => (c.fonte === 'comentario' ? c.dados.content : ''));
    expect(textos).not.toContain('comentário 0');
    expect(textos).toContain(`comentário ${LINHA_DO_TEMPO_MAX + 19}`);
  });

  it('mensagem depois da abertura vira comentário público, com histórico e notificação (AC-13)', async () => {
    await semear();
    const { conversaId, chamadoId } = await chamadoPronto();
    await ChamadoModel.updateOne({ _id: chamadoId }, { $set: { assignedToUserId: tecnicoId } });

    const doSolicitante = await enviarMensagem({
      viewer,
      conversaId,
      autor: 'solicitante',
      tipo: 'texto',
      texto: 'Ainda está apagada',
    });
    expect(doSolicitante.ok).toBe(true);
    if (!doSolicitante.ok) return;
    expect(doSolicitante.destino).toBe('comentario');

    const comentario = await ChamadoCommentModel.findById(doSolicitante.id).lean();
    expect(comentario!.content).toBe('Ainda está apagada');
    expect(comentario!.visibility).toBe('publico');

    expect(await ChamadoHistoryModel.countDocuments({ chamadoId, action: 'comentario' })).toBe(1);
    // O técnico atribuído recebeu a notificação.
    expect(await NotificationModel.countDocuments({ userId: tecnicoId })).toBe(1);
    // Não virou mensagem da conversa.
    expect(await ConversaMensagemModel.countDocuments({ conversaId })).toBe(2);

    // Mensagem da IA continua indo para a conversa.
    const daIa = await enviarMensagem({
      viewer,
      conversaId,
      autor: 'ia',
      tipo: 'texto',
      texto: 'O técnico João foi acionado.',
    });
    expect(daIa.ok).toBe(true);
    if (!daIa.ok) return;
    expect(daIa.destino).toBe('conversa');
    expect(await ConversaMensagemModel.countDocuments({ conversaId })).toBe(3);
  });

  it('rascunho é só do dono, nem o Admin lê; conversa ligada é lida pelo técnico atribuído (AC-14)', async () => {
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

    expect(
      await lerConversa({ userId: String(outroId), role: 'Solicitante' }, criada.conversaId),
    ).toEqual({ ok: false, reason: 'sem_permissao' });
    expect(
      await lerConversa({ userId: String(outroId), role: 'Admin' }, criada.conversaId),
    ).toEqual({ ok: false, reason: 'sem_permissao' });

    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId: criada.conversaId,
      dadosChamado: dadosChamado(),
    });
    if (!aberto.ok) return;
    await ChamadoModel.updateOne(
      { _id: aberto.chamadoId },
      { $set: { assignedToUserId: tecnicoId } },
    );

    // Depois do vínculo: solicitante, gestão e o técnico atribuído leem.
    expect((await lerConversa(viewer, criada.conversaId)).ok).toBe(true);
    expect((await lerConversa(preposto, criada.conversaId)).ok).toBe(true);
    expect((await lerConversa(tecnico, criada.conversaId)).ok).toBe(true);

    // Quem deixou de ser o técnico atribuído deixa de ler.
    expect(
      await lerConversa({ userId: String(outroTecnicoId), role: 'Técnico' }, criada.conversaId),
    ).toEqual({ ok: false, reason: 'sem_permissao' });

    // E na linha do tempo vale a mesma regra.
    expect(
      await lerLinhaDoTempo({ userId: String(outroId), role: 'Solicitante' }, aberto.chamadoId),
    ).toEqual({ ok: false, reason: 'sem_permissao' });
    expect((await lerLinhaDoTempo(tecnico, aberto.chamadoId)).ok).toBe(true);
  });
});
