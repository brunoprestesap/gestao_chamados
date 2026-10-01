import { describe, expect, it } from 'vitest';

import {
  AlterarStatusAtivoSchema,
  BuscaSeletorSchema,
  CategoriaAtivoFormSchema,
  CriarAtivoSchema,
  CriarLocalizacaoSchema,
  EditarLocalizacaoSchema,
  FiltrosListaAtivosSchema,
  VincularAtivoChamadoSchema,
} from '../ativo.schemas';

/** Validação de entrada do módulo de ativos (spec 0011). */

const ID = '507f1f77bcf86cd799439011';

function erro(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? null : r.error!.issues[0].message;
}

describe('CriarLocalizacaoSchema (AC-1, AC-2)', () => {
  it('aceita um prédio sem pai e tira os espaços do nome', () => {
    const r = CriarLocalizacaoSchema.safeParse({ nome: '  Sede  ', tipo: 'predio' });
    expect(r.success && r.data).toMatchObject({ nome: 'Sede', tipo: 'predio' });
  });

  it('recusa nome com "/", que quebraria o caminho e o filtro por prefixo', () => {
    expect(erro(CriarLocalizacaoSchema.safeParse({ nome: 'A/B', tipo: 'sala' }))).toBe(
      'O nome não pode ter "/".',
    );
  });

  it('recusa nome vazio ou só com espaços', () => {
    expect(erro(CriarLocalizacaoSchema.safeParse({ nome: '   ', tipo: 'predio' }))).toBe(
      'Informe o nome do local.',
    );
  });

  it('trata pai e unidade vazios como ausentes', () => {
    const r = CriarLocalizacaoSchema.safeParse({
      nome: 'X',
      tipo: 'predio',
      parentId: '',
      unitId: '',
    });
    expect(r.success && r.data.parentId).toBeUndefined();
    expect(r.success && r.data.unitId).toBeUndefined();
  });

  it('recusa tipo fora da lista', () => {
    expect(CriarLocalizacaoSchema.safeParse({ nome: 'X', tipo: 'bloco' }).success).toBe(false);
  });
});

describe('EditarLocalizacaoSchema', () => {
  it('aceita parentId null (pedido de raiz) e ausente (não mexe no pai)', () => {
    expect(EditarLocalizacaoSchema.safeParse({ id: ID, parentId: null }).success).toBe(true);
    const r = EditarLocalizacaoSchema.safeParse({ id: ID, nome: 'Novo' });
    expect(r.success && 'parentId' in r.data).toBe(false);
  });

  it('recusa id inválido', () => {
    expect(EditarLocalizacaoSchema.safeParse({ id: 'x' }).success).toBe(false);
  });
});

describe('CriarAtivoSchema (AC-4)', () => {
  const base = { descricao: 'Split', categoriaId: ID, tierManutencao: 'A' as const };

  it('exige tombamento no patrimoniado', () => {
    expect(erro(CriarAtivoSchema.safeParse({ ...base, origemCodigo: 'patrimonio' }))).toBe(
      'Informe o tombamento.',
    );
  });

  it('recusa tombamento com letra, para nunca invadir a faixa MNT-', () => {
    expect(
      erro(
        CriarAtivoSchema.safeParse({ ...base, origemCodigo: 'patrimonio', tombamento: 'MNT-1' }),
      ),
    ).toBe('O tombamento só tem números.');
  });

  it('tira espaços do tombamento', () => {
    const r = CriarAtivoSchema.safeParse({
      ...base,
      origemCodigo: 'patrimonio',
      tombamento: ' 0119 97 ',
    });
    expect(r.success && r.data.tombamento).toBe('011997');
  });

  it('interno não precisa de tombamento', () => {
    expect(CriarAtivoSchema.safeParse({ ...base, origemCodigo: 'interno' }).success).toBe(true);
  });

  it('criticidade vazia vira ausente, para valer a da categoria', () => {
    const r = CriarAtivoSchema.safeParse({ ...base, origemCodigo: 'interno', criticidade: '' });
    expect(r.success && r.data.criticidade).toBeUndefined();
  });

  it('data de instalação vira Date ao meio dia UTC, sem mudar de dia em Belém', () => {
    const r = CriarAtivoSchema.safeParse({
      ...base,
      origemCodigo: 'interno',
      dataInstalacao: '2026-03-01',
    });
    expect(r.success && r.data.dataInstalacao?.toISOString()).toBe('2026-03-01T12:00:00.000Z');
  });

  it('textos opcionais em branco viram ausentes', () => {
    const r = CriarAtivoSchema.safeParse({ ...base, origemCodigo: 'interno', fabricante: '   ' });
    expect(r.success && r.data.fabricante).toBeUndefined();
  });

  it('recusa data fora do formato do input', () => {
    expect(
      CriarAtivoSchema.safeParse({ ...base, origemCodigo: 'interno', dataInstalacao: '01/03/2026' })
        .success,
    ).toBe(false);
  });
});

