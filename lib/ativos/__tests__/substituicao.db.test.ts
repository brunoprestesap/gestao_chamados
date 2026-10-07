import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

vi.mock('@/lib/dal', () => ({
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
}));

/**
 * Candidatos à substituição no Mongo de verdade (spec 0015): a leitura em lote
 * dá os mesmos números da ficha, a ficha só mostra a situação para a gestão, e
 * a dispensa é condicional (a primeira de duas vale, a vencida é sobrescrita,
 * o histórico que falha desfaz sem apagar a dispensa de outra pessoa).
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 *
 * covers: AC-1, AC-3, AC-4, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('candidatos à substituição (banco real)', () => {
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let AtivoHistoryModel: typeof import('@/models/AtivoHistory').AtivoHistoryModel;
  let CategoriaAtivoModel: typeof import('@/models/CategoriaAtivo').CategoriaAtivoModel;
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let LocalizacaoModel: typeof import('@/models/Localizacao').LocalizacaoModel;
  let ServiceSubTypeModel: typeof import('@/models/ServiceSubType').ServiceSubTypeModel;
  let ServiceTypeModel: typeof import('@/models/ServiceType').ServiceTypeModel;
  let UserModel: typeof import('@/models/user.model').UserModel;
  let sub: typeof import('../substituicao');
  let indicadoresDoAtivo: typeof import('../indicadores').indicadoresDoAtivo;
  let carregarFicha: typeof import('../ficha').carregarFicha;
  let todos: ModelDeTeste[];

  const DIA = 24 * 60 * 60 * 1000;
  const atras = (dias: number) => new Date(Date.now() - dias * DIA);

  const tipo = new Types.ObjectId();
  const subtipo = new Types.ObjectId();
  const clima = new Types.ObjectId();
  const copa = new Types.ObjectId();
  const sala = new Types.ObjectId();
  const quebra = new Types.ObjectId(); // 5 corretivos em 12 meses, 3 em 90 dias
  const velho = new Types.ObjectId(); // só idade, sem corretivo
  const novo = new Types.ObjectId(); // nada bate
  const tierC = new Types.ObjectId(); // velho, mas Tier C
  const aguardando = new Types.ObjectId(); // velho, mas aguardando baixa
  const ana = new Types.ObjectId();
  const beto = new Types.ObjectId();
  const MOTIVO = 'Troca já prevista no plano de compras de 2027.';
  let n = 0;

  const ativo = (_id: Types.ObjectId, extra: Record<string, unknown>) => ({
    _id,
    codigo: `C-${(n += 1)}`,
    origemCodigo: 'interno',
    descricao: 'Equipamento',
    categoriaId: clima,
    localizacaoId: sala,
    criticidade: 'media',
    tierManutencao: 'A',
    status: 'em_operacao',
    statusCadastro: 'validado',
    ...extra,
  });
  const chamado = (
    ativoId: Types.ObjectId,
    createdAt: Date,
    extra: Record<string, unknown> = {},
  ) => ({
    _id: new Types.ObjectId(),
    ticket_number: `SUB-${(n += 1)}`,
    status: 'em_atendimento',
    tipoServico: 'Ar-Condicionado',
    ativoId,
    createdAt,
    ...extra,
  });
  const sessao = (role: string, userId = ana) => ({
    userId: String(userId),
    username: 'x',
    role: role as never,
    isActive: true,
  });

  beforeAll(async () => {
    ({ AtivoModel } = await import('@/models/Ativo'));
    ({ AtivoHistoryModel } = await import('@/models/AtivoHistory'));
    ({ CategoriaAtivoModel } = await import('@/models/CategoriaAtivo'));
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ LocalizacaoModel } = await import('@/models/Localizacao'));
    ({ ServiceSubTypeModel } = await import('@/models/ServiceSubType'));
    ({ ServiceTypeModel } = await import('@/models/ServiceType'));
    ({ UserModel } = await import('@/models/user.model'));
    sub = await import('../substituicao');
    ({ indicadoresDoAtivo } = await import('../indicadores'));
    ({ carregarFicha } = await import('../ficha'));
    todos = [
      AtivoModel,
      AtivoHistoryModel,
      CategoriaAtivoModel,
      ChamadoModel,
      LocalizacaoModel,
      ServiceSubTypeModel,
      ServiceTypeModel,
      UserModel,
    ] as never;
    await conectarMongoDeTeste(todos, 'severino_test_substituicao');
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await limparColecoes(todos);
    await ServiceTypeModel.collection.insertOne({ _id: tipo, name: 'Ar Condicionado' });
    await ServiceSubTypeModel.collection.insertOne({ _id: subtipo, name: 'Split', typeId: tipo });
    await CategoriaAtivoModel.collection.insertMany([
      {
        _id: clima,
        chave: 'clima',
        nome: 'Climatização',
        vidaUtilAnos: 10,
        serviceSubTypeId: subtipo,
      },
      { _id: copa, chave: 'copa', nome: 'Copa', vidaUtilAnos: 10, serviceSubTypeId: null },
    ]);
    await LocalizacaoModel.collection.insertOne({
      _id: sala,
      nome: 'Sala 302',
      caminho: 'Sede/Sala 302',
    });
    await UserModel.collection.insertMany([
      { _id: ana, name: 'Ana Preposto', username: 'ana' },
      { _id: beto, name: 'Beto Admin', username: 'beto' },
    ]);
    await AtivoModel.collection.insertMany([
      ativo(quebra, { dataInstalacao: atras(365) }),
      ativo(velho, {
        categoriaId: copa,
        localizacaoId: null,
        camposPatrimoniais: { dataTombo: atras(15 * 366), importadoEm: new Date() },
      }),
      ativo(novo, { dataInstalacao: atras(30) }),
      ativo(tierC, { tierManutencao: 'C', dataInstalacao: atras(20 * 366) }),
      ativo(aguardando, { status: 'aguardando_baixa', dataInstalacao: atras(20 * 366) }),
    ]);
    await ChamadoModel.collection.insertMany([
      chamado(quebra, atras(300)),
      chamado(quebra, atras(200)),
      chamado(quebra, atras(80)),
      chamado(quebra, atras(40)),
      chamado(quebra, atras(5)),
      // Fora da conta: velho demais, cancelado e preventiva.
      chamado(quebra, atras(400)),
      chamado(quebra, atras(10), { status: 'cancelado' }),
      chamado(quebra, atras(10), { originTemplateId: new Types.ObjectId() }),
    ]);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  it('o lote dá os mesmos números da ficha e deixa de fora quem não pode ser candidato', async () => {
    const { candidatos, dispensados } = await sub.listarSituacoesSubstituicao();
    expect(dispensados).toEqual([]);
    expect(candidatos.map((c) => c.ativoId)).toEqual([String(quebra), String(velho)]);

    const [q, v] = candidatos;
    expect(q!.motivos).toEqual([
      { criterio: 'corretivos', quantidade: 5, limite: 4 },
      { criterio: 'reincidencia', quantidade: 3, limite: 3 },
    ]);
    expect(q!.tipoServico).toBe('Ar-Condicionado');
    expect(q!.caminho).toBe('Sede/Sala 302');
    expect(v!.motivos).toEqual([{ criterio: 'idade', anos: 15, vidaUtilAnos: 10 }]);
    expect(v!.tipoServico).toBeNull();
    expect(v!.caminho).toBeNull();

    // Paridade com a ficha, inclusive para quem não tem corretivo.
    for (const [id, linha] of [
      [quebra, q!],
      [velho, v!],
    ] as const) {
      const ind = await indicadoresDoAtivo(String(id));
      expect(linha.corretivos12m).toBe(ind.corretivos12m);
    }
    expect((await indicadoresDoAtivo(String(quebra))).corretivos90d).toBe(3);
  });

  it('a ficha mostra a situação só para a gestão, com os números da linha de indicadores', async () => {
    const daGestao = await carregarFicha(String(quebra), sessao('Preposto'));
    expect(daGestao?.substituicao?.situacao).toBe('candidato');
    expect(daGestao?.substituicao?.motivos[0]).toEqual({
      criterio: 'corretivos',
      quantidade: daGestao?.indicadores?.corretivos12m,
      limite: 4,
    });

    const doTecnico = await carregarFicha(String(quebra), sessao('Técnico'));
    expect(doTecnico).not.toHaveProperty('substituicao');
    const doSolicitante = await carregarFicha(String(quebra), sessao('Solicitante'));
    expect(doSolicitante).not.toHaveProperty('substituicao');
  });

  it('dispensar tira da lista, grava o histórico sem o motivo e não mexe em mais nada', async () => {
    const antes = await AtivoModel.findById(velho).lean();
    expect(
      await sub.dispensarSubstituicao({
        ativoId: String(velho),
        motivo: MOTIVO,
        userId: String(ana),
      }),
    ).toEqual({ ok: true });

    const depois = await AtivoModel.findById(velho).lean();
    expect(depois?.dispensaSubstituicao?.motivo).toBe(MOTIVO);
    expect(depois?.dispensaSubstituicao?.motivosNaDispensa).toEqual(['idade']);
    // Só `dispensaSubstituicao` muda (AC-16).
    const semDispensa = (a: typeof antes) => ({
      ...a,
      dispensaSubstituicao: undefined,
      updatedAt: undefined,
    });
    expect(semDispensa(depois)).toEqual(semDispensa(antes));

    const s = await sub.listarSituacoesSubstituicao();
    expect(s.candidatos.map((c) => c.ativoId)).toEqual([String(quebra)]);
    expect(s.dispensados.map((c) => c.ativoId)).toEqual([String(velho)]);

    const hist = await AtivoHistoryModel.find({ ativoId: velho }).lean();
    expect(hist).toHaveLength(1);
    expect(hist[0]!.acao).toBe('dispensa_substituicao');
    expect(hist[0]!.observacao).toMatch(/^Até \d{2}\/\d{2}\/\d{4} · critérios: idade$/);
    expect(JSON.stringify(hist)).not.toContain('plano de compras');

    const fichaTecnico = await carregarFicha(String(velho), sessao('Técnico'));
    expect(JSON.stringify(fichaTecnico)).not.toContain('plano de compras');
    const fichaGestao = await carregarFicha(String(velho), sessao('Admin', beto));
    expect(fichaGestao?.substituicao?.situacao).toBe('dispensado');
    expect(fichaGestao?.substituicao?.dispensa?.porNome).toBe('Ana Preposto');
    expect(fichaGestao?.substituicao?.dispensa?.motivo).toBe(MOTIVO);

    const avisos = await mongoose.connection.db!.collection('notifications').countDocuments();
    expect(avisos).toBe(0);
  });

  it('um critério novo devolve o dispensado no mesmo dia; voltar a sinalizar desfaz', async () => {
    await sub.dispensarSubstituicao({
      ativoId: String(velho),
      motivo: MOTIVO,
      userId: String(ana),
    });
    await ChamadoModel.collection.insertMany(
      [1, 2, 3, 4].map((d) => chamado(velho, atras(d * 80), { tipoServico: 'Manutenção Predial' })),
    );
    let s = await sub.listarSituacoesSubstituicao();
    expect(s.candidatos.map((c) => c.ativoId)).toContain(String(velho));
    expect(s.dispensados).toEqual([]);

    // Com o critério novo a dispensa não vale mais: nada a desfazer.
    expect(
      await sub.desfazerDispensaSubstituicao({ ativoId: String(velho), userId: String(ana) }),
    ).toEqual({ ok: false, error: 'Este ativo não tem dispensa em vigor.' });

    // A nova dispensa sobrescreve a que não vale mais e diz qual substituiu.
    expect(
      await sub.dispensarSubstituicao({
        ativoId: String(velho),
        motivo: MOTIVO,
        userId: String(beto),
      }),
    ).toEqual({ ok: true });
    const ultima = await AtivoHistoryModel.findOne({ ativoId: velho })
      .sort({ createdAt: -1 })
      .lean();
    expect(ultima?.observacao).toMatch(/critérios: idade, corretivos · substitui a dispensa até /);

    expect(
      await sub.desfazerDispensaSubstituicao({ ativoId: String(velho), userId: String(ana) }),
    ).toEqual({ ok: true });
    expect((await AtivoModel.findById(velho).lean())?.dispensaSubstituicao).toBeUndefined();
    s = await sub.listarSituacoesSubstituicao();
    expect(s.candidatos.map((c) => c.ativoId)).toContain(String(velho));
    const desfeita = await AtivoHistoryModel.findOne({
      acao: 'dispensa_substituicao_desfeita',
    }).lean();
    expect(desfeita?.observacao).toMatch(/^Dispensa até \d{2}\/\d{2}\/\d{4} desfeita$/);
  });

  it('vencido o prazo, volta a ser candidato e a nova dispensa sobrescreve', async () => {
    await AtivoModel.collection.updateOne(
      { _id: velho },
      {
        $set: {
          dispensaSubstituicao: {
            ate: new Date('2020-01-01T00:00:00.000Z'),
            motivo: MOTIVO,
            porUserId: beto,
            em: new Date('2019-07-01T12:00:00.000Z'),
            motivosNaDispensa: ['idade'],
          },
        },
      },
    );
    const s = await sub.listarSituacoesSubstituicao();
    expect(s.candidatos.map((c) => c.ativoId)).toContain(String(velho));
    const ficha = await carregarFicha(String(velho), sessao('Preposto'));
    expect(ficha?.substituicao?.dispensaGravadaAte).toBe('2020-01-01');

    expect(
      await sub.dispensarSubstituicao({
        ativoId: String(velho),
        motivo: MOTIVO,
        userId: String(ana),
      }),
    ).toEqual({ ok: true });
    const h = await AtivoHistoryModel.findOne({ ativoId: velho }).lean();
    expect(h?.observacao).toContain('· substitui a dispensa até 01/01/2020');
  });

  it('duas dispensas ao mesmo tempo: só a primeira grava, com um único histórico', async () => {
    const [a, b] = await Promise.all([
      sub.dispensarSubstituicao({ ativoId: String(quebra), motivo: MOTIVO, userId: String(ana) }),
      sub.dispensarSubstituicao({ ativoId: String(quebra), motivo: MOTIVO, userId: String(beto) }),
    ]);
    const resultados = [a, b];
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const recusa = resultados.find((r) => !r.ok) as { ok: false; error: string };
    expect(recusa.error).toMatch(/^Este ativo já foi dispensado por (Ana Preposto|Beto Admin)\.$/);
    expect(await AtivoHistoryModel.countDocuments({ ativoId: quebra })).toBe(1);
  });

  it('quem não é mais candidato é recusado sem escrita', async () => {
    for (const id of [novo, tierC, aguardando]) {
      expect(
        await sub.dispensarSubstituicao({
          ativoId: String(id),
          motivo: MOTIVO,
          userId: String(ana),
        }),
      ).toEqual({ ok: false, error: 'Este ativo não é mais candidato à substituição.' });
      expect((await AtivoModel.findById(id).lean())?.dispensaSubstituicao).toBeUndefined();
    }
    expect(await AtivoHistoryModel.countDocuments()).toBe(0);
  });

  it('histórico que falha desfaz a dispensa e devolve a anterior', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const criar = vi.spyOn(AtivoHistoryModel, 'create').mockRejectedValueOnce(new Error('caiu'));
    await expect(
      sub.dispensarSubstituicao({ ativoId: String(velho), motivo: MOTIVO, userId: String(ana) }),
    ).rejects.toThrow('caiu');
    expect((await AtivoModel.findById(velho).lean())?.dispensaSubstituicao).toBeUndefined();

    const anterior = {
      ate: new Date('2020-01-01T00:00:00.000Z'),
      motivo: MOTIVO,
      porUserId: beto,
      em: new Date('2019-07-01T12:00:00.000Z'),
      motivosNaDispensa: ['idade'],
    };
    await AtivoModel.collection.updateOne(
      { _id: velho },
      { $set: { dispensaSubstituicao: anterior } },
    );
    criar.mockRejectedValueOnce(new Error('caiu de novo'));
    await expect(
      sub.dispensarSubstituicao({ ativoId: String(velho), motivo: MOTIVO, userId: String(ana) }),
    ).rejects.toThrow('caiu de novo');
    expect((await AtivoModel.findById(velho).lean())?.dispensaSubstituicao).toEqual(anterior);
  });

  it('o desfazer nunca apaga a dispensa que outra pessoa gravou no meio', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const outra = {
      ate: new Date('2030-01-01T00:00:00.000Z'),
      motivo: 'Dispensa de outra pessoa, gravada no meio.',
      porUserId: beto,
      em: new Date('2026-01-01T12:00:00.000Z'),
      motivosNaDispensa: ['idade'],
    };
    vi.spyOn(AtivoHistoryModel, 'create').mockImplementationOnce(async () => {
      await AtivoModel.collection.updateOne(
        { _id: velho },
        { $set: { dispensaSubstituicao: outra } },
      );
      throw new Error('caiu');
    });
    await expect(
      sub.dispensarSubstituicao({ ativoId: String(velho), motivo: MOTIVO, userId: String(ana) }),
    ).rejects.toThrow('caiu');
    expect((await AtivoModel.findById(velho).lean())?.dispensaSubstituicao).toEqual(outra);
  });
  // covers: AC-14
  it('quem desfaz a dispensa no meio da confirmação faz a nova recusar com "O ativo mudou", sem histórico', async () => {
    const vencida = {
      ate: new Date('2020-01-01T00:00:00.000Z'),
      motivo: MOTIVO,
      porUserId: beto,
      em: new Date('2019-07-01T12:00:00.000Z'),
      motivosNaDispensa: ['idade'],
    };
    await AtivoModel.collection.updateOne(
      { _id: velho },
      { $set: { dispensaSubstituicao: vencida } },
    );
    // Entre a leitura e a escrita, outra pessoa apaga a dispensa lida.
    const original = AtivoModel.updateOne.bind(AtivoModel);
    vi.spyOn(AtivoModel, 'updateOne').mockImplementationOnce(((
      filtro: Parameters<typeof original>[0],
      update: Parameters<typeof original>[1],
    ) =>
      AtivoModel.collection
        .updateOne({ _id: velho }, { $unset: { dispensaSubstituicao: 1 } })
        .then(() => original(filtro, update))) as never);

    expect(
      await sub.dispensarSubstituicao({
        ativoId: String(velho),
        motivo: MOTIVO,
        userId: String(ana),
      }),
    ).toEqual({ ok: false, error: 'O ativo mudou enquanto você confirmava. Tente de novo.' });
    expect((await AtivoModel.findById(velho).lean())?.dispensaSubstituicao).toBeUndefined();
    expect(await AtivoHistoryModel.countDocuments()).toBe(0);
  });

  // covers: AC-15
  it('voltar a sinalizar em duas abas ao mesmo tempo: só uma desfaz, com um único histórico', async () => {
    await sub.dispensarSubstituicao({
      ativoId: String(velho),
      motivo: MOTIVO,
      userId: String(ana),
    });
    const resultados = await Promise.all([
      sub.desfazerDispensaSubstituicao({ ativoId: String(velho), userId: String(ana) }),
      sub.desfazerDispensaSubstituicao({ ativoId: String(velho), userId: String(beto) }),
    ]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.find((r) => !r.ok)).toEqual({
      ok: false,
      error: 'Este ativo não tem dispensa em vigor.',
    });
    expect(await AtivoHistoryModel.countDocuments({ acao: 'dispensa_substituicao_desfeita' })).toBe(
      1,
    );
  });

  // covers: AC-15
  it('histórico que falha ao voltar a sinalizar devolve a dispensa como estava', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await sub.dispensarSubstituicao({
      ativoId: String(velho),
      motivo: MOTIVO,
      userId: String(ana),
    });
    const antes = (await AtivoModel.findById(velho).lean())?.dispensaSubstituicao;
    vi.spyOn(AtivoHistoryModel, 'create').mockRejectedValueOnce(new Error('caiu'));
    await expect(
      sub.desfazerDispensaSubstituicao({ ativoId: String(velho), userId: String(ana) }),
    ).rejects.toThrow('caiu');
    expect((await AtivoModel.findById(velho).lean())?.dispensaSubstituicao).toEqual(antes);
  });

  // covers: AC-13
  it('ativo que não existe é recusado sem escrita', async () => {
    const sumido = String(new Types.ObjectId());
    expect(
      await sub.dispensarSubstituicao({ ativoId: sumido, motivo: MOTIVO, userId: String(ana) }),
    ).toEqual({ ok: false, error: 'Ativo inexistente.' });
    expect(
      await sub.desfazerDispensaSubstituicao({ ativoId: 'nao-e-id', userId: String(ana) }),
    ).toEqual({
      ok: false,
      error: 'Ativo inexistente.',
    });
    expect(await AtivoHistoryModel.countDocuments()).toBe(0);
  });

  // covers: AC-9
  it('o filtro da lista só faz a conta para a gestão e devolve os ids da opção escolhida', async () => {
    await sub.dispensarSubstituicao({
      ativoId: String(velho),
      motivo: MOTIVO,
      userId: String(ana),
    });
    const find = vi.spyOn(AtivoModel, 'find');

    expect(await sub.idsDoFiltroSubstituicao({ gestao: false, filtro: 'candidatos' })).toEqual({
      falhou: false,
    });
    expect(await sub.idsDoFiltroSubstituicao({ gestao: true })).toEqual({ falhou: false });
    expect(find).not.toHaveBeenCalled();

    expect(await sub.idsDoFiltroSubstituicao({ gestao: true, filtro: 'candidatos' })).toEqual({
      ids: [String(quebra)],
      falhou: false,
    });
    expect(await sub.idsDoFiltroSubstituicao({ gestao: true, filtro: 'dispensados' })).toEqual({
      ids: [String(velho)],
      falhou: false,
    });
  });

  // covers: AC-9
  it('falha na conta do filtro devolve a lista vazia e avisa, sem derrubar a página', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(AtivoModel, 'find').mockImplementationOnce(() => {
      throw new Error('banco fora');
    });
    expect(await sub.idsDoFiltroSubstituicao({ gestao: true, filtro: 'candidatos' })).toEqual({
      ids: [],
      falhou: true,
    });
    expect(erro).toHaveBeenCalledWith('[ativos]', expect.stringContaining('banco fora'));
  });
});
