import { describe, expect, it } from 'vitest';

import {
  dataHoraDoCadastro,
  escadaDeFaixas,
  linhaDoTempoDoEmpenho,
  secaoDoCadastro,
} from '../cadastro';
import { mesCurto, TEXTO_CADASTRO, TEXTO_CONFIRMACAO_CADASTRO } from '../mensagens';

/**
 * O cadastro de material em seções (spec 0021, fatia 7): a seção do endereço,
 * a escada de faixas e os textos da navegação e das confirmações.
 *
 * covers: AC-18, AC-20, AC-21
 */

describe('secaoDoCadastro', () => {
  it('aceita as seis seções e cai em empenhos com valor ausente ou desconhecido', () => {
    expect(secaoDoCadastro('faixas')).toBe('faixas');
    expect(secaoDoCadastro('anexo-v')).toBe('anexo-v');
    expect(secaoDoCadastro(undefined)).toBe('empenhos');
    expect(secaoDoCadastro('lixo')).toBe('empenhos');
    expect(secaoDoCadastro(['sinapi', 'faixas'])).toBe('sinapi');
  });
});

describe('escadaDeFaixas', () => {
  const faixas = [
    { id: 'f2', nome: 'Faixa II', limiteCentavos: 20_000_00, ativa: true },
    { id: 'f1', nome: 'Faixa I', limiteCentavos: 5_000_00, ativa: true },
    { id: 'f3', nome: 'Antiga', limiteCentavos: 90_000_00, ativa: false },
  ];

  it('ordena as ativas por limite e conta só aprovadores vigentes de cada faixa', () => {
    const escada = escadaDeFaixas(faixas, [
      { papel: 'aprovador', faixaId: 'f2', vigente: true },
      { papel: 'aprovador', faixaId: 'f2', vigente: false },
      { papel: 'aprovador', faixaId: 'f3', vigente: true },
      { papel: 'fiscal', faixaId: null, vigente: true },
    ]);
    expect(escada.degraus).toEqual([
      { id: 'f1', nome: 'Faixa I', limiteCentavos: 5_000_00, aprovadores: 0 },
      { id: 'f2', nome: 'Faixa II', limiteCentavos: 20_000_00, aprovadores: 1 },
    ]);
  });

  it('o teto é o maior limite de faixa ativa com aprovador vigente, não o maior limite', () => {
    const escada = escadaDeFaixas(faixas, [{ papel: 'aprovador', faixaId: 'f1', vigente: true }]);
    expect(escada.tetoCentavos).toBe(5_000_00);
  });

  it('aprovador sem faixa não conta em degrau nenhum', () => {
    const escada = escadaDeFaixas(faixas, [{ papel: 'aprovador', faixaId: null, vigente: true }]);
    expect(escada.degraus.every((d) => d.aprovadores === 0)).toBe(true);
    expect(escada.tetoCentavos).toBeNull();
  });

  it('sem faixa nenhuma, a escada vem vazia e sem teto', () => {
    expect(escadaDeFaixas([], [])).toEqual({ degraus: [], tetoCentavos: null });
  });

  it('sem aprovador vigente em faixa ativa, não há teto', () => {
    const escada = escadaDeFaixas(faixas, [{ papel: 'aprovador', faixaId: 'f3', vigente: true }]);
    expect(escada.tetoCentavos).toBeNull();
  });
});

