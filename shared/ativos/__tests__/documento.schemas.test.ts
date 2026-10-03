import { describe, expect, it } from 'vitest';

import {
  CadastrarDocumentoSchema,
  CorrigirDocumentoSchema,
  ExcluirDocumentoSchema,
  FiltroPainelDocumentosSchema,
} from '../documento.schemas';

/** Schemas dos documentos (spec 0013): as recusas de entrada que a rota e as actions usam. */

const ATIVO = 'a'.repeat(24);
const LOCAL = 'b'.repeat(24);
const base = { tipo: 'PMOC', ativoId: ATIVO, emitidoEm: '2026-01-10', validadeAte: '2027-01-10' };

const primeiroErro = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? null : r.error!.issues[0].message;

describe('CadastrarDocumentoSchema (AC-3)', () => {
  it('aceita ativo, normaliza o tipo e transforma vazio em ausente', () => {
    const r = CadastrarDocumentoSchema.safeParse({ ...base, numero: '  ', localizacaoId: '' });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ tipo: 'pmoc', ativoId: ATIVO, numero: undefined });
    expect(r.data?.localizacaoId).toBeUndefined();
  });

  it('aceita só local', () => {
    const r = CadastrarDocumentoSchema.safeParse({ ...base, ativoId: '', localizacaoId: LOCAL });
    expect(r.success).toBe(true);
  });

  it('recusa os dois alvos e nenhum alvo', () => {
    const msg = 'Escolha um ativo ou um local (só um dos dois).';
    expect(
      primeiroErro(CadastrarDocumentoSchema.safeParse({ ...base, localizacaoId: LOCAL })),
    ).toBe(msg);
    expect(primeiroErro(CadastrarDocumentoSchema.safeParse({ ...base, ativoId: '' }))).toBe(msg);
  });

  it('validade igual à emissão é aceita; anterior é recusada', () => {
    expect(CadastrarDocumentoSchema.safeParse({ ...base, validadeAte: '2026-01-10' }).success).toBe(
      true,
    );
    expect(
      primeiroErro(CadastrarDocumentoSchema.safeParse({ ...base, validadeAte: '2026-01-09' })),
    ).toBe('A validade não pode ser anterior à emissão.');
  });

  it('sem validade é aceito (documento sem vencimento)', () => {
    const r = CadastrarDocumentoSchema.safeParse({ ...base, validadeAte: '' });
    expect(r.success).toBe(true);
    expect(r.data?.validadeAte).toBeUndefined();
  });

  it.each(['', '10/01/2026', '2026-13-40'])('emissão "%s" é recusada', (emitidoEm) => {
    expect(CadastrarDocumentoSchema.safeParse({ ...base, emitidoEm }).success).toBe(false);
  });

  it('número acima de 80 e emissor acima de 120 caracteres são recusados', () => {
    expect(CadastrarDocumentoSchema.safeParse({ ...base, numero: 'x'.repeat(81) }).success).toBe(
      false,
    );
    expect(
      CadastrarDocumentoSchema.safeParse({ ...base, emitidoPor: 'x'.repeat(121) }).success,
    ).toBe(false);
  });

  it('id de alvo fora do formato é recusado', () => {
    expect(CadastrarDocumentoSchema.safeParse({ ...base, ativoId: '../x' }).success).toBe(false);
  });
});

describe('CorrigirDocumentoSchema (AC-5)', () => {
  it('exige id válido e mantém a regra de validade', () => {
    expect(CorrigirDocumentoSchema.safeParse({ id: 'x', emitidoEm: '2026-01-10' }).success).toBe(
      false,
    );
    expect(
      CorrigirDocumentoSchema.safeParse({
        id: ATIVO,
        emitidoEm: '2026-01-10',
        validadeAte: '2025-01-01',
      }).success,
    ).toBe(false);
    expect(CorrigirDocumentoSchema.safeParse({ id: ATIVO, emitidoEm: '2026-01-10' }).success).toBe(
      true,
    );
  });
});

describe('ExcluirDocumentoSchema (AC-6)', () => {
  it('motivo obrigatório, aparado, até 500', () => {
    expect(ExcluirDocumentoSchema.safeParse({ id: ATIVO, motivo: ' ' }).success).toBe(false);
    expect(ExcluirDocumentoSchema.safeParse({ id: ATIVO, motivo: 'x'.repeat(500) }).success).toBe(
      true,
    );
    expect(ExcluirDocumentoSchema.safeParse({ id: ATIVO, motivo: 'x'.repeat(501) }).success).toBe(
      false,
    );
    expect(ExcluirDocumentoSchema.parse({ id: ATIVO, motivo: '  errado ' }).motivo).toBe('errado');
  });
});

describe('FiltroPainelDocumentosSchema (AC-9)', () => {
  it('valores ruins da URL caem nos padrões, sem quebrar a página', () => {
    expect(
      FiltroPainelDocumentosSchema.parse({
        visao: 'outra',
        situacao: 'qualquer',
        predio: '../x',
        pagina: '-3',
      }),
    ).toEqual({
      visao: 'documentos',
      tipo: undefined,
      situacao: undefined,
      predio: undefined,
      pagina: 1,
    });
  });

  it('valores válidos passam', () => {
    expect(
      FiltroPainelDocumentosSchema.parse({
        visao: 'faltando',
        tipo: 'AVCB',
        situacao: 'ate_30',
        predio: LOCAL,
        pagina: '2',
      }),
    ).toEqual({ visao: 'faltando', tipo: 'avcb', situacao: 'ate_30', predio: LOCAL, pagina: 2 });
  });
});
