import { createHash } from 'node:crypto';

import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * O PDF do fechamento do IMR do contrato contra o MongoDB de verdade (spec
 * 0023): mês aberto responde 409, mês fechado grava a emissão com o SHA-256
 * dos bytes entregues antes de responder, e reabrir volta a responder 409.
 *
 * covers: AC-13, AC-14
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

/** `YYYY-MM-DDTHH:mm` em Belém. */
const b = (s: string) => new Date(`${s}:00.000-03:00`);

const AGORA = b('2026-11-03T10:00');
const COMPETENCIA = '2026-10';
const AUTOR = { userId: String(new Types.ObjectId()), papel: 'fiscal' as const };

rodar('PDF do fechamento do IMR do contrato contra o Mongo', () => {
  let fechamento: typeof import('../fechamento');
  let gerar: typeof import('../pdf/gerar');
  let modelos: ModelDeTeste[];
  let M: {
    Contrato: typeof import('@/models/Contrato').ContratoModel;
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    Emissao: typeof import('@/models/ImrFechamentoPdfEmissao').ImrFechamentoPdfEmissaoModel;
    Fechamento: typeof import('@/models/ImrFechamento').ImrFechamentoModel;
    User: typeof import('@/models/user.model').UserModel;
  };

  beforeAll(async () => {
    const [contrato, chamado, emissao, fech, reab, marc, cotacao, holiday, cal, user, desig] =
      await Promise.all([
        import('@/models/Contrato'),
        import('@/models/Chamado'),
        import('@/models/ImrFechamentoPdfEmissao'),
        import('@/models/ImrFechamento'),
        import('@/models/ImrReabertura'),
        import('@/models/ImrMarcacao'),
        import('@/models/CotacaoMaterial'),
        import('@/models/Holiday'),
        import('@/models/BusinessCalendar'),
        import('@/models/user.model'),
        import('@/models/DesignacaoMaterial'),
      ]);
    M = {
      Contrato: contrato.ContratoModel,
      Chamado: chamado.ChamadoModel,
      Emissao: emissao.ImrFechamentoPdfEmissaoModel,
      Fechamento: fech.ImrFechamentoModel,
      User: user.UserModel,
    };
    modelos = [
      cru(M.Contrato),
      cru(M.Chamado),
      cru(M.Emissao),
      cru(M.Fechamento),
      cru(reab.ImrReaberturaModel),
      cru(marc.ImrMarcacaoModel),
      cru(cotacao.CotacaoMaterialModel),
      cru(holiday.HolidayModel),
      cru(cal.BusinessCalendarModel),
      cru(M.User),
      cru(desig.DesignacaoMaterialModel),
    ];
    await conectarMongoDeTeste(modelos, 'severino_test_imr_pdf');
    fechamento = await import('../fechamento');
    gerar = await import('../pdf/gerar');
  });

  beforeEach(async () => {
    await Promise.all(modelos.map((m) => m.deleteMany({})));
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  async function contrato() {
    const _id = new Types.ObjectId();
    await M.Contrato.collection.insertOne({
      _id,
      numero: '12/2025',
      numeroNormalizado: '12/2025',
      empresa: 'Contratada',
      cnpj: '12345678000199',
      processoSei: '0001',
      tiposServico: ['Manutenção Predial'],
      vigenciaInicio: '2026-01-01',
      vigenciaFim: '2027-02-28',
      isActive: true,
    });
    const createdAt = b('2026-10-05T09:00');
    await M.Chamado.collection.insertOne({
      ticket_number: 'CHM-2026-00001',
      titulo: 'Troca de lâmpada',
      status: 'aberto',
      tipoServico: 'Manutenção Predial',
      createdAt,
      updatedAt: createdAt,
    });
    return String(_id);
  }

  async function admin() {
    const _id = new Types.ObjectId();
    await M.User.collection.insertOne({
      _id,
      username: 'admin.imr',
      name: 'Admin do IMR',
      role: 'Admin',
      isActive: true,
    });
    return { userId: String(_id), role: 'Admin' as const };
  }

  const entrada = (contratoId: string) => ({
    contratoId,
    competencia: COMPETENCIA,
    i1Pontos: 40,
    i1Observacao: null,
    i2Pontos: 20,
    i2Observacao: null,
  });

  it('mês aberto responde 409 e não grava emissão', async () => {
    const id = await contrato();
    const sessao = await admin();
    const r = await gerar.gerarPdfImr({ contratoId: id, competencia: COMPETENCIA, sessao });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(await M.Emissao.countDocuments()).toBe(0);
  });

  it('quem não é Admin recebe 403 mesmo com o mês fechado', async () => {
    const id = await contrato();
    await fechamento.fecharMesImr(entrada(id), AUTOR, AGORA);
    const r = await gerar.gerarPdfImr({
      contratoId: id,
      competencia: COMPETENCIA,
      sessao: { userId: String(new Types.ObjectId()), role: 'Preposto' },
    });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(await M.Emissao.countDocuments()).toBe(0);
  });

  it('mês fechado grava a emissão da versão vigente com o hash dos bytes', async () => {
    const id = await contrato();
    const sessao = await admin();
    await fechamento.fecharMesImr(entrada(id), AUTOR, AGORA);

    const r = await gerar.gerarPdfImr({
      contratoId: id,
      competencia: COMPETENCIA,
      sessao,
      agora: b('2026-11-04T09:00'),
    });
    if (!r.ok) throw new Error(r.error);

    expect(r.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(r.nomeArquivo).toBe('imr-contrato-12-2025-2026-10-v1.pdf');
    const sha = createHash('sha256').update(r.bytes).digest('hex');
    expect(r.sha256).toBe(sha);

    const foto = await M.Fechamento.findOne({ versao: 1 }).lean();
    const emissoes = await M.Emissao.find().lean();
    expect(emissoes).toHaveLength(1);
    expect(String(emissoes[0]._id)).toBe(r.emissaoId);
    expect(String(emissoes[0].fechamentoId)).toBe(String(foto?._id));
    expect(emissoes[0].sha256).toBe(sha);
    // Admin sem designação de fiscal ou gestor emite como `admin`.
    expect(emissoes[0].papel).toBe('admin');
  });

  it('depois de reabrir, o mês volta a responder 409', async () => {
    const id = await contrato();
    const sessao = await admin();
    await fechamento.fecharMesImr(entrada(id), AUTOR, AGORA);
    await fechamento.reabrirMesImr(
      { contratoId: id, competencia: COMPETENCIA, motivo: 'Revisar o mês inteiro.' },
      AUTOR,
      b('2026-11-04T10:00'),
    );
    const r = await gerar.gerarPdfImr({ contratoId: id, competencia: COMPETENCIA, sessao });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });
});
