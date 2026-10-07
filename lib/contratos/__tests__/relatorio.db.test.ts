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

/**
 * O relatório por contrato no Mongo de verdade (spec 0016): paridade com a
 * aba Ativos do IMR, janela cortada pela vigência, mapeamento de categoria
 * pelo catálogo, sobreposição e número único no cadastro, e o PDF com a
 * emissão gravada (hash dos bytes entregues).
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 *
 * covers: AC-3, AC-6, AC-7, AC-10, AC-11, AC-16, AC-18
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('relatório por contrato (banco real)', () => {
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let AtivoModel: typeof import('@/models/Ativo').AtivoModel;
  let CategoriaAtivoModel: typeof import('@/models/CategoriaAtivo').CategoriaAtivoModel;
  let LocalizacaoModel: typeof import('@/models/Localizacao').LocalizacaoModel;
  let ContratoModel: typeof import('@/models/Contrato').ContratoModel;
  let EmissaoModel: typeof import('@/models/RelatorioContratoEmissao').RelatorioContratoEmissaoModel;
  let ServiceTypeModel: typeof import('@/models/ServiceType').ServiceTypeModel;
  let ServiceSubTypeModel: typeof import('@/models/ServiceSubType').ServiceSubTypeModel;
  let UserModel: typeof import('@/models/user.model').UserModel;
  let relatorio: typeof import('../relatorio');
  let cadastro: typeof import('../cadastro');
  let gerar: typeof import('../pdf/gerar');
  let calcularIndicadoresAtivos: typeof import('@/lib/ativos/indicadores').calcularIndicadoresAtivos;
  let todos: ModelDeTeste[];

  const agora = new Date('2026-10-07T15:00:00.000Z');
  const categoria = new Types.ObjectId();
  const subtipo = new Types.ObjectId();
  const tipoAr = new Types.ObjectId();
  const ativoA = new Types.ObjectId();
  const ativoB = new Types.ObjectId();
  const usuario = new Types.ObjectId();
  let n = 0;

  const chamado = (createdAt: string, extra: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    ticket_number: `CTR-${(n += 1)}`,
    status: 'em_atendimento',
    tipoServico: 'Ar-Condicionado',
    ativoId: ativoA,
    originTemplateId: null,
    createdAt: new Date(createdAt),
    ...extra,
  });

  const contratoBase = {
    numero: '12/2025',
    empresa: 'Refrigeração Amazônia',
    cnpj: '11222333000181',
    processoSei: '0001234-56.2025',
    objeto: null,
    fiscal: 'Fulano',
    tiposServico: ['Ar-Condicionado' as const],
    vigenciaInicio: '2025-03-01',
    vigenciaFim: '2027-02-28',
  };

  beforeAll(async () => {
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ AtivoModel } = await import('@/models/Ativo'));
    ({ CategoriaAtivoModel } = await import('@/models/CategoriaAtivo'));
    ({ LocalizacaoModel } = await import('@/models/Localizacao'));
    ({ ContratoModel } = await import('@/models/Contrato'));
    ({ RelatorioContratoEmissaoModel: EmissaoModel } =
      await import('@/models/RelatorioContratoEmissao'));
    ({ ServiceTypeModel } = await import('@/models/ServiceType'));
    ({ ServiceSubTypeModel } = await import('@/models/ServiceSubType'));
    ({ UserModel } = await import('@/models/user.model'));
    ({ calcularIndicadoresAtivos } = await import('@/lib/ativos/indicadores'));
    relatorio = await import('../relatorio');
    cadastro = await import('../cadastro');
    gerar = await import('../pdf/gerar');
    todos = [
      ChamadoModel,
      AtivoModel,
      CategoriaAtivoModel,
      LocalizacaoModel,
      ContratoModel,
      EmissaoModel,
      ServiceTypeModel,
      ServiceSubTypeModel,
      UserModel,
    ] as never;
    await conectarMongoDeTeste(todos, 'severino_test_contratos');
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await limparColecoes(todos);
    await ServiceTypeModel.collection.insertOne({ _id: tipoAr, name: 'AR CONDICIONADO' });
    await ServiceSubTypeModel.collection.insertOne({ _id: subtipo, typeId: tipoAr, name: 'Split' });
    await CategoriaAtivoModel.collection.insertMany([
      { _id: categoria, chave: 'split', nome: 'Split', serviceSubTypeId: subtipo, isActive: true },
      // Categoria sem ligação com o catálogo: só entra se algum ativo dela tiver chamado.
      {
        _id: new Types.ObjectId(),
        chave: 'outra',
        nome: 'Outra',
        serviceSubTypeId: null,
        isActive: true,
      },
    ]);
    await AtivoModel.collection.insertMany([
      {
        _id: ativoA,
        codigo: '11997',
        descricao: 'Split 12k',
        categoriaId: categoria,
        status: 'em_operacao',
        tierManutencao: 'A',
      },
      {
        _id: ativoB,
        codigo: '11998',
        descricao: 'Split 18k',
        categoriaId: categoria,
        status: 'em_operacao',
        tierManutencao: 'B',
      },
    ]);
    await UserModel.collection.insertOne({ _id: usuario, name: 'Admin Teste', username: 'adm' });
  });

  afterAll(async () => {
    if (todos) await limparColecoes(todos);
    await desconectarMongoDeTeste();
  });

  async function semearSetembro() {
    await ChamadoModel.collection.insertMany([
      chamado('2026-09-02T10:00:00.000Z', {
        sla: {
          resolvedAt: new Date('2026-09-02T14:00:00.000Z'),
          resolutionDueAt: new Date('2026-09-03T00:00:00.000Z'),
        },
      }),
      chamado('2026-09-20T10:00:00.000Z', {
        sla: { resolutionDueAt: new Date('2026-09-21T00:00:00.000Z') },
      }),
      chamado('2026-08-01T10:00:00.000Z'),
      chamado('2026-09-05T10:00:00.000Z', { ativoId: ativoB }),
      chamado('2026-09-06T10:00:00.000Z', { ativoId: null }),
      chamado('2026-09-07T10:00:00.000Z', { status: 'cancelado' }),
      chamado('2026-09-08T10:00:00.000Z', { tipoServico: 'Elevador' }),
      chamado('2026-09-09T10:00:00.000Z', {
        ativoId: ativoB,
        originTemplateId: new Types.ObjectId(),
        sla: { resolvedAt: new Date('2026-09-10T10:00:00.000Z') },
      }),
    ]);
  }

  it('os seis números do topo são iguais aos da aba Ativos do IMR (AC-10)', async () => {
    await semearSetembro();
    const contrato = await ContratoModel.create({
      ...contratoBase,
      numeroNormalizado: '12/2025',
    });

    const r = await relatorio.montarRelatorioContrato({
      contratoId: String(contrato._id),
      mes: '2026-09',
      agora,
      geradoPorNome: 'Admin',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const imr = await calcularIndicadoresAtivos({
      inicio: new Date('2026-09-01T00:00:00.000Z'),
      fim: new Date('2026-09-30T23:59:59.999Z'),
      fimReincidencia: new Date('2026-09-30T23:59:59.999Z'),
    });
    const t = r.relatorio.topo;
    expect({
      corretivosComAtivo: t.corretivosComAtivo,
      percentualComAtivo: t.percentualComAtivo,
      ativosAfetados: t.ativosAfetados,
      mtbfMedioMs: t.mtbfMedioMs,
      mttrMedioMs: t.mttrMedioMs,
      ativosReincidentes: t.ativosReincidentes,
    }).toEqual(imr.porTipo['Ar-Condicionado'].topo);

    expect(t.corretivosTotal).toBe(4);
    expect(t.corretivosSemAtivo).toBe(1);
    expect(t.preventivasGeradas).toBe(1);
    expect(t.preventivasConcluidas).toBe(1);
    // Um dentro; o de 20/09 venceu em aberto e conta como fora; o do ativo B não tem SLA.
    expect(t.sla).toMatchObject({ dentro: 1, fora: 1, emAndamento: 0, semSla: 1 });

    expect(r.relatorio.categorias).toEqual([
      expect.objectContaining({
        nome: 'Split',
        ativosNoEscopo: 2,
        ativosComChamado: 2,
        corretivos: 3,
      }),
    ]);
    expect(r.relatorio.ativos.map((a) => a.codigo)).toEqual(['11997', '11998']);
  });

  it('a vigência corta a janela: chamado antes do início fica fora (AC-6, AC-7)', async () => {
    await ChamadoModel.collection.insertMany([
      chamado('2026-09-10T10:00:00.000Z'),
      chamado('2026-09-20T10:00:00.000Z'),
    ]);
    const contrato = await ContratoModel.create({
      ...contratoBase,
      numeroNormalizado: '12/2025',
      vigenciaInicio: '2026-09-15',
    });
    const r = await relatorio.montarRelatorioContrato({
      contratoId: String(contrato._id),
      mes: '2026-09',
      agora,
      geradoPorNome: 'Admin',
    });
    expect(r.ok && r.relatorio.janela).toMatchObject({ inicio: '2026-09-15', fim: '2026-09-30' });
    expect(r.ok && r.relatorio.topo.corretivosTotal).toBe(1);

    const fora = await relatorio.montarRelatorioContrato({
      contratoId: String(contrato._id),
      mes: '2026-08',
      agora,
      geradoPorNome: 'Admin',
    });
    expect(fora).toEqual({ ok: false, motivo: 'mes_fora_da_vigencia' });
  });

  it('recusa sobreposição com contrato inativo e número repetido (AC-2, AC-3)', async () => {
    await ContratoModel.create({ ...contratoBase, numeroNormalizado: '12/2025', isActive: false });

    const sobreposto = await cadastro.criarContrato({
      ...contratoBase,
      numero: '13/2026',
      vigenciaInicio: '2026-06-01',
      vigenciaFim: '2027-05-31',
    });
    expect(sobreposto).toEqual({
      ok: false,
      error: 'O contrato 12/2025 já cobre Ar-Condicionado de 01/03/2025 a 28/02/2027.',
    });

    const repetido = await cadastro.criarContrato({
      ...contratoBase,
      numero: '12/2025'.toUpperCase(),
      tiposServico: ['Elevador'],
    });
    expect(repetido).toEqual({ ok: false, error: 'Já existe um contrato com o número 12/2025.' });

    const outroTipo = await cadastro.criarContrato({
      ...contratoBase,
      numero: '14/2026',
      tiposServico: ['Elevador'],
    });
    expect(outroTipo.ok).toBe(true);
  });

  it('encurtar a vigência sobre um mês emitido é recusado (AC-3)', async () => {
    const criado = await cadastro.criarContrato(contratoBase);
    if (!criado.ok) throw new Error(criado.error);
    await EmissaoModel.create({
      contratoId: new Types.ObjectId(criado.id),
      mes: '2025-04',
      geradoPor: usuario,
      geradoPorNome: 'Admin',
      geradoEm: agora,
      hashSha256: 'a'.repeat(64),
    });
    const r = await cadastro.editarContrato(criado.id, {
      ...contratoBase,
      vigenciaInicio: '2025-05-01',
    });
    expect(r).toEqual({
      ok: false,
      error:
        'Já há relatório emitido para 04/2025; a vigência e os tipos desse período não podem mudar.',
    });
    expect(
      (await cadastro.editarContrato(criado.id, { ...contratoBase, vigenciaFim: '2027-12-31' })).ok,
    ).toBe(true);
  });

  it('gera o PDF, grava a emissão com o hash dos bytes e lista (AC-16, AC-19)', async () => {
    await semearSetembro();
    const criado = await cadastro.criarContrato(contratoBase);
    if (!criado.ok) throw new Error(criado.error);

    const r = await gerar.gerarPdfContrato({
      contratoId: criado.id,
      mes: '2026-09',
      userId: String(usuario),
      agora,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(r.nomeArquivo).toBe('relatorio-contrato-12-2025-2026-09.pdf');
    expect(createHash('sha256').update(r.bytes).digest('hex')).toBe(r.hashSha256);

    const emissoes = await relatorio.listarEmissoes(criado.id, '2026-09');
    expect(emissoes).toEqual([
      {
        id: r.emissaoId,
        geradoEm: agora.toISOString(),
        geradoPorNome: 'Admin Teste',
        hashSha256: r.hashSha256,
      },
    ]);
  });

  it('falha ao gravar a emissão: 500 e nenhum PDF (AC-18)', async () => {
    const criado = await cadastro.criarContrato(contratoBase);
    if (!criado.ok) throw new Error(criado.error);
    vi.spyOn(EmissaoModel, 'create').mockRejectedValueOnce(new Error('disco cheio'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const r = await gerar.gerarPdfContrato({
      contratoId: criado.id,
      mes: '2026-09',
      userId: String(usuario),
      agora,
    });
    expect(r).toEqual({ ok: false, status: 500, error: gerar.ERRO_PDF_FALHOU });
    expect(await EmissaoModel.countDocuments()).toBe(0);
  });
});
