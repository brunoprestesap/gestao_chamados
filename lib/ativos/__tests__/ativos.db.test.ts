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
 * O módulo de ativos contra o Mongo de verdade (spec 0011): índice único de
 * `codigo`, índice parcial do nome irmão (sem diferenciar maiúsculas), a
 * corrida do contador `MNT`, a cascata do `caminho`, o vínculo com chamado e
 * o recorte da ficha por perfil. Nada disso se prova com mock.
 */

vi.mock('@/lib/dal', () => ({
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
}));

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('ativos, contra o Mongo', () => {
  let cadastro: typeof import('../cadastro');
  let localizacao: typeof import('../localizacao');
  let vinculo: typeof import('../vinculo');
  let ficha: typeof import('../ficha');
  let seletor: typeof import('../seletor');
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let AtivoHistoryModel: typeof import('@/models/AtivoHistory').AtivoHistoryModel;
  let CategoriaAtivoModel: typeof import('@/models/CategoriaAtivo').CategoriaAtivoModel;
  let ContadorModel: typeof import('@/models/Contador').ContadorModel;
  let LocalizacaoModel: typeof import('@/models/Localizacao').LocalizacaoModel;
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  let ServiceTypeModel: typeof import('@/models/ServiceType').ServiceTypeModel;
  let ServiceSubTypeModel: typeof import('@/models/ServiceSubType').ServiceSubTypeModel;
  let todos: ModelDeTeste[];

  const autor = new Types.ObjectId();
  const solicitanteId = new Types.ObjectId();
  const outroId = new Types.ObjectId();
  const tecnicoId = new Types.ObjectId();
  let categoriaId: string;

  beforeAll(async () => {
    cadastro = await import('../cadastro');
    localizacao = await import('../localizacao');
    vinculo = await import('../vinculo');
    ficha = await import('../ficha');
    seletor = await import('../seletor');
    ({ AtivoModel } = await import('@/models/Ativo'));
    ({ AtivoHistoryModel } = await import('@/models/AtivoHistory'));
    ({ CategoriaAtivoModel } = await import('@/models/CategoriaAtivo'));
    ({ ContadorModel } = await import('@/models/Contador'));
    ({ LocalizacaoModel } = await import('@/models/Localizacao'));
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ChamadoHistoryModel } = await import('@/models/ChamadoHistory'));
    ({ ServiceTypeModel } = await import('@/models/ServiceType'));
    ({ ServiceSubTypeModel } = await import('@/models/ServiceSubType'));
    todos = [
      AtivoModel,
      AtivoHistoryModel,
      CategoriaAtivoModel,
      ContadorModel,
      LocalizacaoModel,
      ChamadoModel,
      ChamadoHistoryModel,
      ServiceTypeModel,
      ServiceSubTypeModel,
    ];
    await conectarMongoDeTeste(todos, 'severino_test_ativos');
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
    categoriaId = String(cat._id);
  });

  const dadosPatrimonio = (tombamento: string) => ({
    origemCodigo: 'patrimonio' as const,
    tombamento,
    descricao: 'Split 12000',
    categoriaId,
    tierManutencao: 'A' as const,
  });

  async function chamado(campos: Record<string, unknown> = {}) {
    return ChamadoModel.create({
      ticket_number: `T-${new Types.ObjectId().toString().slice(-6)}`,
      titulo: 'Teste',
      descricao: 'Descrição sigilosa',
      unitId: new Types.ObjectId(),
      localExato: 'Sala 1',
      tipoServico: 'Ar-Condicionado',
      naturezaAtendimento: 'Padrão',
      subtypeId: new Types.ObjectId(),
      catalogServiceId: new Types.ObjectId(),
      status: 'aberto',
      solicitanteId,
      ...campos,
    });
  }

  describe('cadastro do ativo (AC-4, AC-5)', () => {
    it('nasce em vistoria, em operação e com a criticidade da categoria', async () => {
      const r = await cadastro.criarAtivo(dadosPatrimonio('00011997'), String(autor));
      expect(r.ok).toBe(true);
      const a = await AtivoModel.findOne({ codigo: '11997' }).lean();
      expect(a?.statusCadastro).toBe('em_vistoria');
      expect(a?.status).toBe('em_operacao');
      expect(a?.criticidade).toBe('media');
      expect(a?.tombamento).toBe('11997');
      const h = await AtivoHistoryModel.find({ ativoId: a?._id }).lean();
      expect(h.map((x) => x.acao)).toEqual(['cadastro']);
      expect(String(h[0].autorId)).toBe(String(autor));
    });

    it('recusa código repetido com a mensagem da spec', async () => {
      await cadastro.criarAtivo(dadosPatrimonio('11997'), String(autor));
      const r = await cadastro.criarAtivo(dadosPatrimonio('011997'), String(autor));
      expect(r).toEqual({ ok: false, error: 'Já existe um ativo com o código 11997' });
    });

    it('o índice único barra o código repetido mesmo fora da função', async () => {
      await cadastro.criarAtivo(dadosPatrimonio('11997'), String(autor));
      await expect(
        AtivoModel.create({
          codigo: '11997',
          origemCodigo: 'patrimonio',
          descricao: 'x',
          categoriaId,
          criticidade: 'baixa',
          tierManutencao: 'A',
          statusCadastro: 'importado',
        }),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it('dois cadastros internos ao mesmo tempo geram MNT-0001 e MNT-0002', async () => {
      const dados = { ...dadosPatrimonio(''), origemCodigo: 'interno' as const };
      const [a, b] = await Promise.all([
        cadastro.criarAtivo(dados, String(autor)),
        cadastro.criarAtivo(dados, String(autor)),
      ]);
      const codigos = [a, b].map((r) => (r.ok ? r.codigo : r.error)).sort();
      expect(codigos).toEqual(['MNT-0001', 'MNT-0002']);
    });

    it('recusa categoria desativada', async () => {
      await CategoriaAtivoModel.updateOne({ _id: categoriaId }, { isActive: false });
      const r = await cadastro.criarAtivo(dadosPatrimonio('1'), String(autor));
      expect(r.ok).toBe(false);
    });
  });

  describe('edição, status e validação (AC-6, AC-7)', () => {
    it('grava um histórico por mudança de local e categoria, mais um de edição', async () => {
      const predio = await localizacao.criarLocalizacao({ nome: 'Sede', tipo: 'predio' });
      const outra = await CategoriaAtivoModel.create({
        chave: 'nobreak',
        nome: 'Nobreak',
        criticidadePadrao: 'alta',
      });
      const r = await cadastro.criarAtivo(dadosPatrimonio('5'), String(autor));
      if (!r.ok || !predio.ok) throw new Error('setup');

      const e = await cadastro.editarAtivo(
        {
          id: r.id,
          descricao: 'Split 12000',
          categoriaId: String(outra._id),
          localizacaoId: predio.id,
          tierManutencao: 'A',
          fabricante: 'Marca X',
          criticidade: 'media',
        },
        String(autor),
      );
      expect(e.ok).toBe(true);
      const h = await AtivoHistoryModel.find({ ativoId: r.id, acao: { $ne: 'cadastro' } }).lean();
      const porAcao = Object.fromEntries(h.map((x) => [x.acao, x]));
      expect(Object.keys(porAcao).sort()).toEqual([
        'alteracao_categoria',
        'alteracao_localizacao',
        'edicao',
      ]);
      expect(porAcao.alteracao_categoria.de).toBe('Climatização');
      expect(porAcao.alteracao_categoria.para).toBe('Nobreak');
      expect(porAcao.alteracao_localizacao.de).toBe('sem local');
      expect(porAcao.alteracao_localizacao.para).toBe('Sede');
      expect(porAcao.edicao.observacao).toContain('fabricante');
    });

    it('editar sem mudar nada não grava histórico', async () => {
      const r = await cadastro.criarAtivo(dadosPatrimonio('6'), String(autor));
      if (!r.ok) throw new Error('setup');
      await cadastro.editarAtivo(
        {
          id: r.id,
          descricao: 'Split 12000',
          categoriaId,
          tierManutencao: 'A',
          criticidade: 'media',
        },
        String(autor),
      );
      expect(await AtivoHistoryModel.countDocuments({ ativoId: r.id })).toBe(1);
    });

    it('mudar para baixado exige observação', async () => {
      const r = await cadastro.criarAtivo(dadosPatrimonio('7'), String(autor));
      if (!r.ok) throw new Error('setup');
      const sem = await cadastro.alterarStatusAtivo({ id: r.id, status: 'baixado' }, String(autor));
      expect(sem.ok).toBe(false);
      const com = await cadastro.alterarStatusAtivo(
        { id: r.id, status: 'baixado', observacao: 'Laudo 12/2026' },
        String(autor),
      );
      expect(com.ok).toBe(true);
      const h = await AtivoHistoryModel.findOne({ ativoId: r.id, acao: 'alteracao_status' }).lean();
      expect(h?.de).toBe('Em operação');
      expect(h?.para).toBe('Baixado');
    });

    it('validar exige local e grava quem e quando', async () => {
      const r = await cadastro.criarAtivo(dadosPatrimonio('8'), String(autor));
      if (!r.ok) throw new Error('setup');
      expect((await cadastro.validarAtivo(r.id, String(autor))).ok).toBe(false);

      const predio = await localizacao.criarLocalizacao({ nome: 'Sede', tipo: 'predio' });
      if (!predio.ok) throw new Error('setup');
      await AtivoModel.updateOne({ _id: r.id }, { localizacaoId: predio.id });
      expect((await cadastro.validarAtivo(r.id, String(autor))).ok).toBe(true);
      const a = await AtivoModel.findById(r.id).lean();
      expect(a?.statusCadastro).toBe('validado');
      expect(String(a?.validadoPor)).toBe(String(autor));
      expect(a?.validadoEm).toBeInstanceOf(Date);
      expect(await AtivoHistoryModel.countDocuments({ ativoId: r.id, acao: 'validacao' })).toBe(1);

      // Validado não perde o local.
      const tirar = await cadastro.editarAtivo(
        {
          id: r.id,
          descricao: 'Split 12000',
          categoriaId,
          tierManutencao: 'A',
          criticidade: 'media',
        },
        String(autor),
      );
      expect(tirar.ok).toBe(false);
    });
  });

  describe('árvore de locais (AC-1, AC-2)', () => {
    it('só prédio fica na raiz, e prédio nunca tem pai', async () => {
      expect((await localizacao.criarLocalizacao({ nome: 'Sala', tipo: 'sala' })).ok).toBe(false);
      const p = await localizacao.criarLocalizacao({ nome: 'Sede', tipo: 'predio' });
      if (!p.ok) throw new Error('setup');
      const r = await localizacao.criarLocalizacao({
        nome: 'Anexo',
        tipo: 'predio',
        parentId: p.id,
      });
      expect(r.ok).toBe(false);
    });

    it('recusa nome irmão repetido sem diferenciar maiúsculas, mas aceita depois de desativar', async () => {
      const a = await localizacao.criarLocalizacao({ nome: 'Sede', tipo: 'predio' });
      const b = await localizacao.criarLocalizacao({ nome: 'SEDE', tipo: 'predio' });
      expect(b).toEqual({ ok: false, error: 'Já existe um local com esse nome aqui.' });
      if (!a.ok) throw new Error('setup');
      await localizacao.desativarLocalizacao(a.id);
      expect((await localizacao.criarLocalizacao({ nome: 'Sede', tipo: 'predio' })).ok).toBe(true);
    });

    it('acento conta: "Sé" e "Se" convivem', async () => {
      await localizacao.criarLocalizacao({ nome: 'Sé', tipo: 'predio' });
      expect((await localizacao.criarLocalizacao({ nome: 'Se', tipo: 'predio' })).ok).toBe(true);
    });

    it('renomear o prédio atualiza o caminho dos netos', async () => {
      const p = await localizacao.criarLocalizacao({ nome: 'Sede', tipo: 'predio' });
      if (!p.ok) throw new Error('setup');
      const andar = await localizacao.criarLocalizacao({
        nome: '3º andar',
        tipo: 'andar',
        parentId: p.id,
      });
      if (!andar.ok) throw new Error('setup');
      const sala = await localizacao.criarLocalizacao({
        nome: 'Sala 302',
        tipo: 'sala',
        parentId: andar.id,
      });
      if (!sala.ok) throw new Error('setup');
      expect((await LocalizacaoModel.findById(sala.id).lean())?.caminho).toBe(
        'Sede/3º andar/Sala 302',
      );

      expect((await localizacao.editarLocalizacao({ id: p.id, nome: 'Edifício Sede' })).ok).toBe(
        true,
      );
      expect((await LocalizacaoModel.findById(sala.id).lean())?.caminho).toBe(
        'Edifício Sede/3º andar/Sala 302',
      );
    });

    it('recusa mover um andar para dentro de uma sala dele', async () => {
      const p = await localizacao.criarLocalizacao({ nome: 'Sede', tipo: 'predio' });
      if (!p.ok) throw new Error('setup');
      const andar = await localizacao.criarLocalizacao({
        nome: '3º andar',
        tipo: 'andar',
        parentId: p.id,
      });
      if (!andar.ok) throw new Error('setup');
      const sala = await localizacao.criarLocalizacao({
        nome: 'Sala 302',
        tipo: 'sala',
        parentId: andar.id,
      });
      if (!sala.ok) throw new Error('setup');
      const r = await localizacao.editarLocalizacao({ id: andar.id, parentId: sala.id });
      expect(r.ok).toBe(false);
      expect((await LocalizacaoModel.findById(andar.id).lean())?.parentId?.toString()).toBe(p.id);
    });

    it('mover recalcula o caminho da subárvore', async () => {
      const a = await localizacao.criarLocalizacao({ nome: 'A', tipo: 'predio' });
      const b = await localizacao.criarLocalizacao({ nome: 'B', tipo: 'predio' });
      if (!a.ok || !b.ok) throw new Error('setup');
      const andar = await localizacao.criarLocalizacao({
        nome: '1º',
        tipo: 'andar',
        parentId: a.id,
      });
      if (!andar.ok) throw new Error('setup');
      const sala = await localizacao.criarLocalizacao({
        nome: 'S',
        tipo: 'sala',
        parentId: andar.id,
      });
      if (!sala.ok) throw new Error('setup');
      await localizacao.editarLocalizacao({ id: andar.id, parentId: b.id });
      expect((await LocalizacaoModel.findById(sala.id).lean())?.caminho).toBe('B/1º/S');
    });

    it('recusa desativar local com filho ativo ou com ativo vinculado', async () => {
      const p = await localizacao.criarLocalizacao({ nome: 'Sede', tipo: 'predio' });
      if (!p.ok) throw new Error('setup');
      const andar = await localizacao.criarLocalizacao({
        nome: '1º',
        tipo: 'andar',
        parentId: p.id,
      });
      if (!andar.ok) throw new Error('setup');
      expect((await localizacao.desativarLocalizacao(p.id)).ok).toBe(false);

      await cadastro.criarAtivo(
        { ...dadosPatrimonio('9'), localizacaoId: andar.id },
        String(autor),
      );
      expect((await localizacao.desativarLocalizacao(andar.id)).ok).toBe(false);
    });

    it('a subárvore do prédio inclui tudo abaixo e não confunde prefixo de nome', async () => {
      const sede = await localizacao.criarLocalizacao({ nome: 'Sede', tipo: 'predio' });
      const sedeB = await localizacao.criarLocalizacao({ nome: 'Sede B', tipo: 'predio' });
      if (!sede.ok || !sedeB.ok) throw new Error('setup');
      const andar = await localizacao.criarLocalizacao({
        nome: '1º',
        tipo: 'andar',
        parentId: sede.id,
      });
      if (!andar.ok) throw new Error('setup');
      const ids = (await localizacao.idsDaSubarvore(sede.id)).map(String).sort();
      expect(ids).toEqual([sede.id, andar.id].sort());
    });
  });

  describe('seletor e vínculo com chamado (AC-14, AC-16)', () => {
    async function ativoCom(codigo: string, campos: Record<string, unknown> = {}) {
      const a = await AtivoModel.create({
        codigo,
        origemCodigo: 'patrimonio',
        tombamento: codigo,
        descricao: `Equipamento ${codigo}`,
        categoriaId,
        criticidade: 'media',
        tierManutencao: 'A',
        statusCadastro: 'importado',
        ...campos,
      });
      return String(a._id);
    }

    it('a busca não mostra Tier C nem baixado', async () => {
      await ativoCom('100');
      await ativoCom('101', { tierManutencao: 'C' });
      await ativoCom('102', { status: 'baixado' });
      await ativoCom('103', { tierManutencao: 'B' });
      const itens = await seletor.buscarAtivosSeletor('10', 20);
      expect(itens.map((i) => i.codigo).sort()).toEqual(['100', '103']);
    });

    it('sugere tipo e subtipo só quando o subtipo é do tipo que o formulário usa', async () => {
      const tipo = await ServiceTypeModel.create({ name: 'Ar Condicionado' });
      const sub = await ServiceSubTypeModel.create({ typeId: tipo._id, name: 'Split' });
      await CategoriaAtivoModel.updateOne({ _id: categoriaId }, { serviceSubTypeId: sub._id });
      const id = await ativoCom('200');
      const item = await seletor.itemSeletorPorId(id);
      expect(item?.tipoServico).toBe('Ar-Condicionado');
      expect(item?.subtypeId).toBe(String(sub._id));

      // Um segundo tipo que também vira "Ar-Condicionado" e vem depois na ordem
      // por nome passa a ser o tipo do formulário: o subtipo antigo não vale mais.
      await ServiceTypeModel.create({ name: 'Ar-Condicionado Central' });
      const depois = await seletor.itemSeletorPorId(id);
      expect(depois?.tipoServico).toBe('Ar-Condicionado');
      expect(depois?.subtypeId).toBeUndefined();
    });

    it('categoria sem subtipo não sugere tipo', async () => {
      const item = await seletor.itemSeletorPorId(await ativoCom('201'));
      expect(item?.tipoServico).toBeUndefined();
      expect(item?.subtypeId).toBeUndefined();
    });

    it('vincula, troca e remove, com histórico; repetir o mesmo não grava', async () => {
      const a = await ativoCom('300');
      const b = await ativoCom('301');
      const c = await chamado();
      const id = String(c._id);

      expect((await vinculo.vincularAtivoAoChamado(id, a, String(autor))).ok).toBe(true);
      expect((await vinculo.vincularAtivoAoChamado(id, a, String(autor))).ok).toBe(true);
      expect((await vinculo.vincularAtivoAoChamado(id, b, String(autor))).ok).toBe(true);
      expect((await vinculo.vincularAtivoAoChamado(id, null, String(autor))).ok).toBe(true);

      const h = await ChamadoHistoryModel.find({ chamadoId: id, action: 'vinculo_ativo' })
        .sort({ createdAt: 1 })
        .lean();
      expect(h.map((x) => x.observacoes)).toEqual([
        'Equipamento: nenhum → 300',
        'Equipamento: 300 → 301',
        'Equipamento: 301 → nenhum',
      ]);
    });

    it('chamado encerrado ou recusado não muda e não grava histórico', async () => {
      const a = await ativoCom('400');
      for (const status of ['encerrado', 'recusado', 'cancelado']) {
        const c = await chamado({ status });
        const r = await vinculo.vincularAtivoAoChamado(String(c._id), a, String(autor));
        expect(r.ok).toBe(false);
        expect(await ChamadoHistoryModel.countDocuments({ chamadoId: c._id })).toBe(0);
      }
    });

    it('recusa vincular ativo Tier C ou baixado', async () => {
      const c = await chamado();
      const tierC = await ativoCom('500', { tierManutencao: 'C' });
      const baixado = await ativoCom('501', { status: 'baixado' });
      expect((await vinculo.vincularAtivoAoChamado(String(c._id), tierC, String(autor))).ok).toBe(
        false,
      );
      expect((await vinculo.vincularAtivoAoChamado(String(c._id), baixado, String(autor))).ok).toBe(
        false,
      );
    });
  });

  describe('ficha por perfil (AC-13)', () => {
    it('Solicitante não recebe dados patrimoniais nem link de chamado de outra pessoa', async () => {
      const ativo = await AtivoModel.create({
        codigo: '600',
        origemCodigo: 'patrimonio',
        tombamento: '600',
        descricao: 'Nobreak',
        categoriaId,
        criticidade: 'alta',
        tierManutencao: 'A',
        statusCadastro: 'importado',
        camposPatrimoniais: {
          responsavelNome: 'PESSOA FICTICIA',
          responsavelMatricula: 'XX1',
          importadoEm: new Date(),
        },
      });
      await AtivoHistoryModel.create({
        ativoId: ativo._id,
        acao: 'cadastro',
        actorType: 'sistema',
      });
      await chamado({ ativoId: ativo._id, solicitanteId: outroId });
      await chamado({ ativoId: ativo._id, solicitanteId });
      await chamado({ ativoId: ativo._id, solicitanteId: outroId, assignedToUserId: tecnicoId });

      const doSolicitante = await ficha.carregarFicha(String(ativo._id), {
        userId: String(solicitanteId),
        username: 's',
        role: 'Solicitante',
        isActive: true,
      });
      expect(doSolicitante?.camposPatrimoniais).toBeUndefined();
      expect(doSolicitante?.historico[0].autor).toBe('Sistema');
      expect(doSolicitante?.chamados).toHaveLength(3);
      expect(doSolicitante?.chamados.every((c) => c.descricao === undefined)).toBe(true);
      expect(doSolicitante?.chamados.filter((c) => c.href).length).toBe(1);

      const doTecnico = await ficha.carregarFicha(String(ativo._id), {
        userId: String(tecnicoId),
        username: 't',
        role: 'Técnico',
        isActive: true,
      });
      const hrefs = doTecnico?.chamados.map((c) => c.href).filter(Boolean);
      expect(hrefs).toHaveLength(1);
      expect(hrefs?.[0]).toMatch(/^\/chamados-atribuidos\//);

      const daGestao = await ficha.carregarFicha(String(ativo._id), {
        userId: String(autor),
        username: 'p',
        role: 'Preposto',
        isActive: true,
      });
      expect(daGestao?.camposPatrimoniais?.responsavelNome).toBe('PESSOA FICTICIA');
      expect(daGestao?.chamados.every((c) => c.href?.startsWith('/meus-chamados/'))).toBe(true);
      expect(daGestao?.chamados[0].descricao).toBe('Descrição sigilosa');
    });
  });

  /**
   * Achado da revisão: sem transação, se o histórico falhar a escrita é
   * desfeita, para nenhuma mudança ficar sem registro e a nova tentativa
   * funcionar (spec 0011, invariantes de auditoria).
   */
  describe('histórico que falha desfaz a escrita', () => {
    type Metodos = Record<'create' | 'insertMany', (...args: unknown[]) => Promise<unknown>>;
    const falhaUmaVez = (model: object, metodo: 'create' | 'insertMany') =>
      vi.spyOn(model as Metodos, metodo).mockRejectedValueOnce(new Error('histórico caiu'));

    it('vínculo: o chamado volta ao equipamento anterior e a nova tentativa grava o histórico', async () => {
      const a = String(
        (
          await AtivoModel.create({
            codigo: '700',
            origemCodigo: 'patrimonio',
            descricao: 'x',
            categoriaId,
            criticidade: 'media',
            tierManutencao: 'A',
            statusCadastro: 'importado',
          })
        )._id,
      );
      const c = await chamado();
      falhaUmaVez(ChamadoHistoryModel, 'create');
      await expect(vinculo.vincularAtivoAoChamado(String(c._id), a, String(autor))).rejects.toThrow(
        'histórico caiu',
      );
      expect((await ChamadoModel.findById(c._id).lean())?.ativoId ?? null).toBeNull();

      expect(await vinculo.vincularAtivoAoChamado(String(c._id), a, String(autor))).toEqual({
        ok: true,
        mudou: true,
      });
      expect(
        await ChamadoHistoryModel.countDocuments({ chamadoId: c._id, action: 'vinculo_ativo' }),
      ).toBe(1);
    });

    it('cadastro: o ativo sem histórico não fica no banco', async () => {
      falhaUmaVez(AtivoHistoryModel, 'create');
      await expect(cadastro.criarAtivo(dadosPatrimonio('701'), String(autor))).rejects.toThrow(
        'histórico caiu',
      );
      expect(await AtivoModel.countDocuments({ codigo: '701' })).toBe(0);
      expect((await cadastro.criarAtivo(dadosPatrimonio('701'), String(autor))).ok).toBe(true);
    });

    it('edição: os campos voltam ao que eram e nenhum histórico parcial fica', async () => {
      const r = await cadastro.criarAtivo(dadosPatrimonio('702'), String(autor));
      if (!r.ok) throw new Error('setup');
      falhaUmaVez(AtivoHistoryModel, 'insertMany');
      const dados = {
        id: r.id,
        descricao: 'Nova descrição',
        categoriaId,
        tierManutencao: 'B' as const,
        fabricante: 'Marca',
        criticidade: 'alta' as const,
      };
      await expect(cadastro.editarAtivo(dados, String(autor))).rejects.toThrow('histórico caiu');
      const a = await AtivoModel.findById(r.id).lean();
      expect([a?.descricao, a?.tierManutencao, a?.fabricante, a?.criticidade]).toEqual([
        'Split 12000',
        'A',
        null,
        'media',
      ]);
      expect(await AtivoHistoryModel.countDocuments({ ativoId: r.id, acao: 'edicao' })).toBe(0);
    });

    it('status: volta ao anterior', async () => {
      const r = await cadastro.criarAtivo(dadosPatrimonio('703'), String(autor));
      if (!r.ok) throw new Error('setup');
      falhaUmaVez(AtivoHistoryModel, 'create');
      await expect(
        cadastro.alterarStatusAtivo(
          { id: r.id, status: 'inoperante', observacao: 'x' },
          String(autor),
        ),
      ).rejects.toThrow('histórico caiu');
      expect((await AtivoModel.findById(r.id).lean())?.status).toBe('em_operacao');
    });

    it('validação: volta para a situação de antes, sem quem e quando', async () => {
      const p = await localizacao.criarLocalizacao({ nome: 'Sede', tipo: 'predio' });
      if (!p.ok) throw new Error('setup');
      const r = await cadastro.criarAtivo(
        { ...dadosPatrimonio('704'), localizacaoId: p.id },
        String(autor),
      );
      if (!r.ok) throw new Error('setup');
      falhaUmaVez(AtivoHistoryModel, 'create');
      await expect(cadastro.validarAtivo(r.id, String(autor))).rejects.toThrow('histórico caiu');
      const a = await AtivoModel.findById(r.id).lean();
      expect([a?.statusCadastro, a?.validadoPor ?? null, a?.validadoEm ?? null]).toEqual([
        'em_vistoria',
        null,
        null,
      ]);
    });
  });

  it('a ficha mostra só os 100 registros mais recentes do histórico', async () => {
    const a = await AtivoModel.create({
      codigo: '800',
      origemCodigo: 'patrimonio',
      descricao: 'x',
      categoriaId,
      criticidade: 'media',
      tierManutencao: 'A',
      statusCadastro: 'importado',
    });
    await AtivoHistoryModel.insertMany(
      Array.from({ length: 105 }, (_, i) => ({
        ativoId: a._id,
        acao: 'edicao',
        actorType: 'sistema',
        observacao: `n${i}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      })),
    );
    const f = await ficha.carregarFicha(String(a._id), {
      userId: String(autor),
      username: 'p',
      role: 'Preposto',
      isActive: true,
    });
    expect(f?.historico).toHaveLength(ficha.LIMITE_HISTORICO_FICHA);
    expect(f?.historico[0].observacao).toBe('n104');
  });
});
