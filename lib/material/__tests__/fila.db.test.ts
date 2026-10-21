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
 * A fila de `/cotacoes` repaginada (spec 0021, fatia 1) contra o MongoDB de
 * verdade: busca, "Só urgentes", contagens por aba, páginas de 25, o tempo na
 * etapa pela trilha e o resumo do topo por lado.
 *
 * covers: AC-2, AC-3, AC-4, AC-24
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
const AGORA = new Date();
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * DIA);

rodar('fila de cotações repaginada, contra o Mongo', () => {
  let leitura: typeof import('../leitura');
  let M: {
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    User: typeof import('@/models/user.model').UserModel;
    Cotacao: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
    Evento: typeof import('@/models/CotacaoMaterialEvento').CotacaoMaterialEventoModel;
    Designacao: typeof import('@/models/DesignacaoMaterial').DesignacaoMaterialModel;
    Ativo: typeof import('@/models/Ativo').AtivoModel;
    Localizacao: typeof import('@/models/Localizacao').LocalizacaoModel;
    Empenho: typeof import('@/models/Empenho').EmpenhoModel;
  };
  let todos: ModelDeTeste[];

  const ids = {
    rt: String(new Types.ObjectId()),
    fiscal: String(new Types.ObjectId()),
    admin: String(new Types.ObjectId()),
  };
  const fiscal = { userId: ids.fiscal, role: 'Admin' };
  const rt = { userId: ids.rt, role: 'Preposto' };
  const adminLeitor = { userId: ids.admin, role: 'Admin' };
  let seq = 0;

  /** Grava um chamado e uma cotação crus, com a trilha que o teste pedir. */
  async function cotacao(p: {
    situacao: string;
    ticket?: string;
    titulo?: string;
    urgente?: boolean;
    valor?: number;
    ativoId?: Types.ObjectId;
    localizacaoId?: Types.ObjectId;
    criadaHa?: number;
    atualizadaHa?: number;
    eventos?: { de: string | null; para: string; acao: string; ha: number }[];
  }) {
    seq += 1;
    const chamadoId = new Types.ObjectId();
    await M.Chamado.collection.insertOne({
      _id: chamadoId,
      ticket_number: p.ticket ?? String(9000 + seq),
      titulo: p.titulo ?? `Chamado ${seq}`,
    });
    const _id = new Types.ObjectId();
    await M.Cotacao.collection.insertOne({
      _id,
      numero: `COT-2026-${String(seq).padStart(4, '0')}`,
      chamadoId,
      ativoId: p.ativoId ?? null,
      localizacaoId: p.localizacaoId ?? null,
      situacao: p.situacao,
      emTramite: [
        'rascunho',
        'enviada',
        'em_analise',
        'em_aprovacao',
        'devolvida',
        'autorizada',
      ].includes(p.situacao),
      valorTotalCentavos: p.valor ?? 10_000,
      itens: [{ _id: new Types.ObjectId() }, { _id: new Types.ObjectId() }],
      urgencia: p.urgente ? { pedida: true } : null,
      notaFiscal: null,
      createdAt: diasAtras(p.criadaHa ?? 30),
      updatedAt: diasAtras(p.atualizadaHa ?? 0),
    });
    for (const e of p.eventos ?? []) {
      await M.Evento.collection.insertOne({
        cotacaoId: _id,
        de: e.de,
        para: e.para,
        acao: e.acao,
        em: diasAtras(e.ha),
      });
    }
    return { id: String(_id), chamadoId, numero: `COT-2026-${String(seq).padStart(4, '0')}` };
  }

  beforeAll(async () => {
    leitura = await import('../leitura');
    M = {
      Chamado: (await import('@/models/Chamado')).ChamadoModel,
      User: (await import('@/models/user.model')).UserModel,
      Cotacao: (await import('@/models/CotacaoMaterial')).CotacaoMaterialModel,
      Evento: (await import('@/models/CotacaoMaterialEvento')).CotacaoMaterialEventoModel,
      Designacao: (await import('@/models/DesignacaoMaterial')).DesignacaoMaterialModel,
      Ativo: (await import('@/models/Ativo')).AtivoModel,
      Localizacao: (await import('@/models/Localizacao')).LocalizacaoModel,
      Empenho: (await import('@/models/Empenho')).EmpenhoModel,
    };
    todos = Object.values(M).map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_fila');
  });

  beforeEach(async () => {
    seq = 0;
    await limparColecoes(todos);
    await M.User.collection.insertMany([
      {
        _id: new Types.ObjectId(ids.rt),
        username: 'rt',
        name: 'RT',
        role: 'Preposto',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(ids.fiscal),
        username: 'fiscal',
        name: 'Fiscal',
        role: 'Admin',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(ids.admin),
        username: 'admin',
        name: 'Admin',
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
    await designar(ids.fiscal, 'fiscal');
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  it('busca pelo número do chamado com "Só urgentes" acha só a linha certa, e as contagens respeitam os dois (AC-3, AC-2)', async () => {
    const alvo = await cotacao({ situacao: 'em_analise', ticket: '2291', urgente: true });
    await cotacao({ situacao: 'em_analise', ticket: '2292', urgente: true });
    await cotacao({ situacao: 'em_analise', ticket: '2291-B' });
    await cotacao({ situacao: 'em_aprovacao', ticket: '2293' });

    const fila = await leitura.listarFila(
      fiscal,
      { aba: 'analise', q: '#2291', urgente: true },
      AGORA,
    );
    expect(fila?.linhas.map((l) => l.id)).toEqual([alvo.id]);
    expect(fila?.total).toBe(1);
    expect(fila?.contagens).toMatchObject({ analise: 1, aprovacao: 0, todas: 1 });
    expect(fila?.q).toBe('#2291');
    expect(fila?.urgente).toBe(true);

    const semFiltro = await leitura.listarFila(fiscal, { aba: 'analise' }, AGORA);
    expect(semFiltro?.contagens).toMatchObject({ analise: 3, aprovacao: 1, todas: 4 });
  });

  it('busca pelo prefixo do número sem caixa e pelo código do ativo (AC-3)', async () => {
    const ativoId = new Types.ObjectId();
    await M.Ativo.collection.insertOne({ _id: ativoId, codigo: 'MNT-0412' });
    const comAtivo = await cotacao({ situacao: 'enviada', ativoId });
    const outra = await cotacao({ situacao: 'enviada' });

    const porAtivo = await leitura.listarFila(fiscal, { aba: 'todas', q: 'mnt-0412' }, AGORA);
    expect(porAtivo?.linhas.map((l) => l.id)).toEqual([comAtivo.id]);

    const porNumero = await leitura.listarFila(
      fiscal,
      { aba: 'todas', q: outra.numero.toLowerCase() },
      AGORA,
    );
    expect(porNumero?.linhas.map((l) => l.id)).toEqual([outra.id]);
  });

  it('busca com metacaracteres de regex não quebra nem casa tudo (AC-3)', async () => {
    await cotacao({ situacao: 'enviada' });
    const fila = await leitura.listarFila(fiscal, { aba: 'todas', q: '.*(' }, AGORA);
    expect(fila?.linhas).toEqual([]);
    expect(fila?.total).toBe(0);
  });

  it('página além do total vai para a última, com 25 por página (AC-3)', async () => {
    for (let i = 0; i < 27; i += 1) await cotacao({ situacao: 'em_analise' });
    const fila = await leitura.listarFila(fiscal, { aba: 'analise', pagina: 9 }, AGORA);
    expect(fila?.pagina).toBe(2);
    expect(fila?.porPagina).toBe(25);
    expect(fila?.total).toBe(27);
    expect(fila?.linhas).toHaveLength(2);

    const primeira = await leitura.listarFila(fiscal, { aba: 'analise' }, AGORA);
    expect(primeira?.linhas).toHaveLength(25);
  });

  it('o tempo na etapa vem do último evento que mudou a situação, não do updatedAt nem da conciliação (AC-4)', async () => {
    const c = await cotacao({
      situacao: 'autorizada',
      atualizadaHa: 0,
      eventos: [
        { de: null, para: 'rascunho', acao: 'criar', ha: 20 },
        { de: 'em_aprovacao', para: 'autorizada', acao: 'aprovar', ha: 8 },
        { de: 'autorizada', para: 'autorizada', acao: 'conciliar', ha: 1 },
      ],
    });
    const fila = await leitura.listarFila(fiscal, { aba: 'todas' }, AGORA);
    const linha = fila?.linhas.find((l) => l.id === c.id);
    expect(linha?.naEtapaDias).toBe(8);
    expect(linha?.situacaoAnterior).toBe('em_aprovacao');
    expect(linha?.quantidadeItens).toBe(2);
  });

  it('nas abas de trâmite, mais tempo na etapa primeiro; em Todas, mais recentes primeiro (AC-3)', async () => {
    const recente = await cotacao({
      situacao: 'em_analise',
      atualizadaHa: 5,
      eventos: [{ de: 'enviada', para: 'em_analise', acao: 'assumir', ha: 1 }],
    });
    const antiga = await cotacao({
      situacao: 'em_analise',
      atualizadaHa: 0,
      eventos: [{ de: 'enviada', para: 'em_analise', acao: 'assumir', ha: 9 }],
    });
    const analise = await leitura.listarFila(fiscal, { aba: 'analise' }, AGORA);
    expect(analise?.linhas.map((l) => l.id)).toEqual([antiga.id, recente.id]);

    const todas = await leitura.listarFila(fiscal, { aba: 'todas' }, AGORA);
    expect(todas?.linhas.map((l) => l.id)).toEqual([antiga.id, recente.id]);
    await M.Cotacao.collection.updateOne(
      { _id: new Types.ObjectId(recente.id) },
      { $set: { updatedAt: AGORA } },
    );
    await M.Cotacao.collection.updateOne(
      { _id: new Types.ObjectId(antiga.id) },
      { $set: { updatedAt: diasAtras(3) } },
    );
    const depois = await leitura.listarFila(fiscal, { aba: 'todas' }, AGORA);
    expect(depois?.linhas.map((l) => l.id)).toEqual([recente.id, antiga.id]);
  });

  it('a linha traz título do chamado e caminho do local; o valor só sai para o TRF1 (AC-4, AC-24)', async () => {
    const localizacaoId = new Types.ObjectId();
    await M.Localizacao.collection.insertOne({ _id: localizacaoId, caminho: 'Bloco A / 3º andar' });
    const c = await cotacao({
      situacao: 'em_analise',
      titulo: 'Vazamento no quadro',
      localizacaoId,
      valor: 486_000,
    });
    const doFiscal = (await leitura.listarFila(fiscal, { aba: 'todas' }, AGORA))?.linhas[0];
    expect(doFiscal).toMatchObject({
      id: c.id,
      chamadoTitulo: 'Vazamento no quadro',
      local: 'Bloco A / 3º andar',
      valorCentavos: 486_000,
    });
    const daContratada = (await leitura.listarFila(rt, { aba: 'todas' }, AGORA))?.linhas[0];
    expect(daContratada?.id).toBe(c.id);
    expect(daContratada?.valorCentavos).toBeNull();
  });

  it('o resumo do TRF1 soma a aprovação e ignora a busca; o da contratada não tem valor (AC-2, AC-24)', async () => {
    await cotacao({ situacao: 'enviada' });
    await cotacao({ situacao: 'em_aprovacao', valor: 100_000 });
    await cotacao({ situacao: 'em_aprovacao', valor: 50_050 });
    await cotacao({ situacao: 'devolvida' });

    const doFiscal = await leitura.resumoDaFila(fiscal, AGORA);
    expect(doFiscal).toEqual({
      lado: 'trf1',
      esperandoVoce: 1,
      emAprovacao: { qtd: 2, valorCentavos: 150_050 },
      atesteAtrasado: 0,
      saldoElegivelCentavos: null,
    });

    const doLeitor = await leitura.resumoDaFila(adminLeitor, AGORA);
    expect(doLeitor.lado).toBe('trf1');
    expect(doLeitor).toMatchObject({ esperandoVoce: 0 });

    const daContratada = await leitura.resumoDaFila(rt, AGORA);
    expect(daContratada).toEqual({
      lado: 'contratada',
      esperandoVoce: 1,
      devolvidas: 1,
      nfPendente: 0,
    });
    expect(JSON.stringify(daContratada)).not.toMatch(/Centavos/);
  });
});
