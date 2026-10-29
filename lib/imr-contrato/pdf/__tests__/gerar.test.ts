import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A geração do PDF do fechamento sem banco (spec 0023): acesso, mês aberto,
 * a trava dividida com os outros PDFs, a ordem montar → hash → gravar, e o
 * log da falha só com contrato, mês e mensagem.
 *
 * covers: AC-13, AC-14
 */

const m = vi.hoisted(() => ({
  papeisDe: vi.fn(),
  lerEstadoDoMes: vi.fn(),
  lerFechamento: vi.fn(),
  renderToBuffer: vi.fn(),
  create: vi.fn(),
  nomeDoUsuario: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/material/papeis', () => ({ papeisDe: m.papeisDe }));
vi.mock('@/lib/contratos/usuario', () => ({ nomeDoUsuario: m.nomeDoUsuario }));
vi.mock('../../estado', () => ({
  lerEstadoDoMes: m.lerEstadoDoMes,
  lerFechamento: m.lerFechamento,
}));
vi.mock('@react-pdf/renderer', async (original) => ({
  ...(await original<typeof import('@react-pdf/renderer')>()),
  renderToBuffer: m.renderToBuffer,
}));
vi.mock('@/models/ImrFechamentoPdfEmissao', () => ({
  ImrFechamentoPdfEmissaoModel: { create: m.create },
}));

import { soltarTrava, tentarPegarTrava } from '@/lib/contratos/pdf/trava';
import { MENSAGENS_PDF_IMR } from '@/shared/imr-contrato/imr-contrato.constants';

import { gerarPdfImr, nomeDoArquivoPdfImr } from '../gerar';

const CONTRATO = 'c'.repeat(24);
const USUARIO = 'b'.repeat(24);
const FECHAMENTO = 'f'.repeat(24);
const agora = new Date('2026-11-04T12:00:00.000Z');
const BYTES = Buffer.from('%PDF-1.3 conteúdo');

function papeis(role: string, designacoes: string[] = []) {
  m.papeisDe.mockResolvedValue({ role, tem: (p: string) => designacoes.includes(p) });
}

const foto = {
  id: FECHAMENTO,
  contratoNumero: '12/2025',
  competencia: '2026-10',
  versao: 2,
  reincidenciaZero: [],
  reincidenciaAvaliada: false,
  parametros: { vigencia: { inicio: '2026-01-01', fim: '2027-02-28' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  soltarTrava();
  papeis('Admin', ['fiscal']);
  m.lerEstadoDoMes.mockResolvedValue({ fechado: true, maiorVersao: 2, intervalos: [] });
  m.lerFechamento.mockResolvedValue(foto);
  m.renderToBuffer.mockResolvedValue(BYTES);
  m.create.mockResolvedValue({});
  m.nomeDoUsuario.mockResolvedValue('Fiscal Teste');
});

afterEach(() => soltarTrava());

const pedir = (role = 'Admin') =>
  gerarPdfImr({
    contratoId: CONTRATO,
    competencia: '2026-10',
    sessao: { userId: USUARIO, role },
    agora,
  });

describe('nomeDoArquivoPdfImr', () => {
  it('troca o que não é letra, dígito ou hífen e leva a versão', () => {
    expect(nomeDoArquivoPdfImr('12/2025', '2026-10', 3)).toBe(
      'imr-contrato-12-2025-2026-10-v3.pdf',
    );
  });
});

describe('gerarPdfImr', () => {
  it('lê a versão vigente, calcula o hash dos bytes e grava a emissão com o mesmo código', async () => {
    const r = await pedir();

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(m.lerFechamento).toHaveBeenCalledWith(CONTRATO, '2026-10', 2);
    expect(r.sha256).toBe(createHash('sha256').update(BYTES).digest('hex'));
    expect(r.nomeArquivo).toBe('imr-contrato-12-2025-2026-10-v2.pdf');
    const gravado = m.create.mock.calls[0]![0];
    expect(String(gravado._id)).toBe(r.emissaoId);
    expect(String(gravado.fechamentoId)).toBe(FECHAMENTO);
    expect(gravado).toMatchObject({ sha256: r.sha256, papel: 'fiscal', em: agora });
    const elemento = m.renderToBuffer.mock.calls[0]![0];
    expect(elemento.props.emissaoId).toBe(r.emissaoId);
    expect(elemento.props.geradoPorNome).toBe('Fiscal Teste');
  });

  it('grava o papel de gestor, ou admin sem designação', async () => {
    papeis('Admin', ['gestor']);
    await pedir();
    papeis('Admin');
    await pedir();
    expect(m.create.mock.calls.map((c) => c[0].papel)).toEqual(['gestor', 'admin']);
  });

  it('403 para quem não é Admin, mesmo com designação, sem ler o mês (AC-14)', async () => {
    papeis('Preposto', ['fiscal']);
    expect(await pedir('Preposto')).toEqual({
      ok: false,
      status: 403,
      error: MENSAGENS_PDF_IMR.semAcesso,
    });
    expect(m.lerEstadoDoMes).not.toHaveBeenCalled();
  });

  it('409 com o mês aberto, sem gerar nada', async () => {
    m.lerEstadoDoMes.mockResolvedValueOnce({ fechado: false, maiorVersao: 1, intervalos: [] });
    expect(await pedir()).toEqual({ ok: false, status: 409, error: MENSAGENS_PDF_IMR.mesAberto });
    expect(m.renderToBuffer).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it('429 com outro PDF em curso (a trava é a mesma do relatório por contrato)', async () => {
    tentarPegarTrava();
    expect(await pedir()).toEqual({ ok: false, status: 429, error: MENSAGENS_PDF_IMR.ocupado });
    expect(m.renderToBuffer).not.toHaveBeenCalled();
  });

  it('render que falha: 500, nada gravado, a trava liberada e o log sem nomes', async () => {
    m.renderToBuffer.mockRejectedValueOnce(new Error('layout quebrou'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await pedir()).toEqual({ ok: false, status: 500, error: MENSAGENS_PDF_IMR.falhou });
    expect(m.create).not.toHaveBeenCalled();
    expect(tentarPegarTrava()).toBe(true);
    expect(log.mock.calls[0]![1]).toEqual({
      contratoId: CONTRATO,
      competencia: '2026-10',
      erro: 'layout quebrou',
    });
    log.mockRestore();
  });

  it('gravação que falha: 500 e nenhum byte devolvido', async () => {
    m.create.mockRejectedValueOnce(new Error('disco cheio'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await pedir();
    expect(r).toEqual({ ok: false, status: 500, error: MENSAGENS_PDF_IMR.falhou });
    expect(r).not.toHaveProperty('bytes');
    log.mockRestore();
  });
});
