import { describe, expect, it } from 'vitest';

import { CategoriaAtivoFormSchema, FiltrosListaAtivosSchema } from '../ativo.schemas';

/**
 * Os limites da categoria e o filtro da lista (spec 0015): vazio vira
 * ausente (a regra grava `null`), fora de 1 a 99 ou não inteiro devolve a
 * mensagem do campo, e valor estranho no filtro é ignorado.
 *
 * covers: AC-6, AC-9
 */

const base = { chave: 'climatizacao', nome: 'Climatização', criticidadePadrao: 'media' as const };

describe('limites da categoria', () => {
  it('vazio e ausente viram ausente, nunca 0', () => {
    const r = CategoriaAtivoFormSchema.parse({
      ...base,
      limiteCorretivos12m: '',
      limiteReincidencia90d: null,
    });
    expect(r.limiteCorretivos12m).toBeUndefined();
    expect(r.limiteReincidencia90d).toBeUndefined();
  });

  it('aceita inteiro de 1 a 99 vindo como texto', () => {
    const r = CategoriaAtivoFormSchema.parse({
      ...base,
      limiteCorretivos12m: '1',
      limiteReincidencia90d: '99',
    });
    expect(r.limiteCorretivos12m).toBe(1);
    expect(r.limiteReincidencia90d).toBe(99);
  });

  it.each(['0', '100', '2.5', 'abc'])('corretivos %s é inválido', (v) => {
    const r = CategoriaAtivoFormSchema.safeParse({ ...base, limiteCorretivos12m: v });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Limite de corretivos inválido.');
  });

  it.each(['0', '100', '1.5'])('reincidência %s é inválida', (v) => {
    const r = CategoriaAtivoFormSchema.safeParse({ ...base, limiteReincidencia90d: v });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Limite de reincidência inválido.');
  });
});

describe('filtro "Substituição" da lista', () => {
  it('aceita candidatos e dispensados e ignora o resto', () => {
    expect(FiltrosListaAtivosSchema.parse({ substituicao: 'candidatos' }).substituicao).toBe(
      'candidatos',
    );
    expect(FiltrosListaAtivosSchema.parse({ substituicao: 'dispensados' }).substituicao).toBe(
      'dispensados',
    );
    expect(FiltrosListaAtivosSchema.parse({ substituicao: 'tudo' }).substituicao).toBeUndefined();
  });
});
