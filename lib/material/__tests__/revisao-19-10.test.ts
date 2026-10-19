import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { NotaFiscalSchema } from '@/shared/material/cotacao.schemas';
import { textoSeloPrazoAteste } from '@/shared/material/mensagens';

import { podeRemoverArquivo } from '../arquivos';
import type { Papeis } from '../papeis';
import { papelDaEmissao } from '../pdf/gerar';
import { pendenciaDaContratada, visivelParaContratada } from '../pendencia';
import { recusaDaDataDaNotaFiscal } from '../transicoes';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

/**
 * As escolhas da revisão de 19/10 (spec 0019, passo 13a) que não precisam
 * de banco: a data da nota fiscal no dia de Belém, a remoção do arquivo de
 * NF não ligado, a NF pendente, o papel da emissão do PDF e o selo.
 *
 * covers: AC-15, AC-21, AC-22, AC-23
 */

describe('recusaDaDataDaNotaFiscal (AC-22)', () => {
  const autorizadoEm = new Date('2026-10-10T15:00:00Z');

  it('aceita hoje em Belém e recusa amanhã, com a virada às 03:00 UTC', () => {
    // 02:59 UTC do dia 20 ainda é dia 19 em Belém: o dia 20 é futuro.
    const antes = new Date('2026-10-20T02:59:00Z');
    expect(recusaDaDataDaNotaFiscal('2026-10-19', autorizadoEm, antes)).toBeNull();
    expect(recusaDaDataDaNotaFiscal('2026-10-20', autorizadoEm, antes)).toBe('data_futura');
    // 03:00 UTC já é dia 20 em Belém.
    const depois = new Date('2026-10-20T03:00:00Z');
    expect(recusaDaDataDaNotaFiscal('2026-10-20', autorizadoEm, depois)).toBeNull();
    expect(recusaDaDataDaNotaFiscal('2026-10-21', autorizadoEm, depois)).toBe('data_futura');
  });

  it('às 22:00 de Belém, já dia seguinte em UTC, a data de hoje passa', () => {
    const agora = new Date('2026-10-20T01:00:00Z'); // 22:00 do dia 19 em Belém
    expect(recusaDaDataDaNotaFiscal('2026-10-19', autorizadoEm, agora)).toBeNull();
  });

  it('recusa o dia anterior ao da autorização e aceita o próprio dia, em Belém', () => {
    const agora = new Date('2026-10-19T15:00:00Z');
    expect(recusaDaDataDaNotaFiscal('2026-10-09', autorizadoEm, agora)).toBe(
      'data_antes_da_autorizacao',
    );
    expect(recusaDaDataDaNotaFiscal('2026-10-10', autorizadoEm, agora)).toBeNull();
    // Autorizada às 01:00 UTC do dia 11: em Belém ainda é dia 10, que passa.
    const tarde = new Date('2026-10-11T01:00:00Z');
    expect(recusaDaDataDaNotaFiscal('2026-10-10', tarde, agora)).toBeNull();
  });
});

describe('NotaFiscalSchema (AC-22)', () => {
  const nf = { id: 'c'.repeat(24), versao: 9, numero: '1', arquivoId: 'a'.repeat(24) };

  it('recusa a data impossível com "Data inválida." antes do banco', () => {
    const r = NotaFiscalSchema.safeParse({ ...nf, data: '2026-02-31' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Data inválida.');
  });

  it('aceita a data real', () => {
    expect(NotaFiscalSchema.safeParse({ ...nf, data: '2026-02-28' }).success).toBe(true);
  });
});

describe('podeRemoverArquivo (AC-22)', () => {
  const arquivo = (tipo: 'orcamento' | 'evidencia' | 'nota_fiscal') => ({
    _id: new Types.ObjectId(),
    tipo,
  });

  it('remove em rascunho e devolvida, como antes', () => {
    expect(podeRemoverArquivo(arquivo('orcamento'), { situacao: 'rascunho' })).toBe(true);
    expect(podeRemoverArquivo(arquivo('orcamento'), { situacao: 'devolvida' })).toBe(true);
    expect(podeRemoverArquivo(arquivo('orcamento'), { situacao: 'enviada' })).toBe(false);
  });

  it('na atestada, só a NF ainda não ligada à nota', () => {
    const solta = arquivo('nota_fiscal');
    const ligada = arquivo('nota_fiscal');
    expect(podeRemoverArquivo(solta, { situacao: 'atestada', notaFiscal: null })).toBe(true);
    expect(
      podeRemoverArquivo(solta, { situacao: 'atestada', notaFiscal: { arquivoId: ligada._id } }),
    ).toBe(true);
    expect(
      podeRemoverArquivo(ligada, { situacao: 'atestada', notaFiscal: { arquivoId: ligada._id } }),
    ).toBe(false);
    expect(podeRemoverArquivo(arquivo('evidencia'), { situacao: 'atestada' })).toBe(false);
    expect(podeRemoverArquivo(arquivo('orcamento'), { situacao: 'atestada' })).toBe(false);
  });

  it('a NF fora da atestada não sai', () => {
    expect(podeRemoverArquivo(arquivo('nota_fiscal'), { situacao: 'executada' })).toBe(false);
  });
});

describe('pendenciaDaContratada e visivelParaContratada (AC-15)', () => {
  const agora = new Date('2026-10-19T12:00:00Z');
  const dias = (n: number) => new Date(agora.getTime() - n * 24 * 60 * 60 * 1000);

  it('a atestada sem NF é pendência por mais velha que seja', () => {
    const cot = { situacao: 'atestada' as const, emTramite: false, updatedAt: dias(400) };
    expect(pendenciaDaContratada(cot)).toBe(true);
    expect(visivelParaContratada(cot, agora)).toBe(true);
  });

  it('com NF, conta 90 dias de updatedAt', () => {
    const nf = { numero: '1' };
    const base = { situacao: 'atestada' as const, emTramite: false, notaFiscal: nf };
    expect(pendenciaDaContratada(base)).toBe(false);
    expect(visivelParaContratada({ ...base, updatedAt: dias(89) }, agora)).toBe(true);
    expect(visivelParaContratada({ ...base, updatedAt: dias(91) }, agora)).toBe(false);
  });
});

describe('papelDaEmissao (AC-23)', () => {
  const papeis = (tem: string[], leitorAdmin = false) =>
    ({ tem: (p: string) => tem.includes(p), leitorAdmin }) as unknown as Papeis;

  it('grava o papel da designação, ou admin sem ela', () => {
    expect(papelDaEmissao(papeis(['gestor']))).toBe('gestor');
    expect(papelDaEmissao(papeis(['aprovador', 'fiscal']))).toBe('fiscal');
    expect(papelDaEmissao(papeis([], true))).toBe('admin');
  });

  it('quem não é do lado TRF1 não emite', () => {
    expect(papelDaEmissao(papeis(['responsavel_tecnico']))).toBeNull();
    expect(papelDaEmissao(papeis([]))).toBeNull();
  });
});

describe('textoSeloPrazoAteste (AC-21)', () => {
  it('monta o texto pelos rótulos de mensagens.ts', () => {
    expect(
      textoSeloPrazoAteste({ etapa: 'provisorio', venceEm: '2026-10-15', atrasado: true }),
    ).toBe('Recebimento provisório atrasado (prazo 15/10/2026)');
    expect(
      textoSeloPrazoAteste({ etapa: 'definitivo', venceEm: '2026-10-20', atrasado: false }),
    ).toBe('Recebimento definitivo até 20/10/2026');
  });
});
