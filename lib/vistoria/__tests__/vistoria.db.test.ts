import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * A vistoria contra o Mongo de verdade (spec 0012, parte 1): uma campanha
 * aberta por vez, a primeira conferência que chega vence, o reenvio do mesmo
 * `clientOpId` não grava nada de novo e a queda no meio é retomada. Índice
 * único e corrida não se provam com mock.
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('vistoria, contra o Mongo', () => {
  let campanha: typeof import('../campanha');
  let sinc: typeof import('../sincronizacao');
  let pacote: typeof import('../pacote');
  let cobertura: typeof import('../cobertura');
  let ContadorModel: typeof import('@/models/Contador').ContadorModel;
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let AtivoHistoryModel: typeof import('@/models/AtivoHistory').AtivoHistoryModel;
  let CategoriaAtivoModel: typeof import('@/models/CategoriaAtivo').CategoriaAtivoModel;
  let LocalizacaoModel: typeof import('@/models/Localizacao').LocalizacaoModel;
  let CampanhaVistoriaModel: typeof import('@/models/CampanhaVistoria').CampanhaVistoriaModel;
  let ConferenciaVistoriaModel: typeof import('@/models/ConferenciaVistoria').ConferenciaVistoriaModel;
  let UserModel: typeof import('@/models/user.model').UserModel;
  let todos: ModelDeTeste[];

  let preposto: { userId: string; role: string };
  let tecnico: { userId: string; role: string };
  let campanhaId: string;
  let ativoId: string;
  let predioId: string;
  let salaId: string;
  let outraSalaId: string;
  let categoriaId: string;
  let n = 0;

  const uuid = () => {
    n += 1;
    return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  };

  const op = (extra: Record<string, unknown> = {}) => ({
    clientOpId: uuid(),
    tipo: 'conferencia',
    campanhaId,
    ativoId,
    localizacaoId: salaId,
    conferidoEm: new Date().toISOString(),
    ...extra,
  });

  beforeAll(async () => {
    campanha = await import('../campanha');
    sinc = await import('../sincronizacao');
    pacote = await import('../pacote');
    cobertura = await import('../cobertura');
    ({ ContadorModel } = await import('@/models/Contador'));
    ({ AtivoModel } = await import('@/models/Ativo'));
    ({ AtivoHistoryModel } = await import('@/models/AtivoHistory'));
    ({ CategoriaAtivoModel } = await import('@/models/CategoriaAtivo'));
    ({ LocalizacaoModel } = await import('@/models/Localizacao'));
    ({ CampanhaVistoriaModel } = await import('@/models/CampanhaVistoria'));
    ({ ConferenciaVistoriaModel } = await import('@/models/ConferenciaVistoria'));
    ({ UserModel } = await import('@/models/user.model'));
    todos = [
      AtivoModel,
      AtivoHistoryModel,
      CategoriaAtivoModel,
      LocalizacaoModel,
      CampanhaVistoriaModel,
      ConferenciaVistoriaModel,
      UserModel,
      ContadorModel,
    ];
    await conectarMongoDeTeste(todos, 'severino_test_vistoria');
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    const [p, t] = await UserModel.create([
      { username: 'preposto', name: 'Paula Preposto', role: 'Preposto', email: 'p@x.gov.br' },
      { username: 'tecnico', name: 'Tiago Técnico', role: 'Técnico', email: 't@x.gov.br' },
    ]);
    preposto = { userId: String(p._id), role: 'Preposto' };
    tecnico = { userId: String(t._id), role: 'Técnico' };

    const cat = await CategoriaAtivoModel.create({
      chave: 'climatizacao',
      nome: 'Climatização',
      criticidadePadrao: 'media',
    });
    categoriaId = String(cat._id);
    const predio = await LocalizacaoModel.create({ nome: 'Sede', tipo: 'predio', caminho: 'Sede' });
    predioId = String(predio._id);
    const [sala, outra] = await LocalizacaoModel.create([
      { nome: 'Sala 1', tipo: 'sala', parentId: predio._id, caminho: 'Sede/Sala 1' },
      { nome: 'Sala 2', tipo: 'sala', parentId: predio._id, caminho: 'Sede/Sala 2' },
    ]);
    salaId = String(sala._id);
    outraSalaId = String(outra._id);

    const ativo = await AtivoModel.create({
      codigo: '11997',
      origemCodigo: 'patrimonio',
      tombamento: '11997',
      descricao: 'Split 12000 BTU',
      categoriaId: cat._id,
      fabricante: 'Midea',
      modelo: 'X1',
      numeroSerie: 'S-1',
      criticidade: 'media',
      tierManutencao: 'A',
      statusCadastro: 'importado',
      camposPatrimoniais: {
        responsavelNome: 'Fulano de Tal',
        responsavelMatricula: '123',
        importadoEm: new Date(),
      },
    });
    ativoId = String(ativo._id);

    const r = await campanha.abrirCampanha('Vistoria inicial', preposto.userId);
    if (!r.ok) throw new Error(r.error);
    campanhaId = r.id;
  });

  describe('campanha (AC-1)', () => {
    it('recusa abrir uma segunda enquanto há uma aberta, com o nome dela', async () => {
      const r = await campanha.abrirCampanha('Outra', preposto.userId);
      expect(r).toEqual({ ok: false, error: 'Já existe uma campanha aberta: Vistoria inicial' });
    });

    it('o índice parcial barra duas abertas mesmo gravando direto', async () => {
      await expect(
        CampanhaVistoriaModel.create({
          nome: 'Paralela',
          abertaPor: new Types.ObjectId(),
          abertaEm: new Date(),
        }),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it('encerrar grava quem e quando, e não encerra de novo', async () => {
      expect(await campanha.encerrarCampanha(campanhaId, preposto.userId)).toEqual({ ok: true });
      const c = await CampanhaVistoriaModel.findById(campanhaId).lean();
      expect(c?.status).toBe('encerrada');
      expect(String(c?.encerradaPor)).toBe(preposto.userId);
      expect(c?.encerradaEm).toBeInstanceOf(Date);
      expect((await campanha.encerrarCampanha(campanhaId, preposto.userId)).ok).toBe(false);
      // Encerrada, abre-se outra.
      expect((await campanha.abrirCampanha('Segunda', preposto.userId)).ok).toBe(true);
    });
  });

  describe('pacote (AC-3)', () => {
    it('não leva dados patrimoniais e traz as conferências com o nome do autor', async () => {
      await sinc.processarLote([op()], tecnico);
      const c = await campanha.campanhaAberta();
      const p = await pacote.montarPacote(c!);
      expect(JSON.stringify(p)).not.toContain('Fulano');
      expect(JSON.stringify(p)).not.toContain('camposPatrimoniais');
      expect(p.ativos).toHaveLength(1);
      expect(p.ativos[0]).toMatchObject({ codigo: '11997', ausenteNoSicam: false });
      expect(p.conferidos).toEqual([
        expect.objectContaining({ ativoId, autorNome: 'Tiago Técnico' }),
      ]);
      expect(p.locais.map((l) => l.id)).toContain(predioId);
    });

    it('marca ausenteNoSicam sem levar a data', async () => {
      await AtivoModel.updateOne(
        { _id: ativoId },
        { $set: { 'camposPatrimoniais.ausenteNoSicamDesde': new Date() } },
      );
      const p = await pacote.montarPacote((await campanha.campanhaAberta())!);
      expect(p.ativos[0].ausenteNoSicam).toBe(true);
    });
  });

  describe('conferência (AC-5)', () => {
    it('põe o local, só os campos enviados, valida e grava o histórico', async () => {
      const [r] = await sinc.processarLote([op({ modelo: 'X2' })], tecnico);
      expect(r).toMatchObject({ estado: 'aceita', ativoId, codigo: '11997' });

      const a = await AtivoModel.findById(ativoId).lean();
      expect(String(a?.localizacaoId)).toBe(salaId);
      expect(a?.modelo).toBe('X2');
      expect(a?.fabricante).toBe('Midea');
      expect(a?.numeroSerie).toBe('S-1');
      expect(a?.statusCadastro).toBe('validado');
      expect(String(a?.validadoPor)).toBe(tecnico.userId);
      expect(a?.camposPatrimoniais?.responsavelNome).toBe('Fulano de Tal');

      const h = await AtivoHistoryModel.find({ ativoId }).lean();
      const acoes = h.map((x) => x.acao).sort();
      expect(acoes).toEqual(['alteracao_localizacao', 'conferencia', 'validacao']);
      const conf = h.find((x) => x.acao === 'conferencia');
      expect(conf?.para).toBe('Vistoria inicial');
      expect(conf?.observacao).toBe('Campos alterados: modelo');
      expect(h.find((x) => x.acao === 'alteracao_localizacao')).toMatchObject({
        de: 'sem local',
        para: 'Sede/Sala 1',
      });

      const c = await ConferenciaVistoriaModel.findOne({ ativoId }).lean();
      expect(c?.papelAutor).toBe('contratada');
      expect(c?.efeitoAplicadoEm).toBeInstanceOf(Date);
    });

    it('campo em branco mantém o valor atual', async () => {
      await sinc.processarLote([op({ numeroSerie: '   ' })], preposto);
      const a = await AtivoModel.findById(ativoId).lean();
      expect(a?.numeroSerie).toBe('S-1');
      const conf = await AtivoHistoryModel.findOne({ ativoId, acao: 'conferencia' }).lean();
      expect(conf?.observacao).toBeNull();
    });

    it('não reescreve validadoPor de ativo já validado', async () => {
      const outro = new Types.ObjectId();
      await AtivoModel.updateOne(
        { _id: ativoId },
        { $set: { statusCadastro: 'validado', validadoPor: outro, localizacaoId: salaId } },
      );
      await sinc.processarLote([op()], tecnico);
      const a = await AtivoModel.findById(ativoId).lean();
      expect(String(a?.validadoPor)).toBe(String(outro));
      const acoes = (await AtivoHistoryModel.find({ ativoId }).lean()).map((x) => x.acao);
      expect(acoes).toEqual(['conferencia']);
    });
  });

  describe('reenvio e queda (AC-7)', () => {
    it('o mesmo lote duas vezes grava uma conferência e um conjunto de históricos', async () => {
      const lote = [op({ modelo: 'X2' })];
      const primeira = await sinc.processarLote(lote, tecnico);
      const segunda = await sinc.processarLote(lote, tecnico);
      expect(segunda).toEqual(primeira);
      expect(await ConferenciaVistoriaModel.countDocuments()).toBe(1);
      expect(await AtivoHistoryModel.countDocuments({ ativoId })).toBe(3);
    });

    it('conferência gravada sem efeito: o reenvio aplica o local e responde aceita', async () => {
      const o = op();
      await ConferenciaVistoriaModel.create({
        campanhaId,
        ativoId,
        autorId: tecnico.userId,
        papelAutor: 'contratada',
        localizacaoId: salaId,
        conferidoEm: new Date(),
        recebidoEm: new Date(),
        clientOpId: o.clientOpId,
      });
      const [r] = await sinc.processarLote([o], tecnico);
      expect(r).toMatchObject({ estado: 'aceita', codigo: '11997' });
      const a = await AtivoModel.findById(ativoId).lean();
      expect(String(a?.localizacaoId)).toBe(salaId);
      const c = await ConferenciaVistoriaModel.findOne({ clientOpId: o.clientOpId }).lean();
      expect(c?.efeitoAplicadoEm).toBeInstanceOf(Date);
    });

    it('clientOpId de outra pessoa não devolve o resultado dela', async () => {
      const o = op();
      await sinc.processarLote([o], tecnico);
      const [r] = await sinc.processarLote([o], preposto);
      expect(r.estado).toBe('recusada');
    });
  });

  describe('a primeira que chega vence (AC-8)', () => {
    it('duas conferências ao mesmo tempo: uma aceita, outra ja_conferido', async () => {
      const [r1, r2] = await Promise.all([
        sinc.processarOperacao(op({ localizacaoId: salaId, modelo: 'A' }), tecnico),
        sinc.processarOperacao(op({ localizacaoId: outraSalaId, modelo: 'B' }), preposto),
      ]);
      const estados = [r1.estado, r2.estado].sort();
      expect(estados).toEqual(['aceita', 'ja_conferido']);
      const aceita = r1.estado === 'aceita' ? 'A' : 'B';
      const perdedora = r1.estado === 'aceita' ? r2 : r1;
      const a = await AtivoModel.findById(ativoId).lean();
      expect(a?.modelo).toBe(aceita);
      expect(perdedora.conferidoPor).toBe(aceita === 'A' ? 'Tiago Técnico' : 'Paula Preposto');
      expect(perdedora.conferidoEm).toBeTruthy();
      expect(await ConferenciaVistoriaModel.countDocuments()).toBe(1);
    });
  });

  describe('campanha encerrada e relógio adiantado (AC-9)', () => {
    it('aceita a feita antes do encerramento e recusa a de depois', async () => {
      const antes = new Date(Date.now() - 60_000).toISOString();
      await campanha.encerrarCampanha(campanhaId, preposto.userId);
      const depois = new Date(Date.now() + 1000).toISOString();
      const [ok] = await sinc.processarLote([op({ conferidoEm: antes })], tecnico);
      expect(ok.estado).toBe('aceita');
      await ConferenciaVistoriaModel.deleteMany({});
      const [no] = await sinc.processarLote([op({ conferidoEm: depois })], tecnico);
      // `conferidoEm` no futuro vira `recebidoEm`, que é depois do encerramento.
      expect(no).toMatchObject({ estado: 'recusada', mensagem: 'Campanha encerrada' });
    });

    it('conferidoEm no futuro é gravado igual a recebidoEm', async () => {
      const futuro = new Date(Date.now() + 86_400_000).toISOString();
      await sinc.processarLote([op({ conferidoEm: futuro })], tecnico);
      const c = await ConferenciaVistoriaModel.findOne({ ativoId }).lean();
      expect(c?.conferidoEm.getTime()).toBe(c?.recebidoEm.getTime());
    });
  });

  describe('recusas (AC-10) e lote misto (AC-6)', () => {
    it('ativo baixado, Tier C, inexistente e local desativado não gravam nada', async () => {
      const baixado = await AtivoModel.create({
        codigo: '2',
        origemCodigo: 'patrimonio',
        descricao: 'x',
        categoriaId,
        criticidade: 'media',
        tierManutencao: 'A',
        status: 'baixado',
        statusCadastro: 'importado',
      });
      const tierC = await AtivoModel.create({
        codigo: '3',
        origemCodigo: 'patrimonio',
        descricao: 'x',
        categoriaId,
        criticidade: 'media',
        tierManutencao: 'C',
        statusCadastro: 'importado',
      });
      await LocalizacaoModel.updateOne({ _id: outraSalaId }, { $set: { isActive: false } });

      const r = await sinc.processarLote(
        [
          op({ ativoId: String(baixado._id) }),
          op({ ativoId: String(tierC._id) }),
          op({ ativoId: String(new Types.ObjectId()) }),
          op({ localizacaoId: outraSalaId }),
        ],
        tecnico,
      );
      expect(r.map((x) => x.mensagem)).toEqual([
        'Ativo baixado ou fora dos tiers A e B',
        'Ativo baixado ou fora dos tiers A e B',
        'Ativo inexistente',
        'Local inexistente ou desativado',
      ]);
      expect(await ConferenciaVistoriaModel.countDocuments()).toBe(0);
      expect(await AtivoHistoryModel.countDocuments()).toBe(0);
    });

    it('uma malformada volta recusada e as outras do lote seguem', async () => {
      const boa = op();
      const r = await sinc.processarLote(
        [{ clientOpId: 'lixo', tipo: 'conferencia' }, 'nem objeto', boa],
        tecnico,
      );
      expect(r.map((x) => x.estado)).toEqual(['recusada', 'recusada', 'aceita']);
      expect(r[0].clientOpId).toBe('lixo');
      expect(r[2].clientOpId).toBe(boa.clientOpId);
    });
  });

  describe('cadastro em campo (AC-11 a AC-13)', () => {
    const cadastro = (extra: Record<string, unknown> = {}) => ({
      clientOpId: uuid(),
      tipo: 'cadastro',
      campanhaId,
      origemCodigo: 'interno',
      descricao: 'Elevador social 1',
      categoriaId,
      tierManutencao: 'A',
      localizacaoId: salaId,
      conferidoEm: new Date().toISOString(),
      ...extra,
    });

    it('interno nasce validado com MNT, origemOpId, histórico e a conferência', async () => {
      const o = cadastro({ fabricante: 'Atlas' });
      const [r] = await sinc.processarLote([o], tecnico);
      expect(r).toMatchObject({ estado: 'aceita', codigo: 'MNT-0001' });

      const novo = await AtivoModel.findById(r.ativoId).lean();
      expect(novo).toMatchObject({
        codigo: 'MNT-0001',
        origemCodigo: 'interno',
        statusCadastro: 'validado',
        status: 'em_operacao',
        criticidade: 'media',
        tierManutencao: 'A',
        fabricante: 'Atlas',
        origemOpId: o.clientOpId,
      });
      expect(String(novo?.validadoPor)).toBe(tecnico.userId);
      expect(String(novo?.localizacaoId)).toBe(salaId);

      const hist = await AtivoHistoryModel.find({ ativoId: r.ativoId }).lean();
      expect(hist.map((h) => h.acao)).toEqual(['cadastro']);
      expect(hist[0].observacao).toBe('Cadastro em campo: Vistoria inicial');

      const conf = await ConferenciaVistoriaModel.findOne({ clientOpId: o.clientOpId }).lean();
      expect(conf?.cadastradoEmCampo).toBe(true);
      expect(conf?.papelAutor).toBe('contratada');
      expect(conf?.efeitoAplicadoEm).toBeInstanceOf(Date);
    });

    it('reenviar o mesmo cadastro não gasta outro MNT nem cria outro ativo', async () => {
      const o = cadastro();
      const [a] = await sinc.processarLote([o], preposto);
      const [b] = await sinc.processarLote([o], preposto);
      expect(b).toEqual(a);
      expect(await AtivoModel.countDocuments({ origemCodigo: 'interno' })).toBe(1);
      expect((await ContadorModel.findOne().lean())?.seq).toBe(1);
    });

    it('queda depois de criar o ativo: o reenvio acha por origemOpId', async () => {
      const o = cadastro();
      const [a] = await sinc.processarLote([o], preposto);
      // Simula a queda: o ativo nasceu, a conferência não.
      await ConferenciaVistoriaModel.deleteMany({ clientOpId: o.clientOpId });

      const [b] = await sinc.processarLote([o], preposto);
      expect(b).toMatchObject({ estado: 'aceita', ativoId: a.ativoId, codigo: 'MNT-0001' });
      expect(await AtivoModel.countDocuments({ origemCodigo: 'interno' })).toBe(1);
      expect((await ContadorModel.findOne().lean())?.seq).toBe(1);
      expect(await ConferenciaVistoriaModel.countDocuments({ clientOpId: o.clientOpId })).toBe(1);
    });

    it('patrimoniado novo usa o tombo normalizado como código', async () => {
      const [r] = await sinc.processarLote(
        [cadastro({ origemCodigo: 'patrimonio', tombamento: ' 0042 ' })],
        preposto,
      );
      expect(r).toMatchObject({ estado: 'aceita', codigo: '42' });
      expect(await AtivoModel.findOne({ codigo: '42' }).lean()).toMatchObject({
        origemCodigo: 'patrimonio',
        tombamento: '42',
      });
    });

    it('tombo que o servidor já tem vira conferência, com o aviso, também no reenvio', async () => {
      const o = cadastro({ origemCodigo: 'patrimonio', tombamento: '0011997', modelo: 'X2' });
      const [r] = await sinc.processarLote([o], tecnico);
      expect(r).toMatchObject({
        estado: 'aceita',
        ativoId,
        codigo: '11997',
        mensagem: 'O ativo 11997 já existia; registrado como conferência',
      });
      expect(await AtivoModel.countDocuments()).toBe(1);
      const ativo = await AtivoModel.findById(ativoId).lean();
      expect(String(ativo?.localizacaoId)).toBe(salaId);
      expect(ativo?.modelo).toBe('X2');
      expect(ativo?.descricao).toBe('Split 12000 BTU');
      const conf = await ConferenciaVistoriaModel.findOne({ clientOpId: o.clientOpId }).lean();
      expect(conf?.cadastradoEmCampo).toBe(false);

      const [deNovo] = await sinc.processarLote([o], tecnico);
      expect(deNovo).toEqual(r);
    });

    it('tombo existente já conferido na campanha volta ja_conferido', async () => {
      await sinc.processarLote([op()], preposto);
      const [r] = await sinc.processarLote(
        [cadastro({ origemCodigo: 'patrimonio', tombamento: '11997' })],
        tecnico,
      );
      expect(r).toMatchObject({ estado: 'ja_conferido', conferidoPor: 'Paula Preposto' });
    });

    it('categoria desativada, tier C e patrimoniado sem tombo voltam recusados sem gravar', async () => {
      await CategoriaAtivoModel.updateOne({ _id: categoriaId }, { $set: { isActive: false } });
      const r = await sinc.processarLote(
        [
          cadastro(),
          cadastro({ tierManutencao: 'C' }),
          cadastro({ origemCodigo: 'patrimonio', tombamento: '' }),
        ],
        preposto,
      );
      expect(r.map((x) => x.estado)).toEqual(['recusada', 'recusada', 'recusada']);
      expect(r[0].mensagem).toBe('Categoria inexistente ou desativada.');
      expect(await AtivoModel.countDocuments()).toBe(1);
      expect(await ConferenciaVistoriaModel.countDocuments()).toBe(0);
    });
  });

  describe('cobertura por prédio (AC-2)', () => {
    it('conta os vistoriáveis do prédio e só as conferências que ainda valem', async () => {
      await AtivoModel.create([
        {
          codigo: '500',
          origemCodigo: 'patrimonio',
          tombamento: '500',
          descricao: 'Split 9000 BTU',
          categoriaId,
          localizacaoId: outraSalaId,
          criticidade: 'media',
          tierManutencao: 'B',
          statusCadastro: 'importado',
        },
        // Tier C não é vistoriável e não entra no total.
        {
          codigo: '501',
          origemCodigo: 'patrimonio',
          tombamento: '501',
          descricao: 'Cadeira',
          categoriaId,
          localizacaoId: outraSalaId,
          criticidade: 'baixa',
          tierManutencao: 'C',
          statusCadastro: 'importado',
        },
      ]);

      let c = await cobertura.calcularCobertura(campanhaId);
      expect(c.semLocal).toBe(1);
      expect(c.predios).toEqual([
        { id: predioId, nome: 'Sede', total: 1, conferidos: 0, percentual: 0 },
      ]);

      await sinc.processarLote([op()], preposto);
      c = await cobertura.calcularCobertura(campanhaId);
      expect(c.semLocal).toBe(0);
      expect(c.predios[0]).toMatchObject({ total: 2, conferidos: 1, percentual: 50 });

      // Conferência de ativo que deixou de ser vistoriável não conta.
      await AtivoModel.updateOne({ _id: ativoId }, { $set: { status: 'baixado' } });
      c = await cobertura.calcularCobertura(campanhaId);
      expect(c.predios[0]).toMatchObject({ total: 1, conferidos: 0, percentual: 0 });
    });
  });
});