describe('textos do cadastro', () => {
  it('a nota do SINAPI é o mês curto, e a do Anexo V avisa a revisão aberta', () => {
    expect(mesCurto('2026-09')).toBe('set/2026');
    expect(TEXTO_CADASTRO.nota.sinapi(null)).toBe('nenhum mês');
    expect(TEXTO_CADASTRO.nota.anexoV({ revisaoAberta: true, itens: 412 })).toBe('revisão aberta');
    expect(TEXTO_CADASTRO.nota.anexoV({ revisaoAberta: false, itens: 1 })).toBe('1 item');
  });

  it('a lista da primeira cotação nomeia os papéis que faltam', () => {
    expect(TEXTO_CADASTRO.primeira.designacoes.detalhe(['gestor', 'aprovador'])).toBe(
      'falta gestor, aprovador',
    );
    expect(TEXTO_CADASTRO.primeira.semCodigo.detalhe(34)).toBe('34 itens para ligar');
  });

  it('a confirmação de desativar faixa diz quantos aprovadores perdem a faixa', () => {
    expect(TEXTO_CONFIRMACAO_CADASTRO.desativar.efeito(2)).toMatch(
      /^2 aprovadores vigentes deixam de aprovar por ela/,
    );
    expect(TEXTO_CONFIRMACAO_CADASTRO.desativar.efeito(0)).toMatch(/^Nenhum aprovador vigente/);
  });

  it('nenhum texto do cadastro fala em "caminho 1" ou "caminho 2"', () => {
    const tudo = JSON.stringify(TEXTO_CADASTRO);
    expect(tudo).not.toMatch(/caminho [12]/);
  });
});

// Spec 0022: o histórico de cada linha.

describe('dataHoraDoCadastro (spec 0022, AC-6)', () => {
  it('formata no fuso de Belém, com data e hora', () => {
    // 02:30 UTC do dia 5 ainda é dia 4 em Belém (UTC-3).
    expect(dataHoraDoCadastro('2026-05-05T02:30:00.000Z')).toMatch(/^04\/05\/2026,? 23:30$/);
  });
});

describe('linhaDoTempoDoEmpenho (spec 0022, AC-6, AC-7)', () => {
  const mov = (em: string) => ({
    tipo: 'reforco',
    valorCentavos: 100,
    ato: 'SEI 1',
    em,
    porNome: 'Ana',
  });
  const sit = (ativo: boolean, em: string) => ({
    ativo,
    motivo: 'Motivo qualquer',
    porNome: 'Ana',
    em,
  });

  it('junta movimentos e situações do mais novo ao mais antigo', () => {
    const itens = linhaDoTempoDoEmpenho({
      ativo: false,
      movimentos: [mov('2026-01-02T00:00:00Z'), mov('2026-03-01T00:00:00Z')],
      situacoes: [sit(false, '2026-02-01T00:00:00Z')],
    });
    expect(itens.map((i) => (i.tipo === 'antigo' ? 'antigo' : i.em.slice(0, 7)))).toEqual([
      '2026-03',
      '2026-02',
      '2026-01',
    ]);
    expect(itens[0]).toMatchObject({ tipo: 'movimento', tipoMovimento: 'reforco' });
  });

  it('empenho ativo que nunca mudou de situação não ganha item extra', () => {
    expect(linhaDoTempoDoEmpenho({ ativo: true, movimentos: [], situacoes: [] })).toEqual([]);
  });

  it('inativo sem histórico ganha o item antigo no fim', () => {
    const itens = linhaDoTempoDoEmpenho({
      ativo: false,
      movimentos: [mov('2026-01-02T00:00:00Z')],
      situacoes: [],
    });
    expect(itens.at(-1)).toEqual({ tipo: 'antigo' });
  });

  it('primeira mudança gravada sendo uma reativação também ganha o item antigo', () => {
    const itens = linhaDoTempoDoEmpenho({
      ativo: true,
      movimentos: [],
      situacoes: [sit(true, '2026-02-01T00:00:00Z')],
    });
    expect(itens).toHaveLength(2);
    expect(itens.at(-1)).toEqual({ tipo: 'antigo' });
  });

  it('histórico que começa por inativação não ganha item extra', () => {
    const itens = linhaDoTempoDoEmpenho({
      ativo: true,
      movimentos: [],
      situacoes: [sit(false, '2026-02-01T00:00:00Z'), sit(true, '2026-02-02T00:00:00Z')],
    });
    expect(itens.some((i) => i.tipo === 'antigo')).toBe(false);
  });
});