describe('AlterarStatusAtivoSchema', () => {
  it('aceita observação ausente (a exigência por status fica na regra de negócio)', () => {
    expect(AlterarStatusAtivoSchema.safeParse({ id: ID, status: 'baixado' }).success).toBe(true);
  });

  it('recusa status inexistente', () => {
    expect(AlterarStatusAtivoSchema.safeParse({ id: ID, status: 'quebrado' }).success).toBe(false);
  });
});

describe('CategoriaAtivoFormSchema (AC-3)', () => {
  it('normaliza a chave para minúsculas e limpa a lista de documentos', () => {
    const r = CategoriaAtivoFormSchema.safeParse({
      chave: ' Climatizacao ',
      nome: 'Climatização',
      criticidadePadrao: 'media',
      exigeDocumento: [' PMOC', '', 'ART ', 'PMOC'],
      periodicidadePreventivaDias: '30',
    });
    expect(r.success && r.data).toMatchObject({
      chave: 'climatizacao',
      exigeDocumento: ['PMOC', 'ART'],
      periodicidadePreventivaDias: 30,
    });
  });

  it('recusa chave com espaço ou acento', () => {
    expect(
      CategoriaAtivoFormSchema.safeParse({
        chave: 'ar condicionado',
        nome: 'x',
        criticidadePadrao: 'baixa',
      }).success,
    ).toBe(false);
  });

  it('periodicidade e vida útil vazias viram ausentes', () => {
    const r = CategoriaAtivoFormSchema.safeParse({
      chave: 'abc',
      nome: 'Abc',
      criticidadePadrao: 'baixa',
      periodicidadePreventivaDias: '',
      vidaUtilAnos: '',
    });
    expect(r.success && r.data.periodicidadePreventivaDias).toBeUndefined();
    expect(r.success && r.data.vidaUtilAnos).toBeUndefined();
  });

  it('recusa periodicidade zero', () => {
    expect(
      CategoriaAtivoFormSchema.safeParse({
        chave: 'abc',
        nome: 'Abc',
        criticidadePadrao: 'baixa',
        periodicidadePreventivaDias: '0',
      }).success,
    ).toBe(false);
  });
});

describe('VincularAtivoChamadoSchema (AC-16)', () => {
  it('aceita null para remover o equipamento', () => {
    expect(VincularAtivoChamadoSchema.safeParse({ chamadoId: ID, ativoId: null }).success).toBe(
      true,
    );
  });

  it('recusa ativoId ausente (remover tem que ser explícito)', () => {
    expect(VincularAtivoChamadoSchema.safeParse({ chamadoId: ID }).success).toBe(false);
  });
});

describe('BuscaSeletorSchema (AC-14)', () => {
  it('exige ao menos 2 caracteres depois de tirar os espaços', () => {
    expect(erro(BuscaSeletorSchema.safeParse({ q: ' a ' }))).toBe('Digite ao menos 2 caracteres.');
  });

  it('usa 20 de limite por padrão e recusa acima de 50', () => {
    const r = BuscaSeletorSchema.safeParse({ q: 'ab' });
    expect(r.success && r.data.limite).toBe(20);
    expect(BuscaSeletorSchema.safeParse({ q: 'ab', limite: '51' }).success).toBe(false);
  });
});

describe('FiltrosListaAtivosSchema (AC-10)', () => {
  it('aceita "sem" como filtro de local', () => {
    const r = FiltrosListaAtivosSchema.parse({ local: 'sem' });
    expect(r.local).toBe('sem');
  });

  it('ignora valores inválidos na URL em vez de quebrar a página', () => {
    const r = FiltrosListaAtivosSchema.parse({
      local: 'lixo',
      categoria: 'x',
      status: 'quebrado',
      cadastro: 'nada',
      pagina: '-3',
    });
    expect(r).toMatchObject({
      local: undefined,
      categoria: undefined,
      status: undefined,
      cadastro: undefined,
      pagina: 1,
    });
  });

  it('busca em branco vira ausente', () => {
    expect(FiltrosListaAtivosSchema.parse({ q: '   ' }).q).toBeUndefined();
  });
});
