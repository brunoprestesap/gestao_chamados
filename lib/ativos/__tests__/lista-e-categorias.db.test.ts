import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * Lista de `/ativos`, resumos para o DTO do chamado, categorias, opções dos
 * formulários e o conserto do `caminho`, contra o Mongo de verdade (spec 0011,
 * AC-1, AC-3, AC-10, AC-16).
 */

vi.mock('@/lib/dal', () => ({
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
}));

const rodar = temMongoDeTeste ? describe : describe.skip;

type Filtros = import('@/shared/ativos/ativo.schemas').FiltrosListaAtivos;
const filtros = (f: Partial<Filtros>): Filtros => ({
  q: undefined,
  local: undefined,
  categoria: undefined,
  status: undefined,
  cadastro: undefined,
  pagina: 1,
  ...f,
});

rodar('lista, resumos e categorias, contra o Mongo', () => {
  let lista: typeof import('../lista');
  let resumo: typeof import('../resumo');
  let categoria: typeof import('../categoria');
  let opcoes: typeof import('../opcoes');
  let localizacao: typeof import('../localizacao');
  let cadastro: typeof import('../cadastro');
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let CategoriaAtivoModel: typeof import('@/models/CategoriaAtivo').CategoriaAtivoModel;
  let LocalizacaoModel: typeof import('@/models/Localizacao').LocalizacaoModel;
  let ServiceTypeModel: typeof import('@/models/ServiceType').ServiceTypeModel;
  let ServiceSubTypeModel: typeof import('@/models/ServiceSubType').ServiceSubTypeModel;
  let AtivoHistoryModel: typeof import('@/models/AtivoHistory').AtivoHistoryModel;
  let ContadorModel: typeof import('@/models/Contador').ContadorModel;
  let todos: ModelDeTeste[];

  const autor = String(new Types.ObjectId());
  let catId: Types.ObjectId;

  beforeAll(async () => {
    lista = await import('../lista');
    resumo = await import('../resumo');
    categoria = await import('../categoria');
    opcoes = await import('../opcoes');
    localizacao = await import('../localizacao');
    cadastro = await import('../cadastro');
    ({ AtivoModel } = await import('@/models/Ativo'));
    ({ CategoriaAtivoModel } = await import('@/models/CategoriaAtivo'));
    ({ LocalizacaoModel } = await import('@/models/Localizacao'));
    ({ ServiceTypeModel } = await import('@/models/ServiceType'));
    ({ ServiceSubTypeModel } = await import('@/models/ServiceSubType'));
    ({ AtivoHistoryModel } = await import('@/models/AtivoHistory'));
    ({ ContadorModel } = await import('@/models/Contador'));
    todos = [
      AtivoModel,
      CategoriaAtivoModel,
      LocalizacaoModel,
      ServiceTypeModel,
      ServiceSubTypeModel,
      AtivoHistoryModel,
      ContadorModel,
    ];
    await conectarMongoDeTeste(todos, 'severino_test_ativos_lista');
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    catId = (
      await CategoriaAtivoModel.create({
        chave: 'clima',
        nome: 'Clima',
        criticidadePadrao: 'media',
      })
    )._id;
  });

  async function ativo(codigo: string, campos: Record<string, unknown> = {}) {
    return AtivoModel.create({
      codigo,
      origemCodigo: 'patrimonio',
      descricao: `Equipamento ${codigo}`,
      categoriaId: catId,
      criticidade: 'media',
      tierManutencao: 'A',
      statusCadastro: 'importado',
      ...campos,
    });
  }

  async function local(nome: string, tipo: 'predio' | 'andar' | 'sala', parentId?: string) {
    const r = await localizacao.criarLocalizacao({ nome, tipo, parentId });
    if (!r.ok) throw new Error(r.error);
    return r.id;
  }

  describe('listarAtivos (AC-10)', () => {
    it('ordena o código em ordem numérica, com MNT- depois dos tombamentos', async () => {
      for (const c of ['10698', 'MNT-0001', '9003', '11997']) await ativo(c);
      const r = await lista.listarAtivos(filtros({ pagina: 1 }));
      expect(r.itens.map((i) => i.codigo)).toEqual(['9003', '10698', '11997', 'MNT-0001']);
    });

    it('busca por prefixo do código normalizado e por trecho da descrição', async () => {
      await ativo('11997', { descricao: 'Compressor de ar' });
      await ativo('21199', { descricao: 'Split' });
      expect(
        (await lista.listarAtivos(filtros({ q: '0119', pagina: 1 }))).itens.map((i) => i.codigo),
      ).toEqual(['11997']);
      expect(
        (await lista.listarAtivos(filtros({ q: 'COMPRESS', pagina: 1 }))).itens.map(
          (i) => i.codigo,
        ),
      ).toEqual(['11997']);
    });

    it('busca com caractere de regex não quebra a consulta', async () => {
      await ativo('1', { descricao: 'Bomba (reserva) [B]' });
      expect((await lista.listarAtivos(filtros({ q: '(reserva) [B', pagina: 1 }))).total).toBe(1);
    });

    it('o filtro do prédio inclui tudo abaixo dele e não pega prédio de nome parecido', async () => {
      const sede = await local('Sede', 'predio');
      const sedeB = await local('Sede B', 'predio');
      const sala = await local('Sala 1', 'sala', await local('1º', 'andar', sede));
      await ativo('1', { localizacaoId: sede });
      await ativo('2', { localizacaoId: sala });
      await ativo('3', { localizacaoId: sedeB });
      await ativo('4');
      const r = await lista.listarAtivos(filtros({ local: sede, pagina: 1 }));
      expect(r.itens.map((i) => i.codigo)).toEqual(['1', '2']);
      expect(r.itens[1].caminho).toBe('Sede/1º/Sala 1');
    });

    it('"sem local" traz só os ativos sem localização', async () => {
      const sede = await local('Sede', 'predio');
      await ativo('1', { localizacaoId: sede });
      await ativo('2');
      const r = await lista.listarAtivos(filtros({ local: 'sem', pagina: 1 }));
      expect(r.itens.map((i) => [i.codigo, i.caminho])).toEqual([['2', null]]);
    });

    it('filtra por categoria, status e situação do cadastro', async () => {
      const outra = (
        await CategoriaAtivoModel.create({ chave: 'x', nome: 'X', criticidadePadrao: 'baixa' })
      )._id;
      await ativo('1', { status: 'inoperante' });
      await ativo('2', { categoriaId: outra });
      await ativo('3', { statusCadastro: 'em_vistoria' });
      expect(
        (await lista.listarAtivos(filtros({ status: 'inoperante', pagina: 1 }))).itens.map(
          (i) => i.codigo,
        ),
      ).toEqual(['1']);
      expect(
        (await lista.listarAtivos(filtros({ categoria: String(outra), pagina: 1 }))).itens[0]
          .categoriaNome,
      ).toBe('X');
      expect(
        (await lista.listarAtivos(filtros({ cadastro: 'em_vistoria', pagina: 1 }))).itens.map(
          (i) => i.codigo,
        ),
      ).toEqual(['3']);
    });

    it('pagina em 50 e traz página fora do fim para a última', async () => {
      await AtivoModel.insertMany(
        Array.from({ length: 51 }, (_, i) => ({
          codigo: String(i + 1),
          origemCodigo: 'patrimonio',
          descricao: 'x',
          categoriaId: catId,
          criticidade: 'media',
          tierManutencao: 'A',
          statusCadastro: 'importado',
        })),
      );
      const p1 = await lista.listarAtivos(filtros({ pagina: 1 }));
      expect([p1.itens.length, p1.total, p1.totalPaginas]).toEqual([50, 51, 2]);
      const fora = await lista.listarAtivos(filtros({ pagina: 9 }));
      expect([fora.pagina, fora.itens.map((i) => i.codigo)]).toEqual([2, ['51']]);
    });

    it('lista vazia ainda tem uma página', async () => {
      const r = await lista.listarAtivos(filtros({ pagina: 1 }));
      expect([r.total, r.totalPaginas, r.itens]).toEqual([0, 1, []]);
    });
  });

  describe('listarPredios e listarLocaisAtivos', () => {
    it('só prédios ativos, em ordem numérica de nome', async () => {
      await local('Prédio 10', 'predio');
      await local('Prédio 2', 'predio');
      const inativo = await local('Velho', 'predio');
      await localizacao.desativarLocalizacao(inativo);
      expect((await lista.listarPredios()).map((p) => p.nome)).toEqual(['Prédio 2', 'Prédio 10']);
    });

    it('devolve em ordem de árvore: cada nó logo depois do pai', async () => {
      const b = await local('B', 'predio');
      const a = await local('A', 'predio');
      await local('Andar 2', 'andar', a);
      await local('Andar 10', 'andar', a);
      await local('Térreo', 'andar', b);
      expect((await localizacao.listarLocaisAtivos()).map((n) => n.caminho)).toEqual([
        'A',
        'A/Andar 2',
        'A/Andar 10',
        'B',
        'B/Térreo',
      ]);
    });
  });

  describe('recalcularSubarvore (AC-1)', () => {
    it('conserta caminhos errados e é idempotente', async () => {
      const sede = await local('Sede', 'predio');
      const andar = await local('1º', 'andar', sede);
      const sala = await local('Sala', 'sala', andar);
      await LocalizacaoModel.updateMany({ _id: { $in: [andar, sala] } }, { caminho: 'quebrado' });
      expect(await localizacao.recalcularSubarvore(sede)).toBe(2);
      expect((await LocalizacaoModel.findById(sala).lean())?.caminho).toBe('Sede/1º/Sala');
      expect(await localizacao.recalcularSubarvore(sede)).toBe(0);
    });

    it('editar sem mudar nada não grava', async () => {
      const sede = await local('Sede', 'predio');
      expect(await localizacao.editarLocalizacao({ id: sede, nome: 'Sede' })).toEqual({ ok: true });
    });

    it('recusa pôr pai num prédio e tirar o pai de um andar', async () => {
      const sede = await local('Sede', 'predio');
      const outro = await local('Outro', 'predio');
      const andar = await local('1º', 'andar', sede);
      expect((await localizacao.editarLocalizacao({ id: sede, parentId: outro })).ok).toBe(false);
      expect((await localizacao.editarLocalizacao({ id: andar, parentId: null })).ok).toBe(false);
    });

    it('recusa criar abaixo de um local desativado', async () => {
      const sede = await local('Sede', 'predio');
      await localizacao.desativarLocalizacao(sede);
      const r = await localizacao.criarLocalizacao({ nome: 'X', tipo: 'andar', parentId: sede });
      expect(r.ok).toBe(false);
    });
  });

  describe('resumosDosAtivos (DTO do chamado, AC-16)', () => {
    it('resolve vários chamados numa consulta e devolve null para quem não tem ativo', async () => {
      const a = await ativo('11997', { descricao: 'Split' });
      const mapa = await resumo.resumosDosAtivos([
        { ativoId: a._id },
        { ativoId: null },
        { ativoId: a._id },
      ]);
      expect(mapa.size).toBe(1);
      expect(resumo.resumoDoChamado({ ativoId: a._id }, mapa)).toEqual({
        id: String(a._id),
        codigo: '11997',
        descricao: 'Split',
      });
      expect(resumo.resumoDoChamado({ ativoId: null }, mapa)).toBeNull();
    });

    it('ignora id inválido e ativo apagado', async () => {
      const mapa = await resumo.resumosDosAtivos([
        { ativoId: 'lixo' },
        { ativoId: new Types.ObjectId() },
      ]);
      expect(mapa.size).toBe(0);
    });
  });

  describe('categorias (AC-3)', () => {
    const dados = {
      chave: 'nobreak',
      nome: 'Nobreak',
      criticidadePadrao: 'alta' as const,
      exigeDocumento: ['ART'],
    };

    it('cria com subtipo de serviço que existe', async () => {
      const tipo = await ServiceTypeModel.create({ name: 'Elétrica' });
      const sub = await ServiceSubTypeModel.create({ typeId: tipo._id, name: 'Nobreak' });
      const r = await categoria.criarCategoria({ ...dados, serviceSubTypeId: String(sub._id) });
      expect(r.ok).toBe(true);
      const c = await CategoriaAtivoModel.findOne({ chave: 'nobreak' }).lean();
      expect(String(c?.serviceSubTypeId)).toBe(String(sub._id));
    });

    it('recusa subtipo inexistente', async () => {
      const r = await categoria.criarCategoria({
        ...dados,
        serviceSubTypeId: String(new Types.ObjectId()),
      });
      expect(r).toEqual({ ok: false, error: 'Subtipo de serviço inválido.' });
    });

    it('recusa chave ou nome repetidos', async () => {
      await categoria.criarCategoria(dados);
      expect((await categoria.criarCategoria({ ...dados, nome: 'Outro' })).ok).toBe(false);
      expect((await categoria.criarCategoria({ ...dados, chave: 'outra' })).ok).toBe(false);
    });

    it('editar categoria inexistente é recusado; editar limpa campos opcionais', async () => {
      expect((await categoria.editarCategoria(String(new Types.ObjectId()), dados)).ok).toBe(false);
      const r = await categoria.criarCategoria({ ...dados, vidaUtilAnos: 10 });
      if (!r.ok) throw new Error('setup');
      await categoria.editarCategoria(r.id, { ...dados, criticidadePadrao: 'critica' });
      const c = await CategoriaAtivoModel.findById(r.id).lean();
      expect([c?.criticidadePadrao, c?.vidaUtilAnos]).toEqual(['critica', null]);
    });

    // Achado da revisão: a carga acha as categorias pela chave.
    it('editar não muda a chave', async () => {
      const r = await categoria.criarCategoria(dados);
      if (!r.ok) throw new Error('setup');
      await categoria.editarCategoria(r.id, {
        ...dados,
        chave: 'outra_chave',
        nome: 'Nobreak novo',
      });
      const c = await CategoriaAtivoModel.findById(r.id).lean();
      expect([c?.chave, c?.nome]).toEqual(['nobreak', 'Nobreak novo']);
    });

    it('desativar tira dos formulários, mas os ativos da categoria continuam', async () => {
      await ativo('1');
      await categoria.desativarCategoria(String(catId));
      expect(await opcoes.listarCategoriasAtivas()).toEqual([]);
      expect(await AtivoModel.countDocuments({ categoriaId: catId })).toBe(1);
    });

    it('a criticidade padrão nova vale para o próximo cadastro (AC-4)', async () => {
      await categoria.editarCategoria(String(catId), {
        chave: 'clima',
        nome: 'Clima',
        criticidadePadrao: 'critica',
        exigeDocumento: [],
      });
      const r = await cadastro.criarAtivo(
        {
          origemCodigo: 'interno',
          descricao: 'x',
          categoriaId: String(catId),
          tierManutencao: 'A',
        },
        autor,
      );
      if (!r.ok) throw new Error(r.error);
      expect((await AtivoModel.findById(r.id).lean())?.criticidade).toBe('critica');
    });
  });

  describe('alterarStatusAtivo e validarAtivo', () => {
    it('repetir o mesmo status não grava histórico', async () => {
      const a = await ativo('1');
      expect(
        await cadastro.alterarStatusAtivo({ id: String(a._id), status: 'em_operacao' }, autor),
      ).toEqual({ ok: true });
      expect(await AtivoHistoryModel.countDocuments({ ativoId: a._id })).toBe(0);
    });

    it('validar de novo um validado não grava outro histórico', async () => {
      const sede = await local('Sede', 'predio');
      const a = await ativo('1', { localizacaoId: sede });
      await cadastro.validarAtivo(String(a._id), autor);
      await cadastro.validarAtivo(String(a._id), autor);
      expect(await AtivoHistoryModel.countDocuments({ ativoId: a._id, acao: 'validacao' })).toBe(1);
    });

    it('id inválido é recusado sem lançar', async () => {
      expect((await cadastro.validarAtivo('x', autor)).ok).toBe(false);
      expect(
        (await cadastro.alterarStatusAtivo({ id: 'x', status: 'baixado', observacao: 'a' }, autor))
          .ok,
      ).toBe(false);
    });
  });
});
