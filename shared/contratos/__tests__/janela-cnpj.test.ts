import { describe, expect, it } from 'vitest';

import { cnpjValido, formatarCnpj } from '../cnpj';
import { CriarContratoSchema, PedidoPdfContratoSchema } from '../contrato.schemas';
import { formatarDataHoraBelem, formatarPercentual, nomeDoArquivoPdf } from '../formato';
import { janelaDoMes, limitesDoMes, mesesPermitidos } from '../janela';

/** covers: AC-2, AC-5, AC-6, AC-16 (nome do arquivo), AC-20 (corpo do PDF) */

describe('cnpjValido e formatarCnpj', () => {
  it('aceita com e sem máscara quando os dígitos verificadores batem', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11222333000181')).toBe(true);
  });

  it('recusa dígito verificador errado, tamanho errado e sequência repetida', () => {
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(cnpjValido('1122233300018')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
  });

  it('formata 14 dígitos com a máscara', () => {
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('limitesDoMes e janelaDoMes', () => {
  it('acerta o último dia em ano bissexto e fora dele', () => {
    expect(limitesDoMes('2028-02').ultimo).toBe('2028-02-29');
    expect(limitesDoMes('2026-02').ultimo).toBe('2026-02-28');
    expect(limitesDoMes('2026-12').ultimo).toBe('2026-12-31');
  });

  it('corta o mês pela vigência nas duas pontas', () => {
    const j = janelaDoMes('2026-03', '2026-03-15', '2027-03-14');
    expect(j.inicioYmd).toBe('2026-03-15');
    expect(j.fimYmd).toBe('2026-03-31');
    expect(j.dataInicio.toISOString()).toBe('2026-03-15T00:00:00.000Z');

    const fim = janelaDoMes('2027-03', '2026-03-15', '2027-03-14');
    expect(fim.inicioYmd).toBe('2027-03-01');
    expect(fim.fimYmd).toBe('2027-03-14');
  });
});

describe('mesesPermitidos', () => {
  const vigencia = { vigenciaInicio: '2026-08-15', vigenciaFim: '2027-08-14' };

  it('vai do mês atual em Belém até o primeiro mês da vigência, do mais recente', () => {
    expect(mesesPermitidos(vigencia, '2026-10-07')).toEqual(['2026-10', '2026-09', '2026-08']);
  });

  it('para no fim da vigência quando ela já acabou', () => {
    expect(
      mesesPermitidos({ vigenciaInicio: '2025-11-01', vigenciaFim: '2026-01-31' }, '2026-10-07'),
    ).toEqual(['2026-01', '2025-12', '2025-11']);
  });

  it('é vazio quando a vigência ainda não começou', () => {
    expect(mesesPermitidos(vigencia, '2026-07-31')).toEqual([]);
  });
});

describe('CriarContratoSchema', () => {
  const valido = {
    numero: '  12/2025 ',
    empresa: 'Refrigeração Amazônia',
    cnpj: '11.222.333/0001-81',
    processoSei: '0001234-56.2025',
    vigenciaInicio: '2025-03-01',
    vigenciaFim: '2026-02-28',
    tiposServico: ['Ar-Condicionado'],
  };

  it('grava o CNPJ só com dígitos e o número sem espaços', () => {
    const r = CriarContratoSchema.safeParse(valido);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cnpj).toBe('11222333000181');
      expect(r.data.numero).toBe('12/2025');
      expect(r.data.objeto).toBeNull();
    }
  });

  it('recusa início depois do fim, tipo repetido, nenhum tipo e data inexistente', () => {
    expect(CriarContratoSchema.safeParse({ ...valido, vigenciaInicio: '2026-03-01' }).success).toBe(
      false,
    );
    expect(
      CriarContratoSchema.safeParse({
        ...valido,
        tiposServico: ['Elevador', 'Elevador'],
      }).success,
    ).toBe(false);
    expect(CriarContratoSchema.safeParse({ ...valido, tiposServico: [] }).success).toBe(false);
    expect(CriarContratoSchema.safeParse({ ...valido, vigenciaFim: '2026-02-30' }).success).toBe(
      false,
    );
  });

  it.each(['2026-13-01', '2026-00-10', '2026-12-32'])(
    'recusa a data inexistente %s com a mensagem, sem lançar exceção',
    (vigenciaFim) => {
      const r = CriarContratoSchema.safeParse({ ...valido, vigenciaFim });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.message).toBe('Fim da vigência inválido.');
    },
  );
});

describe('PedidoPdfContratoSchema e nomeDoArquivoPdf', () => {
  it('exige ObjectId e mês YYYY-MM', () => {
    expect(
      PedidoPdfContratoSchema.safeParse({ contratoId: 'a'.repeat(24), mes: '2026-10' }).success,
    ).toBe(true);
    expect(PedidoPdfContratoSchema.safeParse({ contratoId: 'x', mes: '2026-10' }).success).toBe(
      false,
    );
    expect(
      PedidoPdfContratoSchema.safeParse({ contratoId: 'a'.repeat(24), mes: '2026-13' }).success,
    ).toBe(false);
  });

  it('troca no número tudo que não é letra, dígito ou hífen', () => {
    expect(nomeDoArquivoPdf('12/2025 Ar', '2026-10')).toBe(
      'relatorio-contrato-12-2025-Ar-2026-10.pdf',
    );
  });
});

describe('formatarDataHoraBelem e formatarPercentual (AC-8, AC-14)', () => {
  it('mostra a hora de Belém (UTC−3) como dd/mm/aaaa hh:mm', () => {
    expect(formatarDataHoraBelem('2026-10-07T15:04:00.000Z')).toBe('07/10/2026 12:04');
  });

  it('vira o dia certo perto da meia noite', () => {
    expect(formatarDataHoraBelem('2026-11-01T01:30:00.000Z')).toBe('31/10/2026 22:30');
  });

  it('percentual sem denominador vira "—", nunca zero', () => {
    expect(formatarPercentual(null)).toBe('—');
    expect(formatarPercentual(0)).toBe('0%');
    expect(formatarPercentual(88.89)).toBe('88,89%');
  });
});
