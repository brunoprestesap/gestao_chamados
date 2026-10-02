import { describe, expect, it } from 'vitest';

import { decodificarCp1252, parseSicam } from '../parse';
import { bytesCp1252, CABECALHO_SICAM, csvSicam, linhaSicam } from './sicam-fixture';

/** Parse do export bruto (spec 0012, AC-17 e AC-18), com dados fictícios. */

function ler(texto: string) {
  const r = parseSicam(decodificarCp1252(bytesCp1252(texto)));
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('parseSicam: cabeçalho', () => {
  it('recusa o arquivo sem uma coluna usada, dizendo qual', () => {
    const cabecalho = CABECALHO_SICAM.filter((c) => c !== 'Nome Setor');
    const r = parseSicam(csvSicam([linhaSicam({}, cabecalho)], cabecalho));
    expect(r).toEqual({
      ok: false,
      error: 'O arquivo não parece um export do SICAM: falta a coluna Nome Setor',
    });
  });

  it('confere pelo nome: colunas em outra ordem funcionam', () => {
    const cabecalho = [...CABECALHO_SICAM].reverse();
    const r = parseSicam(
      csvSicam(
        [linhaSicam({ 'Número Tombo': '777', 'Nome Setor': 'SETOR Y' }, cabecalho)],
        cabecalho,
      ),
    );
    expect(r.ok && r.linhas[0]).toMatchObject({
      codigo: '777',
      camposPatrimoniais: { setor: 'SETOR Y' },
    });
  });

  it('decodifica cp1252 de verdade: acento não vira "Ã§"', () => {
    const r = ler(csvSicam([linhaSicam({ 'Descrição Lotação': 'SEÇÃO DE MANUTENÇÃO' })]));
    expect(r.linhas[0].camposPatrimoniais.lotacao).toBe('SEÇÃO DE MANUTENÇÃO');
    expect(r.linhas[0].camposPatrimoniais.lotacao).not.toContain('Ã‡');
  });
});

describe('parseSicam: reparo de linhas', () => {
  it('linha com ";" na descrição não desalinha as colunas da direita', () => {
    const quebrada = linhaSicam({
      'Número Tombo': '200',
      'Descrição Material': 'LIVRO; VOLUME 2; EDIÇÃO ESPECIAL',
      'Nome Setor': 'SETOR Z',
    });
    const r = ler(csvSicam([quebrada]));
    expect(r.linhasReparadas).toBe(1);
    expect(r.linhas[0]).toMatchObject({
      codigo: '200',
      descricao: 'LIVRO; VOLUME 2; EDIÇÃO ESPECIAL',
      camposPatrimoniais: { setor: 'SETOR Z' },
    });
  });

  it('linha curta é completada com vazios à direita e conta como reparada', () => {
    const curta = linhaSicam({ 'Número Tombo': '300' }).split(';').slice(0, 30).join(';');
    const r = ler(csvSicam([curta]));
    expect(r.linhasLidas).toBe(1);
    expect(r.linhasReparadas).toBe(1);
  });
});

describe('parseSicam: filtro e duplicados', () => {
  it('aceita só Tipo Tombo T e Saída PRESENTE, sem caixa e sem espaços nas pontas', () => {
    const r = ler(
      csvSicam([
        linhaSicam({ 'Número Tombo': '1', 'Tipo Tombo': ' t ', Saída: ' presente ' }),
        linhaSicam({ 'Número Tombo': '2', 'Tipo Tombo': 'N' }),
        linhaSicam({ 'Número Tombo': '3', Saída: 'BAIXADO' }),
      ]),
    );
    expect(r.linhasLidas).toBe(3);
    expect(r.linhasAceitas).toBe(1);
    expect(r.linhas.map((l) => l.codigo)).toEqual(['1']);
  });

  it('tombo repetido vale a primeira linha e só conta entre as aceitas', () => {
    const r = ler(
      csvSicam([
        linhaSicam({ 'Número Tombo': '0050', 'Nome Setor': 'PRIMEIRO' }),
        linhaSicam({ 'Número Tombo': '50', 'Nome Setor': 'SEGUNDO' }),
        linhaSicam({ 'Número Tombo': '50', 'Tipo Tombo': 'N' }),
      ]),
    );
    expect(r.linhasDuplicadas).toBe(1);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].camposPatrimoniais.setor).toBe('PRIMEIRO');
    expect(r.codigosAceitos).toEqual(new Set(['50']));
  });
});

describe('parseSicam: valores', () => {
  it('datas DD-MMM-AA em português ou inglês, corte de século em 40, ao meio dia UTC', () => {
    const r = ler(
      csvSicam([
        linhaSicam({
          'Data Tombo': '10-JUN-94',
          'Dt Ini Garantia': '16-jan-26',
          'Dt Fim Garantia': '16-FEB-26',
        }),
      ]),
    );
    const c = r.linhas[0].camposPatrimoniais;
    expect(c.dataTombo?.toISOString()).toBe('1994-06-10T12:00:00.000Z');
    expect(c.garantiaInicio?.toISOString()).toBe('2026-01-16T12:00:00.000Z');
    expect(c.garantiaFim?.toISOString()).toBe('2026-02-16T12:00:00.000Z');
  });

  it('número com vírgula usa ponto de milhar', () => {
    const r = ler(csvSicam([linhaSicam({ 'Valor Histórico': '1.234,56' })]));
    expect(r.linhas[0].camposPatrimoniais.valorHistorico).toBe(1234.56);
  });

  it('data ou número ilegível vira ausente e conta, sem derrubar a importação', () => {
    const r = ler(
      csvSicam([
        linhaSicam({
          'Data Tombo': '31-FEV-20',
          'Valor Histórico': 'abc',
          'Dt Fim Garantia': 'ontem',
        }),
      ]),
    );
    expect(r.valoresIlegiveis).toBe(3);
    const c = r.linhas[0].camposPatrimoniais;
    expect(c.dataTombo).toBeUndefined();
    expect(c.valorHistorico).toBeUndefined();
    expect(c.garantiaFim).toBeUndefined();
  });

  it('campo vazio vira ausente; descrição perde espaços repetidos; código normalizado', () => {
    const r = ler(
      csvSicam([
        linhaSicam({
          'Número Tombo': ' 0011997 ',
          'Descrição Material': '  SPLIT   12000  BTUS ',
          'Numero de série': '',
          'Nome Setor': '   ',
        }),
      ]),
    );
    expect(r.linhas[0]).toEqual(
      expect.objectContaining({ codigo: '11997', descricao: 'SPLIT 12000 BTUS' }),
    );
    expect(r.linhas[0].numeroSerie).toBeUndefined();
    expect(r.linhas[0].camposPatrimoniais).not.toHaveProperty('setor');
    expect(r.linhas[0].camposPatrimoniais).not.toHaveProperty('numeroSerie');
  });
});
