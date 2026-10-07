import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A geração do PDF sem banco (spec 0016): a trava de uma geração por vez, o
 * mapeamento dos motivos para status, a ordem montar → hash → gravar, e o log
 * da falha só com contrato, mês e mensagem.
 *
 * covers: AC-16, AC-18, AC-20
 */

const m = vi.hoisted(() => ({
  montarRelatorioContrato: vi.fn(),
  renderToBuffer: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/contratos/relatorio', () => ({
  montarRelatorioContrato: m.montarRelatorioContrato,
}));
vi.mock('@react-pdf/renderer', async (original) => ({
  ...(await original<typeof import('@react-pdf/renderer')>()),
  renderToBuffer: m.renderToBuffer,
}));
vi.mock('@/models/RelatorioContratoEmissao', () => ({
  RelatorioContratoEmissaoModel: { create: m.create },
}));
vi.mock('@/models/user.model', () => ({
  UserModel: {
    findById: m.findById,
  },
}));

import {
  ERRO_CONTRATO_INEXISTENTE,
  ERRO_MES_FORA,
  ERRO_PDF_FALHOU,
  ERRO_PDF_OCUPADO,
  gerarPdfContrato,
} from '../gerar';
import { soltarTrava, tentarPegarTrava } from '../trava';

const CONTRATO = 'c'.repeat(24);
const USUARIO = 'u'.repeat(24).replace(/u/g, 'b');
const agora = new Date('2026-10-07T15:00:00.000Z');
const BYTES = Buffer.from('%PDF-1.3 conteúdo');

function usuario(doc: unknown) {
  m.findById.mockReturnValue({ select: () => ({ lean: async () => doc }) });
}

const relatorio = { contrato: { numero: '12/2025' } };

beforeEach(() => {
  vi.clearAllMocks();
  soltarTrava();
  usuario({ name: 'Admin Teste' });
  m.montarRelatorioContrato.mockResolvedValue({ ok: true, relatorio });
  m.renderToBuffer.mockResolvedValue(BYTES);
  m.create.mockResolvedValue({});
});

afterEach(() => soltarTrava());

const pedir = () =>
  gerarPdfContrato({ contratoId: CONTRATO, mes: '2026-09', userId: USUARIO, agora });

describe('trava', () => {
  it('só uma geração pega a trava, e ela volta a ficar livre', () => {
    expect(tentarPegarTrava()).toBe(true);
    expect(tentarPegarTrava()).toBe(false);
    soltarTrava();
    expect(tentarPegarTrava()).toBe(true);
  });
});

describe('gerarPdfContrato', () => {
  it('monta, calcula o hash dos bytes entregues e grava a emissão com o mesmo código', async () => {
    const r = await pedir();

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hashSha256).toBe(createHash('sha256').update(BYTES).digest('hex'));
    expect(r.nomeArquivo).toBe('relatorio-contrato-12-2025-2026-09.pdf');
    expect(m.montarRelatorioContrato).toHaveBeenCalledWith({
      contratoId: CONTRATO,
      mes: '2026-09',
      agora,
      geradoPorNome: 'Admin Teste',
    });
    const gravado = m.create.mock.calls[0]![0];
    expect(String(gravado._id)).toBe(r.emissaoId);
    expect(gravado).toMatchObject({
      mes: '2026-09',
      geradoPorNome: 'Admin Teste',
      geradoEm: agora,
      hashSha256: r.hashSha256,
    });
    // O código impresso no PDF é o mesmo da emissão.
    const elemento = m.renderToBuffer.mock.calls[0]![0];
    expect(elemento.props.emissaoId).toBe(r.emissaoId);
  });

  it('responde 429 com outra geração em curso, sem ler nada', async () => {
    tentarPegarTrava();

    expect(await pedir()).toEqual({ ok: false, status: 429, error: ERRO_PDF_OCUPADO });
    expect(m.montarRelatorioContrato).not.toHaveBeenCalled();
  });

  it('404 para contrato inexistente e 422 para mês fora da vigência, sem gravar', async () => {
    m.montarRelatorioContrato.mockResolvedValueOnce({ ok: false, motivo: 'contrato_inexistente' });
    expect(await pedir()).toEqual({ ok: false, status: 404, error: ERRO_CONTRATO_INEXISTENTE });

    m.montarRelatorioContrato.mockResolvedValueOnce({ ok: false, motivo: 'mes_fora_da_vigencia' });
    expect(await pedir()).toEqual({ ok: false, status: 422, error: ERRO_MES_FORA });

    expect(m.create).not.toHaveBeenCalled();
  });

  it('montagem que falha: 500, nada gravado e a trava liberada (AC-18)', async () => {
    m.renderToBuffer.mockRejectedValueOnce(new Error('layout quebrou'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await pedir()).toEqual({ ok: false, status: 500, error: ERRO_PDF_FALHOU });
    expect(m.create).not.toHaveBeenCalled();
    expect(tentarPegarTrava()).toBe(true);
    log.mockRestore();
  });

  it('gravação que falha: 500 e nenhum byte devolvido (AC-18)', async () => {
    m.create.mockRejectedValueOnce(new Error('disco cheio'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const r = await pedir();

    expect(r).toEqual({ ok: false, status: 500, error: ERRO_PDF_FALHOU });
    expect(r).not.toHaveProperty('bytes');
    log.mockRestore();
  });

  it('o log da falha leva só contrato, mês e a mensagem, sem nome nem números (AC-18)', async () => {
    m.montarRelatorioContrato.mockRejectedValueOnce(new Error('timeout'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await pedir();

    expect(log).toHaveBeenCalledTimes(1);
    const [, dados] = log.mock.calls[0]!;
    expect(dados).toEqual({ contratoId: CONTRATO, mes: '2026-09', erro: 'timeout' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Admin Teste');
    log.mockRestore();
  });
});
