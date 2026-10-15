import { rm } from 'node:fs/promises';
import path from 'node:path';

import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

const emitToRoom = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom }));
const enviarEmailCotacao = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('@/lib/email/aviso-cotacao', () => ({ enviarEmailCotacao }));

/**
 * Arquivos e avisos da cotação de material contra o MongoDB de verdade (spec
 * 0019): quem envia cada tipo de arquivo e em que situação, quem baixa, e
 * quem recebe o aviso de cada situação, sem valor em canal nenhum.
 *
 * covers: AC-10, AC-15, AC-16
 */

function cru(m: {
  createIndexes(): PromiseLike<unknown>;
  collection: { deleteMany(f: object): Promise<unknown>; indexes(): Promise<unknown> };
}): ModelDeTeste {
  return {
    createIndexes: () => m.createIndexes(),
    deleteMany: (f) => m.collection.deleteMany(f),
    collection: m.collection,
  };
}

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('arquivos e avisos da cotação de material, contra o Mongo', () => {
  let arquivos: typeof import('../arquivos');
  let avisos: typeof import('../avisos');
  let M: {
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    User: typeof import('@/models/user.model').UserModel;
    Cotacao: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
    Arquivo: typeof import('@/models/ArquivoCotacao').ArquivoCotacaoModel;
    Designacao: typeof import('@/models/DesignacaoMaterial').DesignacaoMaterialModel;
    Faixa: typeof import('@/models/FaixaCompetencia').FaixaCompetenciaModel;
    Notification: typeof import('@/models/Notification').NotificationModel;
  };
  let todos: ModelDeTeste[];
  const criadas: string[] = [];

  const ids = {
    tecnico: String(new Types.ObjectId()),
    rt: String(new Types.ObjectId()),
    fiscal: String(new Types.ObjectId()),
    gestor: String(new Types.ObjectId()),
    aprovPequeno: String(new Types.ObjectId()),
    aprovGrande: String(new Types.ObjectId()),
    solicitante: String(new Types.ObjectId()),
    estranho: String(new Types.ObjectId()),
  };
  const sessao = (userId: string, role = 'Admin') => ({ userId, role });
  const PDF = new TextEncoder().encode('%PDF-1.4');

  beforeAll(async () => {
    arquivos = await import('../arquivos');
    avisos = await import('../avisos');
    M = {
      Chamado: (await import('@/models/Chamado')).ChamadoModel,
      User: (await import('@/models/user.model')).UserModel,
      Cotacao: (await import('@/models/CotacaoMaterial')).CotacaoMaterialModel,
      Arquivo: (await import('@/models/ArquivoCotacao')).ArquivoCotacaoModel,
      Designacao: (await import('@/models/DesignacaoMaterial')).DesignacaoMaterialModel,
      Faixa: (await import('@/models/FaixaCompetencia')).FaixaCompetenciaModel,
      Notification: (await import('@/models/Notification')).NotificationModel,
    };
    todos = Object.values(M).map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_arquivos');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    vi.clearAllMocks();
    await M.User.collection.insertMany(
      Object.entries(ids).map(([k, id]) => ({
        _id: new Types.ObjectId(id),
        username: k,
        name: k,
        email: `${k}@teste`,
        role: k === 'rt' ? 'Preposto' : k === 'tecnico' ? 'Técnico' : 'Admin',
        isActive: true,
      })),
    );
    const pequena = await M.Faixa.create({
      nome: 'P',
      limiteCentavos: 15_00,
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });
    const grande = await M.Faixa.create({
      nome: 'G',
      limiteCentavos: 1_000_00,
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });
    for (const [userId, papel, faixaId] of [
      [ids.rt, 'responsavel_tecnico', null],
      [ids.fiscal, 'fiscal', null],
      [ids.gestor, 'gestor', null],
      [ids.aprovPequeno, 'aprovador', pequena._id],
      [ids.aprovGrande, 'aprovador', grande._id],
    ] as const) {
      await M.Designacao.create({
        userId: new Types.ObjectId(userId),
        papel,
        faixaId,
        vigenciaInicio: '2000-01-01',
        ato: 'Portaria',
        criadoPorUserId: new Types.ObjectId(),
        em: new Date(),
      });
    }
  });

  afterAll(async () => {
    const { UPLOADS_ROOT } = await import('@/lib/uploads/arquivo');
    for (const id of criadas) {
      await rm(path.join(UPLOADS_ROOT, 'cotacoes', id), { recursive: true, force: true });
    }
    await desconectarMongoDeTeste();
  });

  async function cotacao(situacao: string, extra: Record<string, unknown> = {}) {
    const chamadoId = new Types.ObjectId();
    await M.Chamado.collection.insertOne({
      _id: chamadoId,
      ticket_number: `CHM-A-${String(chamadoId).slice(-6)}`,
      titulo: 'Teste',
      status: 'em atendimento',
      assignedToUserId: new Types.ObjectId(ids.tecnico),
      solicitanteId: new Types.ObjectId(ids.solicitante),
    });
    const c = await M.Cotacao.create({
      numero: `COT-T-${String(chamadoId).slice(-6)}`,
      chamadoId,
      situacao,
      emTramite: !['executada', 'atestada', 'reprovada', 'cancelada'].includes(situacao),
      itens: [{ descricao: 'x', unidade: 'un', quantidade: 1, motivo: 'y' }],
      diagnosticadoPorUserId: new Types.ObjectId(ids.tecnico),
      diagnosticadoEm: new Date(),
      montadoPorUserId: new Types.ObjectId(ids.rt),
      valorTotalCentavos: 20_00,
      ...extra,
    });
    criadas.push(String(c._id));
    return String(c._id);
  }

  const salvar = (
    cotacaoId: string,
    tipo: 'orcamento' | 'evidencia' | 'nota_fiscal',
    userId: string,
    role: string,
  ) =>
    arquivos.salvarArquivoCotacao({
      cotacaoId,
      tipo,
      conteudo: PDF,
      nomeOriginal: '../../etc/passwd.pdf',
      mimeType: 'application/pdf',
      sessao: sessao(userId, role),
    });

  describe('salvarArquivoCotacao', () => {
    it('o responsável técnico envia orçamento no rascunho, e o disco não usa o nome original', async () => {
      const id = await cotacao('rascunho');
      const r = await salvar(id, 'orcamento', ids.rt, 'Preposto');
      expect(r.ok).toBe(true);
      const arq = await M.Arquivo.findOne({}).lean();
      expect(arq?.caminho).toBe(`cotacoes/${id}/${r.ok ? r.arquivoId : ''}.pdf`);
      expect(arq?.nomeOriginal).toBe('../../etc/passwd.pdf');
    });

    it('orçamento fora de rascunho ou devolvida é recusado com 409', async () => {
      const id = await cotacao('enviada');
      expect(await salvar(id, 'orcamento', ids.rt, 'Preposto')).toMatchObject({
        ok: false,
        status: 409,
      });
    });

    it('quem não é responsável técnico não envia orçamento (403)', async () => {
      const id = await cotacao('rascunho');
      expect(await salvar(id, 'orcamento', ids.tecnico, 'Técnico')).toMatchObject({
        ok: false,
        status: 403,
      });
    });

    it('evidência só do técnico atribuído e só na autorizada (AC-10)', async () => {
      const id = await cotacao('autorizada');
      expect(await salvar(id, 'evidencia', ids.rt, 'Preposto')).toMatchObject({
        ok: false,
        status: 403,
      });
      expect((await salvar(id, 'evidencia', ids.tecnico, 'Técnico')).ok).toBe(true);
      const outra = await cotacao('em_aprovacao');
      expect(await salvar(outra, 'evidencia', ids.tecnico, 'Técnico')).toMatchObject({
        ok: false,
        status: 409,
      });
    });

    it('nota fiscal só depois do ateste', async () => {
      const id = await cotacao('executada');
      expect(await salvar(id, 'nota_fiscal', ids.rt, 'Preposto')).toMatchObject({
        ok: false,
        status: 409,
      });
    });

    it('até 10 arquivos ativos por tipo; o 11º é recusado (409)', async () => {
      const id = await cotacao('rascunho');
      for (let i = 0; i < 10; i++)
        expect((await salvar(id, 'orcamento', ids.rt, 'Preposto')).ok).toBe(true);
      expect(await salvar(id, 'orcamento', ids.rt, 'Preposto')).toMatchObject({
        ok: false,
        status: 409,
      });
    });

    it('cotação inexistente devolve 404', async () => {
      expect(
        await salvar(String(new Types.ObjectId()), 'orcamento', ids.rt, 'Preposto'),
      ).toMatchObject({
        ok: false,
        status: 404,
      });
    });
  });

  describe('arquivoParaBaixar (AC-15)', () => {
    async function comArquivos() {
      const id = await cotacao('autorizada');
      const orc = await M.Arquivo.create({
        cotacaoId: id,
        tipo: 'orcamento',
        nomeOriginal: 'o.pdf',
        mimeType: 'application/pdf',
        tamanho: 1,
        caminho: `cotacoes/${id}/o.pdf`,
        enviadoPorUserId: ids.rt,
        em: new Date(),
      });
      const evid = await M.Arquivo.create({
        cotacaoId: id,
        tipo: 'evidencia',
        nomeOriginal: 'e.pdf',
        mimeType: 'application/pdf',
        tamanho: 1,
        caminho: `cotacoes/${id}/e.pdf`,
        enviadoPorUserId: ids.tecnico,
        em: new Date(),
      });
      return { orc: String(orc._id), evid: String(evid._id) };
    }

    it('lado TRF1 e responsável técnico baixam o orçamento', async () => {
      const a = await comArquivos();
      expect((await arquivos.arquivoParaBaixar(a.orc, sessao(ids.fiscal))).ok).toBe(true);
      expect((await arquivos.arquivoParaBaixar(a.orc, sessao(ids.rt, 'Preposto'))).ok).toBe(true);
    });

    it('o técnico baixa a evidência, mas não o orçamento', async () => {
      const a = await comArquivos();
      expect((await arquivos.arquivoParaBaixar(a.evid, sessao(ids.tecnico, 'Técnico'))).ok).toBe(
        true,
      );
      expect(await arquivos.arquivoParaBaixar(a.orc, sessao(ids.tecnico, 'Técnico'))).toEqual({
        ok: false,
        status: 403,
      });
    });

    it('o solicitante e um estranho não baixam nada', async () => {
      const a = await comArquivos();
      for (const quem of [
        sessao(ids.solicitante, 'Solicitante'),
        sessao(ids.estranho, 'Solicitante'),
      ]) {
        expect(await arquivos.arquivoParaBaixar(a.evid, quem)).toEqual({ ok: false, status: 403 });
        expect(await arquivos.arquivoParaBaixar(a.orc, quem)).toEqual({ ok: false, status: 403 });
      }
    });

    it('arquivo removido ou id inválido devolve 404', async () => {
      const a = await comArquivos();
      await M.Arquivo.updateOne({ _id: a.orc }, { $set: { removidoEm: new Date() } });
      expect(await arquivos.arquivoParaBaixar(a.orc, sessao(ids.fiscal))).toEqual({
        ok: false,
        status: 404,
      });
      expect(await arquivos.arquivoParaBaixar('nao-e-id', sessao(ids.fiscal))).toEqual({
        ok: false,
        status: 404,
      });
    });

    it('o rascunho não é baixado pelo lado TRF1 (AC-1)', async () => {
      const id = await cotacao('rascunho');
      const orc = await M.Arquivo.create({
        cotacaoId: id,
        tipo: 'orcamento',
        nomeOriginal: 'o.pdf',
        mimeType: 'application/pdf',
        tamanho: 1,
        caminho: `cotacoes/${id}/o.pdf`,
        enviadoPorUserId: ids.rt,
        em: new Date(),
      });
      expect(await arquivos.arquivoParaBaixar(String(orc._id), sessao(ids.fiscal))).toEqual({
        ok: false,
        status: 403,
      });
    });

    it('caminho gravado fora do formato não resolve (sem path traversal)', () => {
      expect(arquivos.caminhoDoArquivoCotacao('cotacoes/../../segredo/x.pdf')).toBeNull();
      expect(arquivos.caminhoDoArquivoCotacao('outra/abc/x.pdf')).toBeNull();
    });
  });

  describe('avisarSituacao (AC-16)', () => {
    const quem = async () =>
      (await M.Notification.find({ type: 'material:cotacao' }).lean())
        .map((n) => String(n.userId))
        .sort();

    it.each([
      ['rascunho', ['rt']],
      ['enviada', ['fiscal']],
      ['executada', ['gestor']],
      ['atestada', ['rt']],
    ] as const)('%s avisa quem age na etapa seguinte', async (situacao, esperados) => {
      const id = await cotacao(situacao);
      await avisos.avisarSituacao(id, situacao, null);
      expect(await quem()).toEqual(esperados.map((k) => ids[k]).sort());
    });

    it('em aprovação avisa só os aprovadores cuja faixa cobre o valor', async () => {
      const id = await cotacao('em_aprovacao');
      await avisos.avisarSituacao(id, 'em_aprovacao', null);
      expect(await quem()).toEqual([ids.aprovGrande]);
    });

    it.each(['devolvida', 'reprovada', 'autorizada', 'cancelada'] as const)(
      '%s avisa quem montou e o técnico atribuído, cada um com o próprio destino',
      async (situacao) => {
        const id = await cotacao(situacao);
        await avisos.avisarSituacao(id, situacao, null);
        const ns = await M.Notification.find({ type: 'material:cotacao' }).lean();
        const destino = Object.fromEntries(
          ns.map((n) => [String(n.userId), (n.data as { destino: string }).destino]),
        );
        expect(destino).toEqual({ [ids.rt]: 'cotacoes', [ids.tecnico]: 'chamado' });
      },
    );

    it('quem agiu não recebe o próprio aviso', async () => {
      const id = await cotacao('devolvida');
      await avisos.avisarSituacao(id, 'devolvida', ids.rt);
      expect(await quem()).toEqual([ids.tecnico]);
    });

    it('nenhum canal leva valor: Notification, e-mail e Socket.IO', async () => {
      const id = await cotacao('autorizada', { valorTotalCentavos: 123_45 });
      await avisos.avisarSituacao(id, 'autorizada', null);
      const ns = await M.Notification.find({}).lean();
      expect(JSON.stringify(ns)).not.toMatch(/R\$|12345|123,45/);
      expect(enviarEmailCotacao).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(enviarEmailCotacao.mock.calls)).not.toMatch(/R\$|12345|123,45/);
      expect(emitToRoom).toHaveBeenCalledWith(
        `user:${ids.tecnico}`,
        'material:cotacao_situacao',
        expect.not.objectContaining({ valorTotalCentavos: expect.anything() }),
      );
      expect(JSON.stringify(emitToRoom.mock.calls)).not.toMatch(/12345/);
    });

    it('o e-mail leva o técnico ao chamado e o resto à cotação', async () => {
      const id = await cotacao('autorizada');
      await avisos.avisarSituacao(id, 'autorizada', null);
      const urls = enviarEmailCotacao.mock.calls.map((c) => c[2]).sort();
      const cot = await M.Cotacao.findById(id).lean();
      expect(urls).toEqual(
        [`/chamados-atribuidos/${String(cot?.chamadoId)}`, `/cotacoes/${id}`].sort(),
      );
    });

    it('falha no banco não lança (fire and forget)', async () => {
      await expect(avisos.avisarSituacao('nao-e-id', 'enviada', null)).resolves.toBeUndefined();
    });
  });
});
