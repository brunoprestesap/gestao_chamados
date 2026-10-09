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
 * Documentos do ativo contra o Mongo de verdade (spec 0013): o índice único
 * parcial, a corrida de duas gravações (com e sem vigente anterior), a marca
 * condicional do job rodando duas vezes e em paralelo, a correção que limpa
 * marcas, o ativo baixado e o cruzamento do que falta. Nada disso se prova com mock.
 */

// O disco fica de fora: guardamos quais pastas de documento ficaram com arquivo.
const disco = vi.hoisted(() => new Set<string>());
// Barreira das corridas: o disco é o passo entre ler o vigente e gravar, então
// segurar ali as duas chamadas garante que as duas leram antes de qualquer
// escrita. Sem ela, às vezes a segunda lê depois da primeira já ter gravado e
// faz uma substituição normal (AC-4), e o teste de corrida falha por tempo.
const barreira = vi.hoisted(() => ({ esperadas: 0, chegaram: 0, soltar: () => {} }));
vi.mock('../arquivo', () => ({
  gravarArquivo: async (id: string, filename: string) => {
    if (barreira.esperadas > 0) {
      barreira.chegaram += 1;
      if (barreira.chegaram < barreira.esperadas) {
        await new Promise<void>((ok) => (barreira.soltar = ok));
      } else {
        barreira.esperadas = 0;
        barreira.soltar();
      }
    }
    disco.add(id);
    return `/fake/${id}/${filename}`;
  },
  apagarArquivo: async (id: string) => {
    disco.delete(id);
  },
  caminhoDoArquivo: () => null,
}));
const emails = vi.hoisted(() => ({ total: 0 }));
vi.mock('@/lib/email/vencimento-documento', () => ({
  enviarEmailVencimento: async () => {
    emails.total += 1;
    return true;
  },
}));

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('documentos do ativo, contra o Mongo', () => {
  let gravar: typeof import('../gravar');
  let job: typeof import('../alerta-job');
  let painel: typeof import('../painel');
  let fichaDocs: typeof import('../ficha');
  let categoria: typeof import('../../categoria');
  let DocumentoAtivoModel: typeof import('@/models/DocumentoAtivo').DocumentoAtivoModel;
  let TipoDocumentoModel: typeof import('@/models/TipoDocumento').TipoDocumentoModel;
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let AtivoHistoryModel: typeof import('@/models/AtivoHistory').AtivoHistoryModel;
  let CategoriaAtivoModel: typeof import('@/models/CategoriaAtivo').CategoriaAtivoModel;
  let LocalizacaoModel: typeof import('@/models/Localizacao').LocalizacaoModel;
  let NotificationModel: typeof import('@/models/Notification').NotificationModel;
  let UserModel: typeof import('@/models/user.model').UserModel;
  let todos: ModelDeTeste[];

  const autor = String(new Types.ObjectId());
  const HOJE = '2026-10-03';
  let categoriaId: Types.ObjectId;
  let predioId: Types.ObjectId;
  let salaId: Types.ObjectId;

  beforeAll(async () => {
    gravar = await import('../gravar');
    job = await import('../alerta-job');
    painel = await import('../painel');
    fichaDocs = await import('../ficha');
    categoria = await import('../../categoria');
    ({ DocumentoAtivoModel } = await import('@/models/DocumentoAtivo'));
    ({ TipoDocumentoModel } = await import('@/models/TipoDocumento'));
    ({ AtivoModel } = await import('@/models/Ativo'));
    ({ AtivoHistoryModel } = await import('@/models/AtivoHistory'));
    ({ CategoriaAtivoModel } = await import('@/models/CategoriaAtivo'));
    ({ LocalizacaoModel } = await import('@/models/Localizacao'));
    ({ NotificationModel } = await import('@/models/Notification'));
    ({ UserModel } = await import('@/models/user.model'));
    todos = [
      DocumentoAtivoModel,
      TipoDocumentoModel,
      AtivoModel,
      AtivoHistoryModel,
      CategoriaAtivoModel,
      LocalizacaoModel,
      NotificationModel,
      UserModel,
    ];
    await conectarMongoDeTeste(todos, 'severino_test_documentos');
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    disco.clear();
    emails.total = 0;
    barreira.esperadas = 0;
    barreira.chegaram = 0;
    await TipoDocumentoModel.insertMany([
      { chave: 'pmoc', nome: 'PMOC' },
      { chave: 'avcb', nome: 'AVCB' },
      { chave: 'art', nome: 'ART', isActive: false },
    ]);
    const cat = await CategoriaAtivoModel.create({
      chave: 'climatizacao',
      nome: 'Climatização',
      criticidadePadrao: 'media',
      exigeDocumento: ['pmoc', 'avcb', 'art', 'velho'],
    });
    categoriaId = cat._id;
    const predio = await LocalizacaoModel.create({
      nome: 'Prédio Sede',
      tipo: 'predio',
      caminho: 'Prédio Sede',
    });
    predioId = predio._id;
    const sala = await LocalizacaoModel.create({
      nome: 'Sala 1',
      tipo: 'sala',
      parentId: predioId,
      caminho: 'Prédio Sede/Sala 1',
    });
    salaId = sala._id;
  });

  async function ativo(codigo: string, campos: Record<string, unknown> = {}) {
    return AtivoModel.create({
      codigo,
      origemCodigo: 'interno',
      descricao: `Split ${codigo}`,
      categoriaId,
      localizacaoId: salaId,
      criticidade: 'media',
      tierManutencao: 'A',
      status: 'em_operacao',
      statusCadastro: 'validado',
      ...campos,
    });
  }

  const arquivo = () => ({
    conteudo: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    originalName: 'laudo.pdf',
    mimeType: 'application/pdf',
    filename: `${Date.now()}-laudo.pdf`,
  });

  const dados = (
    alvo: { ativoId?: string; localizacaoId?: string },
    extra: { tipo?: string; validadeAte?: string } = {},
  ) => ({
    tipo: 'pmoc',
    emitidoEm: '2026-01-10',
    validadeAte: '2027-01-10' as string | undefined,
    numero: undefined,
    emitidoPor: undefined,
    ativoId: undefined,
    localizacaoId: undefined,
    ...alvo,
    ...extra,
  });

  it('o índice único parcial barra dois vigentes do mesmo tipo e alvo', async () => {
    const a = await ativo('MNT-0001');
    const base = {
      tipo: 'pmoc',
      ativoId: a._id,
      arquivo: { filename: 'x', originalName: 'x', mimeType: 'application/pdf', size: 1 },
      emitidoEm: new Date(),
      cadastradoPorId: new Types.ObjectId(),
    };
    await DocumentoAtivoModel.create(base);
    await expect(DocumentoAtivoModel.create(base)).rejects.toMatchObject({ code: 11000 });
    // Substituído não conta.
    await DocumentoAtivoModel.updateMany({}, { $set: { situacao: 'substituido' } });
    await expect(DocumentoAtivoModel.create(base)).resolves.toBeTruthy();
  });

  it('o novo do mesmo tipo substitui o anterior e grava o histórico (AC-4, AC-7)', async () => {
    const a = await ativo('MNT-0001');
    const r1 = await gravar.cadastrarDocumento(dados({ ativoId: String(a._id) }), arquivo(), autor);
    const r2 = await gravar.cadastrarDocumento(dados({ ativoId: String(a._id) }), arquivo(), autor);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r2.substituidoId).toBe(r1.id);
    const anterior = await DocumentoAtivoModel.findById(r1.id).lean();
    expect(anterior?.situacao).toBe('substituido');
    expect(String(anterior?.substituidoPorId)).toBe(r2.id);
    const acoes = (await AtivoHistoryModel.find({ ativoId: a._id }).lean()).map((h) => h.acao);
    expect(acoes.sort()).toEqual(['documento_cadastrado', 'documento_substituido']);
  });

  it.each([
    ['sem vigente anterior', false],
    ['com vigente anterior', true],
  ])(
    'corrida %s: uma grava, a outra recebe 409 e o arquivo dela sai do disco',
    async (_n, comAnterior) => {
      const a = await ativo('MNT-0001');
      let anteriorId: string | null = null;
      if (comAnterior) {
        const r = await gravar.cadastrarDocumento(
          dados({ ativoId: String(a._id) }),
          arquivo(),
          autor,
        );
        if (r.ok) anteriorId = r.id;
        disco.clear();
      }
      barreira.esperadas = 2;
      const [x, y] = await Promise.all([
        gravar.cadastrarDocumento(dados({ ativoId: String(a._id) }), arquivo(), autor),
        gravar.cadastrarDocumento(dados({ ativoId: String(a._id) }), arquivo(), autor),
      ]);
      const oks = [x, y].filter((r) => r.ok);
      const falhas = [x, y].filter((r) => !r.ok);
      expect(oks).toHaveLength(1);
      expect(falhas).toEqual([expect.objectContaining({ status: 409 })]);

      const vigentes = await DocumentoAtivoModel.find({
        ativoId: a._id,
        situacao: 'vigente',
      }).lean();
      expect(vigentes).toHaveLength(1);
      const vencedor = oks[0] as { id: string };
      expect(String(vigentes[0]._id)).toBe(vencedor.id);
      expect([...disco]).toEqual([vencedor.id]);
      if (anteriorId) {
        const anterior = await DocumentoAtivoModel.findById(anteriorId).lean();
        expect(anterior?.situacao).toBe('substituido');
        expect(String(anterior?.substituidoPorId)).toBe(vencedor.id);
      }
    },
  );

  it('recusa ativo baixado, local desativado e tipo desativado sem tocar o disco (AC-3)', async () => {
    const baixado = await ativo('MNT-0002', { status: 'baixado' });
    const r1 = await gravar.cadastrarDocumento(
      dados({ ativoId: String(baixado._id) }),
      arquivo(),
      autor,
    );
    expect(r1).toMatchObject({ ok: false, error: 'Ativo baixado não recebe documento.' });
    await LocalizacaoModel.updateOne({ _id: salaId }, { $set: { isActive: false } });
    const r2 = await gravar.cadastrarDocumento(
      dados({ localizacaoId: String(salaId) }),
      arquivo(),
      autor,
    );
    expect(r2.ok).toBe(false);
    const r3 = await gravar.cadastrarDocumento(
      dados({ localizacaoId: String(predioId) }, { tipo: 'art' }),
      arquivo(),
      autor,
    );
    expect(r3.ok).toBe(false);
    expect(disco.size).toBe(0);
    expect(await DocumentoAtivoModel.countDocuments()).toBe(0);
  });

  it('job: a 20 dias avisa só o de 30, marca 30/60/90 e não repete (AC-11, AC-13)', async () => {
    const a = await ativo('MNT-0003');
    await UserModel.create([
      {
        username: 'adm',
        name: 'Adm',
        email: 'a@x',
        role: 'Admin',
        isActive: true,
        passwordHash: 'x',
      },
      { username: 'pre', name: 'Pre', role: 'Preposto', isActive: true, passwordHash: 'x' },
      { username: 'off', name: 'Off', role: 'Admin', isActive: false, passwordHash: 'x' },
      { username: 'sol', name: 'Sol', role: 'Solicitante', isActive: true, passwordHash: 'x' },
    ]);
    const r = await gravar.cadastrarDocumento(
      dados({ ativoId: String(a._id) }, { validadeAte: '2026-10-23' }),
      arquivo(),
      autor,
    );
    if (!r.ok) throw new Error(r.error);

    const primeira = await job.processarVencimentos(HOJE);
    expect(primeira).toEqual({ avaliados: 1, avisados: 1, erros: 0 });
    const notas = await NotificationModel.find().lean();
    expect(notas).toHaveLength(2);
    expect(notas[0].title).toBe('PMOC do MNT-0003 vence em 20 dias');
    expect(notas[0].data).toMatchObject({ limite: '30', ativoId: String(a._id) });
    expect(emails.total).toBe(2);
    const doc = await DocumentoAtivoModel.findById(r.id).lean();
    expect([...(doc?.alertasEnviados ?? [])].sort()).toEqual(['30', '60', '90']);

    const segunda = await job.processarVencimentos(HOJE);
    expect(segunda.avisados).toBe(0);
    expect(await NotificationModel.countDocuments()).toBe(2);
  });

  it('job em paralelo: uma notificação por gestor, não duas (AC-13)', async () => {
    const a = await ativo('MNT-0004');
    await UserModel.create({
      username: 'adm',
      name: 'Adm',
      role: 'Admin',
      isActive: true,
      passwordHash: 'x',
    });
    await gravar.cadastrarDocumento(
      dados({ ativoId: String(a._id) }, { validadeAte: '2026-09-01' }),
      arquivo(),
      autor,
    );
    const [x, y] = await Promise.all([
      job.processarVencimentos(HOJE),
      job.processarVencimentos(HOJE),
    ]);
    expect(x.avisados + y.avisados).toBe(1);
    const notas = await NotificationModel.find().lean();
    expect(notas).toHaveLength(1);
    expect(notas[0].title).toBe('PMOC do MNT-0004 venceu em 01/09/2026');
  });

  it('sem gestor ativo, não marca e avisa na rodada seguinte', async () => {
    const a = await ativo('MNT-0007');
    const r = await gravar.cadastrarDocumento(
      dados({ ativoId: String(a._id) }, { validadeAte: '2026-10-23' }),
      arquivo(),
      autor,
    );
    if (!r.ok) throw new Error(r.error);

    const semGestor = await job.processarVencimentos(HOJE);
    expect(semGestor).toEqual({ avaliados: 1, avisados: 0, erros: 1 });
    expect((await DocumentoAtivoModel.findById(r.id).lean())?.alertasEnviados).toEqual([]);

    await UserModel.create({
      username: 'adm',
      name: 'Adm',
      role: 'Admin',
      isActive: true,
      passwordHash: 'x',
    });
    const comGestor = await job.processarVencimentos(HOJE);
    expect(comGestor).toEqual({ avaliados: 1, avisados: 1, erros: 0 });
    expect(await NotificationModel.countDocuments()).toBe(1);
  });

  it('corrigir a validade para 100 dias limpa as marcas (AC-5)', async () => {
    const a = await ativo('MNT-0005');
    const r = await gravar.cadastrarDocumento(
      dados({ ativoId: String(a._id) }, { validadeAte: '2026-10-23' }),
      arquivo(),
      autor,
    );
    if (!r.ok) throw new Error(r.error);
    await job.processarVencimentos(HOJE);
    const c = await gravar.corrigirDocumento(
      {
        id: r.id,
        emitidoEm: '2026-01-10',
        validadeAte: '2027-01-11',
        numero: undefined,
        emitidoPor: undefined,
      },
      autor,
      HOJE,
    );
    expect(c.ok).toBe(true);
    const doc = await DocumentoAtivoModel.findById(r.id).lean();
    expect(doc?.alertasEnviados).toEqual([]);
    const acoes = (await AtivoHistoryModel.find({ ativoId: a._id }).lean()).map((h) => h.acao);
    expect(acoes).toContain('documento_corrigido');
  });

  it('documento de ativo baixado não alerta; de local, sempre (AC-14)', async () => {
    const a = await ativo('MNT-0006');
    await UserModel.create({
      username: 'adm',
      name: 'Adm',
      role: 'Admin',
      isActive: true,
      passwordHash: 'x',
    });
    await gravar.cadastrarDocumento(
      dados({ ativoId: String(a._id) }, { validadeAte: '2026-10-10' }),
      arquivo(),
      autor,
    );
    await gravar.cadastrarDocumento(
      dados({ localizacaoId: String(predioId) }, { tipo: 'avcb', validadeAte: '2026-10-10' }),
      arquivo(),
      autor,
    );
    await AtivoModel.updateOne({ _id: a._id }, { $set: { status: 'baixado' } });
    const r = await job.processarVencimentos(HOJE);
    expect(r.avisados).toBe(1);
    const [nota] = await NotificationModel.find().lean();
    expect(nota.title).toBe('AVCB do Prédio Sede vence em 7 dias');
    expect(nota.data).toMatchObject({
      localizacaoId: String(predioId),
      predioId: String(predioId),
    });
  });

  it('excluir o vigente não devolve o anterior e o tipo volta a faltar (AC-6, AC-9)', async () => {
    const a = await ativo('MNT-0007');
    await gravar.cadastrarDocumento(dados({ ativoId: String(a._id) }), arquivo(), autor);
    const r2 = await gravar.cadastrarDocumento(dados({ ativoId: String(a._id) }), arquivo(), autor);
    if (!r2.ok) throw new Error(r2.error);
    const ex = await gravar.excluirDocumento(r2.id, 'cadastrado no equipamento errado', autor);
    expect(ex.ok).toBe(true);
    expect(await DocumentoAtivoModel.countDocuments({ ativoId: a._id, situacao: 'vigente' })).toBe(
      0,
    );
    const falta = await painel.listarFaltando({ pagina: 1 });
    expect(falta.itens.map((f) => f.tipo).sort()).toEqual(['avcb', 'pmoc']);
  });

  it('Faltando: vencido conta, herança do prédio vale, tipo desativado e chave velha não contam (AC-9)', async () => {
    const coberto = await ativo('MNT-0010');
    await ativo('MNT-0011');
    await ativo('MNT-0012', { status: 'baixado' });
    const semLocal = await ativo('MNT-0013', { localizacaoId: null });
    // PMOC vencido no ativo coberto e AVCB no prédio (herdado por todos da sala).
    await gravar.cadastrarDocumento(
      dados({ ativoId: String(coberto._id) }, { validadeAte: '2026-02-01' }),
      arquivo(),
      autor,
    );
    await gravar.cadastrarDocumento(
      dados({ localizacaoId: String(predioId) }, { tipo: 'avcb' }),
      arquivo(),
      autor,
    );

    const tudo = await painel.listarFaltando({ pagina: 1 });
    const pares = tudo.itens.map((f) => `${f.codigo}:${f.tipo}`);
    expect(pares).toEqual(['MNT-0011:pmoc', 'MNT-0013:avcb', 'MNT-0013:pmoc']);

    // Com filtro de prédio, o ativo sem local some.
    const doPredio = await painel.listarFaltando({ pagina: 1, predio: String(predioId) });
    expect(doPredio.itens.map((f) => f.codigo)).toEqual(['MNT-0011']);
    expect(semLocal).toBeTruthy();

    const docs = await painel.listarDocumentosPainel({ visao: 'documentos', pagina: 1 }, HOJE);
    expect(docs.itens.map((d) => d.situacao.tipo)).toEqual(['vencido', 'em_dia']);
    expect(docs.itens[1].predioNome).toBe('Prédio Sede');

    const ficha = await fichaDocs.carregarDocumentosDoAtivo(String(coberto._id), HOJE);
    expect(ficha?.faltando).toEqual([]);
    expect(ficha?.herdados.map((d) => `${d.tipo}@${d.localNome}`)).toEqual(['avcb@Prédio Sede']);
  });

  it('a ficha conta os dias pelo dia de Belém: às 22h, validade de amanhã vence em 1 dia', async () => {
    const a = await ativo('MNT-0020');
    await gravar.cadastrarDocumento(
      dados({ ativoId: String(a._id) }, { validadeAte: '2026-10-10' }),
      arquivo(),
      autor,
    );
    // 22:00 de 09/10 em Belém já é 01:00 de 10/10 em UTC. A página chama sem `hoje`.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T01:00:00Z'));
    try {
      const ficha = await fichaDocs.carregarDocumentosDoAtivo(String(a._id));
      expect(ficha?.vigentes.map((d) => d.situacaoTexto)).toEqual(['Vence em 1 dia']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('salvar a categoria guarda só chaves que existem, ativas ou não (AC-2)', async () => {
    const r = await categoria.editarCategoria(String(categoriaId), {
      chave: 'climatizacao',
      nome: 'Climatização',
      criticidadePadrao: 'media',
      exigeDocumento: ['pmoc', 'art', 'velho', 'Laudo antigo'],
    });
    expect(r.ok).toBe(true);
    const salva = await CategoriaAtivoModel.findById(categoriaId).lean();
    // `art` está desativado no beforeEach e continua gravado; as chaves sem tipo saem.
    expect(salva?.exigeDocumento).toEqual(['pmoc', 'art']);
  });
});
