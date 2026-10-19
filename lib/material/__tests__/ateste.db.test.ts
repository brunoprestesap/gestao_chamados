import { createHash } from 'node:crypto';

import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

/**
 * A fatia 2 da cotação de material contra o MongoDB de verdade (spec 0019):
 * o gestor registra o recebimento provisório e o definitivo, o responsável
 * técnico registra a nota fiscal da atestada, e o lado TRF1 gera o PDF da
 * cotação com o SHA-256 dos bytes gravado na emissão.
 *
 * covers: AC-9, AC-15, AC-16, AC-21, AC-22, AC-23
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

const DIA = 24 * 60 * 60 * 1000;
/** Um dia de Belém, `YYYY-MM-DD`. */
const diaEmBelem = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem' }).format(d);
/** A autorização das cotações de teste: dez dias atrás, para a NF de ontem passar. */
const AUTORIZADA_EM = new Date(Date.now() - 10 * DIA);
const ONTEM = diaEmBelem(new Date(Date.now() - DIA));

rodar('ateste, nota fiscal e PDF da cotação, contra o Mongo', () => {
  let t: typeof import('../transicoes');
  let pdf: typeof import('../pdf/gerar');
  let leitura: typeof import('../leitura');
  let M: {
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    User: typeof import('@/models/user.model').UserModel;
    Cotacao: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
    Evento: typeof import('@/models/CotacaoMaterialEvento').CotacaoMaterialEventoModel;
    Arquivo: typeof import('@/models/ArquivoCotacao').ArquivoCotacaoModel;
    Designacao: typeof import('@/models/DesignacaoMaterial').DesignacaoMaterialModel;
    Notification: typeof import('@/models/Notification').NotificationModel;
    Emissao: typeof import('@/models/CotacaoMaterialPdfEmissao').CotacaoMaterialPdfEmissaoModel;
  };
  let todos: ModelDeTeste[];

  const ids = {
    tecnico: String(new Types.ObjectId()),
    rt: String(new Types.ObjectId()),
    gestor: String(new Types.ObjectId()),
    fiscal: String(new Types.ObjectId()),
    admin: String(new Types.ObjectId()),
  };
  const usuario = (userId: string, role: string) => ({ tipo: 'usuario' as const, userId, role });

  beforeAll(async () => {
    t = await import('../transicoes');
    pdf = await import('../pdf/gerar');
    leitura = await import('../leitura');
    M = {
      Chamado: (await import('@/models/Chamado')).ChamadoModel,
      User: (await import('@/models/user.model')).UserModel,
      Cotacao: (await import('@/models/CotacaoMaterial')).CotacaoMaterialModel,
      Evento: (await import('@/models/CotacaoMaterialEvento')).CotacaoMaterialEventoModel,
      Arquivo: (await import('@/models/ArquivoCotacao')).ArquivoCotacaoModel,
      Designacao: (await import('@/models/DesignacaoMaterial')).DesignacaoMaterialModel,
      Notification: (await import('@/models/Notification')).NotificationModel,
      Emissao: (await import('@/models/CotacaoMaterialPdfEmissao')).CotacaoMaterialPdfEmissaoModel,
    };
    todos = Object.values(M).map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_ateste');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    await M.User.collection.insertMany([
      {
        _id: new Types.ObjectId(ids.tecnico),
        username: 'tec',
        name: 'Técnico',
        role: 'Técnico',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(ids.rt),
        username: 'rt',
        name: 'Resp. Técnico',
        role: 'Preposto',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(ids.gestor),
        username: 'gestor',
        name: 'Gestora',
        role: 'Admin',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(ids.admin),
        username: 'admin',
        name: 'Admin sem designação',
        role: 'Admin',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(ids.fiscal),
        username: 'fiscal',
        name: 'Fiscal',
        role: 'Admin',
        isActive: true,
      },
    ]);
    const designar = (userId: string, papel: string) =>
      M.Designacao.create({
        userId: new Types.ObjectId(userId),
        papel: papel as never,
        vigenciaInicio: '2000-01-01',
        ato: 'Portaria de teste',
        criadoPorUserId: new Types.ObjectId(),
        em: new Date(),
      });
    await designar(ids.rt, 'responsavel_tecnico');
    await designar(ids.gestor, 'gestor');
    await designar(ids.fiscal, 'fiscal');
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  /**
   * Uma cotação já `executada`, gravada direto, com um evento de execução na
   * trilha. `extra` sobrescreve campos (situação, nota fiscal, `updatedAt`).
   */
  async function executada(extra: Record<string, unknown> = {}): Promise<string> {
    const chamadoId = new Types.ObjectId();
    await M.Chamado.collection.insertOne({
      _id: chamadoId,
      ticket_number: `CHM-T-${String(chamadoId).slice(-5)}`,
      titulo: 'Quadro elétrico',
      status: 'em atendimento',
      assignedToUserId: new Types.ObjectId(ids.tecnico),
      solicitanteId: new Types.ObjectId(),
      createdAt: new Date(),
    });
    const _id = new Types.ObjectId();
    const agora = new Date();
    await M.Cotacao.collection.insertOne({
      _id,
      numero: `COT-T-${String(_id).slice(-5)}`,
      chamadoId,
      situacao: 'executada',
      emTramite: false,
      versao: 7,
      itens: [
        {
          _id: new Types.ObjectId(),
          descricao: 'Disjuntor 40 A',
          unidade: 'un',
          quantidade: 2,
          motivo: 'Trocar o queimado',
          doDiagnostico: true,
          origem: 'orcamento',
          baseAplicada: 'orcamento',
          precoAplicadoCentavos: 10_00,
          quantidadeExecutada: 2,
          valorExecutadoCentavos: 20_00,
          referencias: [],
          conferencia: null,
        },
      ],
      orcamentos: [],
      diagnosticadoPorUserId: new Types.ObjectId(ids.tecnico),
      diagnosticadoEm: agora,
      montadoPorUserId: new Types.ObjectId(ids.rt),
      valorTotalCentavos: 20_00,
      valorAutorizadoCentavos: 20_00,
      autorizadoEm: AUTORIZADA_EM,
      executadoEm: agora,
      valorExecutadoCentavos: 20_00,
      recebimentoProvisorio: null,
      recebimentoDefinitivo: null,
      notaFiscal: null,
      advertencias: [],
      createdAt: agora,
      updatedAt: agora,
      ...extra,
    });
    await M.Evento.create({
      cotacaoId: _id,
      de: 'autorizada',
      para: 'executada',
      acao: 'executar',
      autorUserId: new Types.ObjectId(ids.tecnico),
      autorNome: 'Técnico',
      papel: 'tecnico',
      em: agora,
    });
    return String(_id);
  }

  async function arquivoNf(cotacaoId: string, tipo = 'nota_fiscal'): Promise<string> {
    const a = await M.Arquivo.create({
      cotacaoId: new Types.ObjectId(cotacaoId),
      tipo,
      nomeOriginal: 'nf.pdf',
      mimeType: 'application/pdf',
      tamanho: 10,
      caminho: `cotacoes/${cotacaoId}/x.pdf`,
      enviadoPorUserId: new Types.ObjectId(ids.rt),
      em: new Date(),
    });
    return String(a._id);
  }

  const esperarAvisos = () => new Promise((r) => setTimeout(r, 100));

  it('provisório e definitivo: só o gestor, nessa ordem, e o definitivo atesta (AC-21)', async () => {
    const id = await executada();

    const antes = await t.transicionar({
      cotacaoId: id,
      acao: 'receber_definitivo',
      versao: 7,
      ator: usuario(ids.gestor, 'Admin'),
    });
    expect(antes).toMatchObject({ ok: false, error: expect.stringMatching(/provisório/) });

    const fiscal = await t.transicionar({
      cotacaoId: id,
      acao: 'receber_provisorio',
      versao: 7,
      ator: usuario(ids.fiscal, 'Admin'),
    });
    expect(fiscal.ok).toBe(false);

    const prov = await t.transicionar({
      cotacaoId: id,
      acao: 'receber_provisorio',
      versao: 7,
      ator: usuario(ids.gestor, 'Admin'),
    });
    expect(prov).toMatchObject({ ok: true, situacao: 'executada', versao: 8 });
    let cot = (await M.Cotacao.findById(id).lean())!;
    expect(String(cot.recebimentoProvisorio?.porUserId)).toBe(ids.gestor);

    // O provisório não muda a situação, então não avisa ninguém.
    await esperarAvisos();
    expect(await M.Notification.countDocuments({})).toBe(0);

    const deNovo = await t.transicionar({
      cotacaoId: id,
      acao: 'receber_provisorio',
      versao: 8,
      ator: usuario(ids.gestor, 'Admin'),
    });
    expect(deNovo).toMatchObject({ ok: false, error: expect.stringMatching(/já foi registrado/) });

    const def = await t.transicionar({
      cotacaoId: id,
      acao: 'receber_definitivo',
      versao: 8,
      ator: usuario(ids.gestor, 'Admin'),
    });
    expect(def).toMatchObject({ ok: true, situacao: 'atestada' });
    cot = (await M.Cotacao.findById(id).lean())!;
    expect(cot.situacao).toBe('atestada');
    expect(cot.emTramite).toBe(false);
    expect(cot.recebimentoDefinitivo?.em).toBeInstanceOf(Date);

    // A trilha leva os dois atos com o papel do gestor (AC-9).
    const eventos = await M.Evento.find({ cotacaoId: new Types.ObjectId(id) })
      .sort({ em: 1, _id: 1 })
      .lean();
    expect(eventos.map((e) => [e.acao, e.de, e.para, e.papel])).toEqual([
      ['executar', 'autorizada', 'executada', 'tecnico'],
      ['receber_provisorio', 'executada', 'executada', 'gestor'],
      ['receber_definitivo', 'executada', 'atestada', 'gestor'],
    ]);

    // A atestada avisa quem montou, sem valor.
    await esperarAvisos();
    const avisos = await M.Notification.find({}).lean();
    expect(avisos.map((a) => String(a.userId))).toEqual([ids.rt]);
    expect(JSON.stringify(avisos)).not.toMatch(/R\$|2000/);
  });

  it('nota fiscal: só na atestada, só o responsável técnico, com arquivo de NF e uma vez (AC-22)', async () => {
    const id = await executada();
    const arquivoId = await arquivoNf(id);
    const nf = { numero: '123', data: ONTEM, arquivoId };

    const cedo = await t.transicionar({
      cotacaoId: id,
      acao: 'registrar_nf',
      versao: 7,
      notaFiscal: nf,
      ator: usuario(ids.rt, 'Preposto'),
    });
    expect(cedo.ok).toBe(false);

    await t.transicionar({
      cotacaoId: id,
      acao: 'receber_provisorio',
      versao: 7,
      ator: usuario(ids.gestor, 'Admin'),
    });
    await t.transicionar({
      cotacaoId: id,
      acao: 'receber_definitivo',
      versao: 8,
      ator: usuario(ids.gestor, 'Admin'),
    });

    const gestor = await t.transicionar({
      cotacaoId: id,
      acao: 'registrar_nf',
      versao: 9,
      notaFiscal: nf,
      ator: usuario(ids.gestor, 'Admin'),
    });
    expect(gestor.ok).toBe(false);

    const orcamento = await arquivoNf(id, 'orcamento');
    const errado = await t.transicionar({
      cotacaoId: id,
      acao: 'registrar_nf',
      versao: 9,
      notaFiscal: { ...nf, arquivoId: orcamento },
      ator: usuario(ids.rt, 'Preposto'),
    });
    expect(errado).toMatchObject({ ok: false, error: expect.stringMatching(/arquivo da nota/) });

    const ok = await t.transicionar({
      cotacaoId: id,
      acao: 'registrar_nf',
      versao: 9,
      notaFiscal: nf,
      ator: usuario(ids.rt, 'Preposto'),
    });
    expect(ok).toMatchObject({ ok: true, situacao: 'atestada' });
    const cot = (await M.Cotacao.findById(id).lean())!;
    expect(cot.notaFiscal?.numero).toBe('123');
    expect(String(cot.notaFiscal?.arquivoId)).toBe(arquivoId);

    const segunda = await t.transicionar({
      cotacaoId: id,
      acao: 'registrar_nf',
      versao: ok.ok ? ok.versao : 0,
      notaFiscal: nf,
      ator: usuario(ids.rt, 'Preposto'),
    });
    expect(segunda).toMatchObject({ ok: false, error: expect.stringMatching(/já foi registrada/) });
  });

  it('o PDF sai só para o lado TRF1 e grava o SHA-256 dos bytes entregues (AC-23)', async () => {
    const id = await executada();

    const r = await pdf.gerarPdfCotacao({
      cotacaoId: id,
      sessao: { userId: ids.fiscal, role: 'Admin' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(r.nomeArquivo).toMatch(/^cotacao-COT-T-.+\.pdf$/);
    const emissao = await M.Emissao.findById(r.emissaoId).lean();
    expect(emissao?.sha256).toBe(createHash('sha256').update(r.bytes).digest('hex'));
    expect(String(emissao?.porUserId)).toBe(ids.fiscal);
    expect(emissao?.papel).toBe('fiscal');

    // A emissão é só de inclusão.
    await expect(
      M.Emissao.updateOne({ _id: r.emissaoId }, { $set: { sha256: '0'.repeat(64) } }),
    ).rejects.toThrow();

    for (const sessao of [
      { userId: ids.rt, role: 'Preposto' },
      { userId: ids.tecnico, role: 'Técnico' },
    ]) {
      expect(await pdf.gerarPdfCotacao({ cotacaoId: id, sessao })).toMatchObject({
        ok: false,
        status: 403,
      });
    }
    expect(
      await pdf.gerarPdfCotacao({
        cotacaoId: String(new Types.ObjectId()),
        sessao: { userId: ids.fiscal, role: 'Admin' },
      }),
    ).toMatchObject({ ok: false, status: 404 });
    expect(await M.Emissao.countDocuments({})).toBe(1);
  });

  /** Leva a cotação de `executada` até `atestada` pelos dois recebimentos. */
  async function atestar(id: string) {
    for (const [acao, versao] of [
      ['receber_provisorio', 7],
      ['receber_definitivo', 8],
    ] as const) {
      const r = await t.transicionar({
        cotacaoId: id,
        acao,
        versao,
        ator: usuario(ids.gestor, 'Admin'),
      });
      if (!r.ok) throw new Error(r.error);
    }
  }

  it('nota fiscal: recusa data futura, arquivo de outra cotação e arquivo removido (AC-22)', async () => {
    const id = await executada();
    const outra = await executada();
    await atestar(id);
    const nf = { numero: '77', data: ONTEM, arquivoId: await arquivoNf(id) };
    const tentar = (dados: typeof nf) =>
      t.transicionar({
        cotacaoId: id,
        acao: 'registrar_nf',
        versao: 9,
        notaFiscal: dados,
        ator: usuario(ids.rt, 'Preposto'),
      });

    expect(await tentar({ ...nf, data: '2999-01-01' })).toMatchObject({
      ok: false,
      error: 'A data da nota fiscal não pode ser posterior a hoje.',
    });
    expect(await tentar({ ...nf, arquivoId: await arquivoNf(outra) })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/arquivo da nota/),
    });
    const removido = await arquivoNf(id);
    await M.Arquivo.collection.updateOne(
      { _id: new Types.ObjectId(removido) },
      { $set: { removidoEm: new Date() } },
    );
    expect(await tentar({ ...nf, arquivoId: removido })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/arquivo da nota/),
    });
    expect((await M.Cotacao.findById(id).lean())?.notaFiscal).toBeNull();
  });

  it('a nota fiscal registrada avisa os gestores, sem valor (AC-16, AC-22)', async () => {
    const id = await executada();
    await atestar(id);
    await esperarAvisos();
    await M.Notification.collection.deleteMany({});

    const r = await t.transicionar({
      cotacaoId: id,
      acao: 'registrar_nf',
      versao: 9,
      notaFiscal: { numero: '88', data: ONTEM, arquivoId: await arquivoNf(id) },
      ator: usuario(ids.rt, 'Preposto'),
    });
    expect(r.ok).toBe(true);
    await esperarAvisos();
    const avisos = await M.Notification.find({}).lean();
    expect(avisos.map((a) => [String(a.userId), a.title])).toEqual([
      [ids.gestor, expect.stringMatching(/^Nota fiscal registrada na cotação COT-T-/)],
    ]);
    expect(JSON.stringify(avisos)).not.toMatch(/R\$|2000/);
    // O evento leva a marca da NF, para o cliente não mostrar o toast de "atestada".
    expect(avisos[0]?.data).toMatchObject({ situacao: 'atestada', aviso: 'nota_fiscal' });
  });

  it('a contratada não perde a atestada que ainda deve a nota fiscal, por mais velha que seja (AC-22)', async () => {
    const velho = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const semNf = await executada({ situacao: 'atestada', updatedAt: velho });
    const comNf = await executada({
      situacao: 'atestada',
      updatedAt: velho,
      notaFiscal: {
        numero: '1',
        data: velho,
        arquivoId: new Types.ObjectId(),
        porUserId: new Types.ObjectId(ids.rt),
        em: velho,
      },
    });
    const rt = { userId: ids.rt, role: 'Preposto' };

    for (const aba of ['minhas', 'ateste', 'todas'] as const) {
      const fila = await leitura.listarFila(rt, aba);
      const vistas = fila?.linhas.map((l) => l.id) ?? [];
      expect(vistas).toContain(semNf);
      expect(vistas).not.toContain(comNf);
    }
    const detalhe = await leitura.lerDetalhe(semNf, rt);
    expect(detalhe?.cotacao.visao).toBe('contratada');
    expect(detalhe?.acoes.registrarNotaFiscal).toBe(true);
    expect(await leitura.lerDetalhe(comNf, rt)).toBeNull();
    const linha = (await leitura.listarFila(rt, 'ateste'))?.linhas.find((l) => l.id === semNf);
    expect(linha?.notaFiscalPendente).toBe(true);
  });

  it('o selo de atraso é só do lado TRF1; a contratada vê as datas do recebimento (AC-21)', async () => {
    const id = await executada({ executadoEm: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });
    await t.transicionar({
      cotacaoId: id,
      acao: 'receber_provisorio',
      versao: 7,
      ator: usuario(ids.gestor, 'Admin'),
    });

    const trf1 = await leitura.lerDetalhe(id, { userId: ids.gestor, role: 'Admin' });
    expect(trf1?.cotacao.prazoAteste).toMatchObject({ etapa: 'definitivo' });
    expect(trf1?.cotacao.recebimentoProvisorio?.porNome).toBe('Gestora');
    const rt = await leitura.lerDetalhe(id, { userId: ids.rt, role: 'Preposto' });
    expect(rt?.cotacao.prazoAteste).toBeUndefined();
    // A contratada vê a data do recebimento, sem o nome de quem recebeu, nem na trilha.
    expect(rt?.cotacao.recebimentoProvisorio).toMatchObject({
      porNome: null,
      em: expect.any(String),
    });
    expect(rt?.cotacao.executadoEm).toEqual(expect.any(String));
    const atoNaTrilha = rt?.cotacao.trilha?.find((e) => e.acao === 'receber_provisorio');
    expect(atoNaTrilha).toMatchObject({ autorNome: null, papel: 'gestor' });
    expect(JSON.stringify(rt?.cotacao)).not.toContain('Gestora');
    // A execução do técnico continua com o nome dele.
    expect(rt?.cotacao.trilha?.find((e) => e.acao === 'executar')?.autorNome).toBe('Técnico');

    const filaRt = await leitura.listarFila({ userId: ids.rt, role: 'Preposto' }, 'todas');
    expect(filaRt?.linhas.find((l) => l.id === id)?.prazoAteste).toBeNull();
    const atesteRt = await leitura.listarFila({ userId: ids.rt, role: 'Preposto' }, 'ateste');
    expect(atesteRt?.linhas.find((l) => l.id === id)).toMatchObject({
      prazoAteste: null,
      recebimentoProvisorioEm: expect.any(String),
      recebimentoDefinitivoEm: null,
    });
    const filaGestor = await leitura.listarFila({ userId: ids.gestor, role: 'Admin' }, 'ateste');
    expect(filaGestor?.linhas.find((l) => l.id === id)?.prazoAteste?.atrasado).toBe(false);
  });

  it('o Admin sem designação gera o PDF com papel admin; o rascunho dá 404 ao TRF1 (AC-23)', async () => {
    const rascunho = await executada({ situacao: 'rascunho', emTramite: true });
    expect(
      await pdf.gerarPdfCotacao({
        cotacaoId: rascunho,
        sessao: { userId: ids.fiscal, role: 'Admin' },
      }),
    ).toMatchObject({ ok: false, status: 404 });

    const id = await executada();
    const r = await pdf.gerarPdfCotacao({
      cotacaoId: id,
      sessao: { userId: ids.admin, role: 'Admin' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const emissao = await M.Emissao.findById(r.emissaoId).lean();
    expect(emissao).toMatchObject({ papel: 'admin' });
    expect(String(emissao?.porUserId)).toBe(ids.admin);
    // Gerar o PDF é a única ação do Admin sem designação.
    const leitor = await leitura.lerDetalhe(id, { userId: ids.admin, role: 'Admin' });
    expect(leitor?.acoes.gerarPdf).toBe(true);
    expect(leitor?.acoes.receberProvisorio).toBe(false);
  });

  it('quem não é TRF1 recebe 403 antes da busca, mesmo com id inexistente ou rascunho (AC-23)', async () => {
    const rascunho = await executada({ situacao: 'rascunho', emTramite: true });
    for (const cotacaoId of [String(new Types.ObjectId()), rascunho, 'nao-e-id']) {
      expect(
        await pdf.gerarPdfCotacao({ cotacaoId, sessao: { userId: ids.rt, role: 'Preposto' } }),
      ).toMatchObject({ ok: false, status: 403 });
    }
    expect(await M.Emissao.countDocuments({})).toBe(0);
  });

  it('a emissão grava o papel da designação (AC-23)', async () => {
    const id = await executada();
    const r = await pdf.gerarPdfCotacao({
      cotacaoId: id,
      sessao: { userId: ids.gestor, role: 'Admin' },
    });
    if (!r.ok) throw new Error(r.error);
    expect(await M.Emissao.findById(r.emissaoId).lean()).toMatchObject({ papel: 'gestor' });
  });

  it('a NF anterior ao dia da autorização é recusada; a do próprio dia passa (AC-22)', async () => {
    const id = await executada();
    await atestar(id);
    const arquivoId = await arquivoNf(id);
    const base = {
      cotacaoId: id,
      acao: 'registrar_nf' as const,
      versao: 9,
      ator: usuario(ids.rt, 'Preposto'),
    };
    const antes = await t.transicionar({
      ...base,
      notaFiscal: {
        numero: '5',
        data: diaEmBelem(new Date(AUTORIZADA_EM.getTime() - DIA)),
        arquivoId,
      },
    });
    expect(antes).toMatchObject({
      ok: false,
      error: 'A data da nota fiscal não pode ser anterior ao dia da autorização.',
    });
    const noDia = await t.transicionar({
      ...base,
      notaFiscal: { numero: '5', data: diaEmBelem(AUTORIZADA_EM), arquivoId },
    });
    expect(noDia.ok).toBe(true);
  });

  it('dois cliques na NF gravam uma e avisam uma vez (AC-16, AC-22)', async () => {
    const id = await executada();
    await atestar(id);
    await esperarAvisos();
    await M.Notification.collection.deleteMany({});
    const arquivoId = await arquivoNf(id);
    const clique = () =>
      t.transicionar({
        cotacaoId: id,
        acao: 'registrar_nf',
        versao: 9,
        notaFiscal: { numero: '9', data: ONTEM, arquivoId },
        ator: usuario(ids.rt, 'Preposto'),
      });
    const resultados = await Promise.all([clique(), clique()]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    await esperarAvisos();
    expect(await M.Notification.countDocuments({})).toBe(1);
    expect(
      await M.Evento.countDocuments({ cotacaoId: new Types.ObjectId(id), acao: 'registrar_nf' }),
    ).toBe(1);
  });

  it('dois cliques no provisório gravam um só (AC-21)', async () => {
    const id = await executada();
    const clique = () =>
      t.transicionar({
        cotacaoId: id,
        acao: 'receber_provisorio',
        versao: 7,
        ator: usuario(ids.gestor, 'Admin'),
      });
    const resultados = await Promise.all([clique(), clique()]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(
      await M.Evento.countDocuments({
        cotacaoId: new Types.ObjectId(id),
        acao: 'receber_provisorio',
      }),
    ).toBe(1);
  });

  it('a NF registrada tira a cotação da contratada 90 dias depois do registro (AC-15)', async () => {
    const velho = new Date(Date.now() - 200 * DIA);
    const notaFiscal = (em: Date) => ({
      numero: '1',
      data: velho,
      arquivoId: new Types.ObjectId(),
      porUserId: new Types.ObjectId(ids.rt),
      em,
    });
    const recente = await executada({
      situacao: 'atestada',
      updatedAt: new Date(Date.now() - 30 * DIA),
      notaFiscal: notaFiscal(new Date(Date.now() - 30 * DIA)),
    });
    const antiga = await executada({
      situacao: 'atestada',
      updatedAt: new Date(Date.now() - 91 * DIA),
      notaFiscal: notaFiscal(new Date(Date.now() - 91 * DIA)),
    });
    const rt = { userId: ids.rt, role: 'Preposto' };
    const vistas = (await leitura.listarFila(rt, 'todas'))?.linhas.map((l) => l.id) ?? [];
    expect(vistas).toContain(recente);
    expect(vistas).not.toContain(antiga);
    expect((await leitura.lerDetalhe(recente, rt))?.cotacao.visao).toBe('contratada');
    expect(await leitura.lerDetalhe(antiga, rt)).toBeNull();
  });

  it('a contratada só tem Minhas ações, Ateste e Todas; a aba de análise cai em Minhas ações (AC-21)', async () => {
    const rt = await leitura.listarFila({ userId: ids.rt, role: 'Preposto' }, 'analise');
    expect(rt?.abas).toEqual(['minhas', 'ateste', 'todas']);
    expect(rt?.aba).toBe('minhas');
    const fiscal = await leitura.listarFila({ userId: ids.fiscal, role: 'Admin' }, 'analise');
    expect(fiscal?.aba).toBe('analise');
    expect(fiscal?.abas).toHaveLength(5);
  });
});
