import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

import { decodificarCp1252, parseSicam } from '../parse';
import { bytesCp1252, csvSicam, type LinhaFicticia, linhaSicam } from './sicam-fixture';

/**
 * O importador contra o Mongo de verdade (spec 0012, AC-20 a AC-25): sem falso
 * alterado para o que veio da carga, a regra de ouro (só caminhos de
 * `camposPatrimoniais`), aplicação repetível e corrida, enxugamento e a troca
 * de pendente. Índice único e corrida não se provam com mock.
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('importador do SICAM, contra o Mongo', () => {
  let pendente: typeof import('../pendente');
  let aplicar: typeof import('../aplicar');
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let AtivoHistoryModel: typeof import('@/models/AtivoHistory').AtivoHistoryModel;
  let CategoriaAtivoModel: typeof import('@/models/CategoriaAtivo').CategoriaAtivoModel;
  let LocalizacaoModel: typeof import('@/models/Localizacao').LocalizacaoModel;
  let ImportacaoPatrimonialModel: typeof import('@/models/ImportacaoPatrimonial').ImportacaoPatrimonialModel;
  let todos: ModelDeTeste[];

  const admin = new Types.ObjectId().toString();
  let climatizacaoId: string;

  beforeAll(async () => {
    pendente = await import('../pendente');
    aplicar = await import('../aplicar');
    ({ AtivoModel } = await import('@/models/Ativo'));
    ({ AtivoHistoryModel } = await import('@/models/AtivoHistory'));
    ({ CategoriaAtivoModel } = await import('@/models/CategoriaAtivo'));
    ({ LocalizacaoModel } = await import('@/models/Localizacao'));
    ({ ImportacaoPatrimonialModel } = await import('@/models/ImportacaoPatrimonial'));
    todos = [
      AtivoModel,
      AtivoHistoryModel,
      CategoriaAtivoModel,
      LocalizacaoModel,
      ImportacaoPatrimonialModel,
    ];
    await conectarMongoDeTeste(todos, 'severino_test_importacao');
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    const cat = await CategoriaAtivoModel.create({
      chave: 'climatizacao',
      nome: 'Climatização',
      criticidadePadrao: 'media',
    });
    climatizacaoId = String(cat._id);
  });

  /** Um ativo como a carga da 0011 grava: datas ao meio dia UTC, valor em número. */
  async function ativoDaCarga(codigo: string, extra: Record<string, unknown> = {}) {
    const { camposPatrimoniais, ...resto } = extra as {
      camposPatrimoniais?: Record<string, unknown>;
    };
    return AtivoModel.create({
      codigo,
      origemCodigo: 'patrimonio',
      tombamento: codigo,
      descricao: `SPLIT ${codigo}`,
      categoriaId: climatizacaoId,
      criticidade: 'media',
      tierManutencao: 'A',
      statusCadastro: 'importado',
      camposPatrimoniais: {
        codigoMaterial: '5555',
        fornecedor: 'FORNECEDOR FICTICIO LTDA',
        dataTombo: new Date('2020-01-15T12:00:00Z'),
        lotacao: 'SECRETARIA FICTICIA',
        setor: 'SETOR X',
        responsavelMatricula: 'XX00001',
        responsavelNome: 'PESSOA FICTICIA',
        numeroSerie: 'SN100',
        garantiaFim: new Date('2023-12-29T12:00:00Z'),
        valorHistorico: 8700.9,
        importadoEm: new Date('2026-10-01T00:00:00Z'),
        ...camposPatrimoniais,
      },
      ...resto,
    });
  }

  async function subir(linhas: LinhaFicticia[], substituirPendente = false) {
    const r = parseSicam(
      decodificarCp1252(bytesCp1252(csvSicam(linhas.map((l) => linhaSicam(l))))),
    );
    if (!r.ok) throw new Error(r.error);
    return pendente.registrarImportacao({
      arquivoNome: 'sicam.csv',
      autorId: admin,
      linhas: r.linhas,
      codigosAceitos: r.codigosAceitos,
      contagensParse: {
        linhasLidas: r.linhasLidas,
        linhasReparadas: r.linhasReparadas,
        linhasAceitas: r.linhasAceitas,
        linhasDuplicadas: r.linhasDuplicadas,
        valoresIlegiveis: r.valoresIlegiveis,
      },
      substituirPendente,
    });
  }

  async function subirOk(linhas: LinhaFicticia[]) {
    const r = await subir(linhas);
    if (!r.ok) throw new Error('conflito inesperado');
    return r.id;
  }

  async function itensDe(id: string) {
    const doc = await ImportacaoPatrimonialModel.findById(id).lean();
    return (doc?.itens ?? []) as unknown as Record<string, unknown>[];
  }

  const tudo = (id: string, extra: Partial<import('../aplicar').SelecaoAplicacao> = {}) =>
    aplicar.aplicarImportacao(id, { novos: [], alterados: [], sumidos: [], ...extra }, admin);

  it('o que veio da carga e a mesma linha no CSV bruto não geram item', async () => {
    await ativoDaCarga('100');
    const id = await subirOk([{ 'Número Tombo': '100' }]);
    expect(await itensDe(id)).toEqual([]);
  });

  it('diferença: interno, sem importadoEm e baixado nunca viram sumido; ausente que volta vira "Retornou"', async () => {
    await ativoDaCarga('1'); // sumido
    await ativoDaCarga('2', { status: 'baixado', camposPatrimoniais: { setor: 'VELHO' } }); // alterado, nunca sumido
    // Patrimoniado cadastrado em campo, que o SICAM nunca trouxe: nunca sumido.
    await AtivoModel.create({
      codigo: '3',
      origemCodigo: 'patrimonio',
      tombamento: '3',
      descricao: 'SPLIT DE CAMPO',
      categoriaId: climatizacaoId,
      criticidade: 'media',
      tierManutencao: 'A',
      statusCadastro: 'em_vistoria',
    });
    await AtivoModel.create({
      codigo: 'MNT-0001',
      origemCodigo: 'interno',
      descricao: 'ELEVADOR',
      categoriaId: climatizacaoId,
      criticidade: 'alta',
      tierManutencao: 'A',
      statusCadastro: 'validado',
    });
    await ativoDaCarga('4', {
      camposPatrimoniais: { ausenteNoSicamDesde: new Date('2026-09-01T00:00:00Z') },
    }); // volta
    await ativoDaCarga('5', {
      camposPatrimoniais: { ausenteNoSicamDesde: new Date('2026-09-01T00:00:00Z') },
    }); // continua fora

    const id = await subirOk([{ 'Número Tombo': '2' }, { 'Número Tombo': '4' }]);
    const itens = await itensDe(id);
    const porCodigo = Object.fromEntries(itens.map((i) => [i.codigo, i]));

    expect(porCodigo['1']).toMatchObject({ grupo: 'sumido', local: 'sem local' });
    expect(porCodigo['2']).toMatchObject({ grupo: 'alterado' });
    expect(porCodigo['3']).toBeUndefined();
    expect(porCodigo['MNT-0001']).toBeUndefined();
    expect(porCodigo['4']).toMatchObject({
      grupo: 'alterado',
      retornou: true,
      camposAlterados: [],
    });
    expect(porCodigo['5']).toBeUndefined();
    const doc = await ImportacaoPatrimonialModel.findById(id).lean();
    expect(doc?.continuamAusentes).toBe(1);
    expect(doc?.contagens).toMatchObject({ novos: 0, alterados: 2, sumidos: 1 });
  });

  it('novo sem a categoria cadastrada chega bloqueado; a aplicação recusa categoria inválida', async () => {
    const id = await subirOk([
      { 'Número Tombo': '900', 'Descrição Material': 'FORNO ELÉTRICO 40L' },
      { 'Número Tombo': '901', 'Descrição Material': 'SPLIT 9000 BTUS' },
      { 'Número Tombo': '902', 'Descrição Material': 'SWITCH 24 PORTAS' }, // tier C, sem item
    ]);
    const itens = await itensDe(id);
    expect(itens.map((i) => i.codigo).sort()).toEqual(['900', '901']);
    expect(itens.find((i) => i.codigo === '900')).toMatchObject({
      tier: 'B',
      categoriaSugerida: 'copa_coccao',
      bloqueio: 'Categoria copa_coccao não cadastrada',
    });
    expect(itens.find((i) => i.codigo === '901')).not.toHaveProperty('bloqueio');

    const inativa = await CategoriaAtivoModel.create({
      chave: 'velha',
      nome: 'Velha',
      criticidadePadrao: 'baixa',
      isActive: false,
    });
    const r = await tudo(id, { novos: [{ codigo: '900', categoriaId: String(inativa._id) }] });
    expect(r).toEqual({
      ok: false,
      error: 'Escolha uma categoria ativa para cada ativo novo marcado.',
    });
    expect(await AtivoModel.countDocuments({ codigo: '900' })).toBe(0);
  });

  it('acima de 20% de sumidos, aplicar com sumido marcado pede confirmação', async () => {
    await ativoDaCarga('1');
    await ativoDaCarga('2');
    const id = await subirOk([{ 'Número Tombo': '2' }]);
    expect(await tudo(id, { sumidos: ['1'] })).toMatchObject({ ok: false });
    const r = await tudo(id, { sumidos: ['1'], confirmaMuitosSumidos: true });
    expect(r.ok).toBe(true);
    const a = await AtivoModel.findOne({ codigo: '1' }).lean();
    expect(a?.camposPatrimoniais?.ausenteNoSicamDesde).toBeInstanceOf(Date);
    expect(await AtivoHistoryModel.countDocuments({ acao: 'ausente_sicam' })).toBe(1);
  });

  it('cria o novo marcado como a spec manda, com histórico de cadastro', async () => {
    const id = await subirOk([
      {
        'Número Tombo': '000777',
        'Descrição Material': 'SPLIT   12000 BTUS',
        'Numero de série': 'ABC',
      },
    ]);
    const r = await tudo(id, { novos: [{ codigo: '777', categoriaId: climatizacaoId }] });
    expect(r.ok && r.resultado).toMatchObject({ aplicados: { novos: 1 }, concluida: true });

    const a = await AtivoModel.findOne({ codigo: '777' }).lean();
    expect(a).toMatchObject({
      origemCodigo: 'patrimonio',
      tombamento: '777',
      descricao: 'SPLIT 12000 BTUS',
      numeroSerie: 'ABC',
      criticidade: 'media',
      tierManutencao: 'A',
      status: 'em_operacao',
      statusCadastro: 'importado',
      localizacaoId: null,
    });
    expect(a?.camposPatrimoniais?.importadoEm).toBeInstanceOf(Date);
    expect(a?.camposPatrimoniais?.setor).toBe('SETOR X');
    expect(await AtivoHistoryModel.findOne({ ativoId: a?._id }).lean()).toMatchObject({
      acao: 'cadastro',
      observacao: 'Importação SICAM',
    });
  });

  it('regra de ouro: só os caminhos mudados de camposPatrimoniais mudam', async () => {
    const sala = await LocalizacaoModel.create({
      nome: 'Prédio 1',
      tipo: 'predio',
      caminho: 'Prédio 1',
    });
    const editado = await ativoDaCarga('10', {
      fabricante: 'FAB',
      modelo: 'MOD',
      numeroSerie: 'SERIE-CAMPO',
      status: 'em_manutencao',
      localizacaoId: sala._id,
    });
    const outroAusente = await ativoDaCarga('11', {
      camposPatrimoniais: { ausenteNoSicamDesde: new Date('2026-09-01T00:00:00Z') },
    });
    const id = await subirOk([
      {
        'Número Tombo': '10',
        'Nome Setor': 'SETOR NOVO',
        'Nome Responsável Termo': 'OUTRA PESSOA FICTICIA',
        'Código Material': '', // vazio no CSV não apaga
      },
    ]);
    const r = await tudo(id, { alterados: ['10'] });
    expect(r.ok).toBe(true);

    const depois = await AtivoModel.findById(editado._id).lean();
    expect(depois).toMatchObject({
      fabricante: 'FAB',
      modelo: 'MOD',
      numeroSerie: 'SERIE-CAMPO',
      status: 'em_manutencao',
      localizacaoId: sala._id,
    });
    expect(depois?.camposPatrimoniais).toMatchObject({
      setor: 'SETOR NOVO',
      responsavelNome: 'OUTRA PESSOA FICTICIA',
      codigoMaterial: '5555',
      lotacao: 'SECRETARIA FICTICIA',
    });
    const outro = await AtivoModel.findById(outroAusente._id).lean();
    expect(outro?.camposPatrimoniais?.ausenteNoSicamDesde).toEqual(
      new Date('2026-09-01T00:00:00Z'),
    );

    const hist = await AtivoHistoryModel.find({ ativoId: editado._id }).lean();
    expect(hist).toHaveLength(1);
    expect(hist[0].acao).toBe('importacao_patrimonial');
    expect(hist[0].observacao).toContain('setor');
    expect(hist[0].observacao).toContain('nome do responsável');
    expect(JSON.stringify(hist)).not.toContain('PESSOA FICTICIA');
  });

  it('"Retornou" apaga a marca de ausente e grava retorno_sicam', async () => {
    const a = await ativoDaCarga('20', {
      camposPatrimoniais: { ausenteNoSicamDesde: new Date('2026-09-01T00:00:00Z') },
    });
    const id = await subirOk([{ 'Número Tombo': '20' }]);
    expect((await tudo(id, { alterados: ['20'] })).ok).toBe(true);
    const depois = await AtivoModel.findById(a._id).lean();
    expect(depois?.camposPatrimoniais?.ausenteNoSicamDesde).toBeUndefined();
    expect(await AtivoHistoryModel.countDocuments({ ativoId: a._id, acao: 'retorno_sicam' })).toBe(
      1,
    );
  });

  it('alterado cujo valor mudou depois da revisão é pulado com o motivo', async () => {
    const a = await ativoDaCarga('30');
    const id = await subirOk([{ 'Número Tombo': '30', 'Nome Setor': 'SETOR DO ARQUIVO' }]);
    await AtivoModel.updateOne({ _id: a._id }, { $set: { 'camposPatrimoniais.setor': 'OUTRO' } });
    const r = await tudo(id, { alterados: ['30'] });
    expect(r.ok && r.resultado.pulados.alterados).toBe(1);
    const imp = await ImportacaoPatrimonialModel.findById(id).lean();
    expect(imp?.itens[0]).toMatchObject({
      codigo: '30',
      motivoPulo: 'O ativo mudou depois da revisão',
    });
    expect(await AtivoHistoryModel.countDocuments({ ativoId: a._id })).toBe(0);
  });

  it('duas aplicações ao mesmo tempo criam cada ativo uma vez e um histórico por mudança', async () => {
    await ativoDaCarga('40');
    await ativoDaCarga('41');
    const id = await subirOk([
      { 'Número Tombo': '40', 'Nome Setor': 'NOVO SETOR' },
      { 'Número Tombo': '50', 'Descrição Material': 'SPLIT A' },
      { 'Número Tombo': '51', 'Descrição Material': 'SPLIT B' },
    ]);
    const selecao = {
      novos: [
        { codigo: '50', categoriaId: climatizacaoId },
        { codigo: '51', categoriaId: climatizacaoId },
      ],
      alterados: ['40'],
      sumidos: ['41'],
      confirmaMuitosSumidos: true,
    };
    const [r1, r2] = await Promise.all([
      aplicar.aplicarImportacao(id, selecao, admin),
      aplicar.aplicarImportacao(id, selecao, admin),
    ]);
    expect(r1.ok || r2.ok).toBe(true);

    expect(await AtivoModel.countDocuments({ codigo: { $in: ['50', '51'] } })).toBe(2);
    expect(await AtivoHistoryModel.countDocuments({ acao: 'cadastro' })).toBe(2);
    expect(await AtivoHistoryModel.countDocuments({ acao: 'importacao_patrimonial' })).toBe(1);
    expect(await AtivoHistoryModel.countDocuments({ acao: 'ausente_sicam' })).toBe(1);

    const imp = await ImportacaoPatrimonialModel.findById(id).lean();
    expect(imp?.status).toBe('aplicada');
    expect(imp?.contagens?.aplicados).toMatchObject({ novos: 2, alterados: 1, sumidos: 1 });
  });

  it('queda no meio: reaplicar termina o que faltou sem duplicar', async () => {
    await ativoDaCarga('60');
    const id = await subirOk([
      { 'Número Tombo': '60', 'Nome Setor': 'NOVO' },
      { 'Número Tombo': '61', 'Descrição Material': 'SPLIT C' },
    ]);
    // Simula a queda: o ativo 60 já foi escrito (com histórico), mas o item não
    // chegou a ser marcado, e a importação ficou pendente.
    const antes = await ImportacaoPatrimonialModel.findById(id).lean();
    await aplicar.aplicarImportacao(id, { novos: [], alterados: ['60'], sumidos: [] }, admin);
    await ImportacaoPatrimonialModel.updateOne(
      { _id: id },
      { $set: { status: 'pendente', emAberto: true, itens: antes?.itens ?? [] } },
    );
    const r = await tudo(id, {
      novos: [{ codigo: '61', categoriaId: climatizacaoId }],
      alterados: ['60'],
    });
    expect(r.ok && r.resultado).toMatchObject({ aplicados: { novos: 1, alterados: 1 } });
    expect(await AtivoModel.countDocuments({ codigo: '61' })).toBe(1);
    expect(await AtivoHistoryModel.countDocuments({ acao: 'importacao_patrimonial' })).toBe(1);
    expect(await AtivoHistoryModel.countDocuments({ acao: 'cadastro' })).toBe(1);
  });

  it('aplicar duas vezes em sequência não muda nada na segunda', async () => {
    await ativoDaCarga('70');
    const id = await subirOk([{ 'Número Tombo': '70', 'Nome Setor': 'NOVO' }]);
    expect((await tudo(id, { alterados: ['70'] })).ok).toBe(true);
    expect(await tudo(id, { alterados: ['70'] })).toEqual({
      ok: false,
      error: 'Esta importação não está mais pendente.',
    });
    expect(await AtivoHistoryModel.countDocuments({})).toBe(1);
  });

  it('enxugamento: depois de aplicar e de descartar, o item guarda só o resumo', async () => {
    await ativoDaCarga('80');
    await ativoDaCarga('81');
    const id1 = await subirOk([
      { 'Número Tombo': '80', 'Nome Setor': 'NOVO' },
      { 'Número Tombo': '82', 'Descrição Material': 'SPLIT D' },
    ]);
    await tudo(id1, { alterados: ['80'] });
    const id2 = await subirOk([{ 'Número Tombo': '80', 'Nome Setor': 'OUTRO' }]);
    expect((await pendente.descartarImportacao(id2, admin)).ok).toBe(true);

    for (const id of [id1, id2]) {
      const doc = (await ImportacaoPatrimonialModel.findById(id).lean()) as unknown as Record<
        string,
        unknown
      > & { itens: Record<string, unknown>[] };
      expect(doc).not.toHaveProperty('emAberto');
      for (const item of doc.itens) {
        expect(Object.keys(item).sort()).toEqual(expect.arrayContaining(['codigo', 'grupo']));
        for (const proibido of ['descricao', 'local', 'camposAlterados', 'dados']) {
          expect(item).not.toHaveProperty(proibido);
        }
      }
      expect(JSON.stringify(doc)).not.toContain('PESSOA FICTICIA');
    }
    const aplicada = await ImportacaoPatrimonialModel.findById(id1).lean();
    expect(aplicada?.status).toBe('aplicada');
    expect(aplicada?.itens.find((i) => i.codigo === '82')).toMatchObject({
      motivoPulo: 'Não marcado na revisão',
    });
  });

  it('pendente existente: conflito sem substituir; com substituir, a anterior é descartada', async () => {
    const id1 = await subirOk([{ 'Número Tombo': '90', 'Descrição Material': 'SPLIT E' }]);
    const conflito = await subir([{ 'Número Tombo': '91', 'Descrição Material': 'SPLIT F' }]);
    expect(conflito).toMatchObject({ ok: false, conflito: { id: id1 } });

    const troca = await subir([{ 'Número Tombo': '91', 'Descrição Material': 'SPLIT F' }], true);
    expect(troca.ok).toBe(true);
    const anterior = await ImportacaoPatrimonialModel.findById(id1).lean();
    expect(anterior?.status).toBe('descartada');
    expect(anterior?.itens[0]).not.toHaveProperty('dados');
    expect(await ImportacaoPatrimonialModel.countDocuments({ emAberto: true })).toBe(1);
  });

  it('dois uploads ao mesmo tempo nunca deixam duas pendentes', async () => {
    const rs = await Promise.all([
      subir([{ 'Número Tombo': '95' }]),
      subir([{ 'Número Tombo': '96' }]),
      subir([{ 'Número Tombo': '97' }]),
    ]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await ImportacaoPatrimonialModel.countDocuments({ emAberto: true })).toBe(1);
  });

  it('lista as importações da mais recente para a mais antiga', async () => {
    const id1 = await subirOk([{ 'Número Tombo': '1' }]);
    await pendente.descartarImportacao(id1, admin);
    const id2 = await subirOk([{ 'Número Tombo': '2' }]);
    const lista = await pendente.listarImportacoes(1);
    expect(lista.itens.map((i) => i.id)).toEqual([id2, id1]);
    expect(lista.total).toBe(2);
  });
});
