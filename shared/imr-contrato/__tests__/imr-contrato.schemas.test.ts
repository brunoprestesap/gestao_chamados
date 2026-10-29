import { describe, expect, it } from 'vitest';

import {
  BuscarChamadoDaBaseSchema,
  FecharMesImrSchema,
  MarcarImrSchema,
  PedidoPdfImrSchema,
  ReabrirMesImrSchema,
} from '../imr-contrato.schemas';

/**
 * As entradas das ações do IMR do contrato (spec 0023). As mensagens mais
 * comuns já passam pelos testes das ações; aqui ficam as regras do próprio
 * schema: campo a mais recusado, mês e identificador válidos, limites de
 * pontos e o que a transformação entrega.
 *
 * covers: AC-7, AC-8, AC-10, AC-11, AC-13
 */

const CONTRATO = '6ae0d1d5f82121a51e93a17e';
const ALVO = '6ae0d4597f5ae1983207eb7f';

const marcacao = {
  contratoId: CONTRATO,
  competencia: '2026-10',
  indicador: 3,
  alvoTipo: 'chamado',
  alvoId: ALVO,
  tipo: 'desconsiderar',
  motivo: 'Chamado aberto em duplicidade',
};

const fechamento = {
  contratoId: CONTRATO,
  competencia: '2026-09',
  i1Pontos: 40,
  i2Pontos: 20,
  pontosVistos: { i3: 15, i4: 20 },
};

const primeiraMensagem = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues[0]?.message;

describe('MarcarImrSchema', () => {
  it('aceita a marcação do indicador 4 numa cotação', () => {
    const r = MarcarImrSchema.safeParse({
      ...marcacao,
      indicador: 4,
      alvoTipo: 'cotacao',
      tipo: 'nao_atendimento',
    });

    expect(r.success).toBe(true);
  });

  it('tira os espaços das pontas do motivo', () => {
    const r = MarcarImrSchema.safeParse({
      ...marcacao,
      motivo: '   Chamado aberto em duplicidade   ',
    });

    expect(r.success && r.data.motivo).toBe('Chamado aberto em duplicidade');
  });

  it('não conta os espaços para o mínimo de 10 caracteres', () => {
    const r = MarcarImrSchema.safeParse({ ...marcacao, motivo: '   curto    ' });

    expect(primeiraMensagem(r)).toBe('Escreva o motivo (ao menos 10 caracteres).');
  });

  it('aceita o motivo com 500 caracteres e recusa com 501', () => {
    expect(MarcarImrSchema.safeParse({ ...marcacao, motivo: 'a'.repeat(500) }).success).toBe(true);
    expect(
      primeiraMensagem(MarcarImrSchema.safeParse({ ...marcacao, motivo: 'a'.repeat(501) })),
    ).toBe('O motivo tem no máximo 500 caracteres.');
  });

  it('recusa o indicador 4 apontando para um chamado', () => {
    const r = MarcarImrSchema.safeParse({ ...marcacao, indicador: 4 });

    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['alvoTipo']);
  });

  it('recusa indicador fora do 3 e do 4', () => {
    expect(MarcarImrSchema.safeParse({ ...marcacao, indicador: 1 }).success).toBe(false);
  });

  it('recusa tipo de marcação desconhecido', () => {
    expect(MarcarImrSchema.safeParse({ ...marcacao, tipo: 'apagar' }).success).toBe(false);
  });

  it('recusa campo a mais, como um papel vindo do navegador', () => {
    expect(MarcarImrSchema.safeParse({ ...marcacao, papel: 'fiscal' }).success).toBe(false);
  });

  it.each(['2026-13', '2026-00', '2026-1', '26-10', '2026/10'])(
    'recusa o mês %s',
    (competencia) => {
      expect(primeiraMensagem(MarcarImrSchema.safeParse({ ...marcacao, competencia }))).toBe(
        'Mês inválido.',
      );
    },
  );

  it('recusa identificador que não é um ObjectId', () => {
    expect(primeiraMensagem(MarcarImrSchema.safeParse({ ...marcacao, alvoId: 'abc' }))).toBe(
      'Identificador inválido.',
    );
  });
});

describe('BuscarChamadoDaBaseSchema', () => {
  it('tira o # e os espaços do número', () => {
    const r = BuscarChamadoDaBaseSchema.safeParse({
      contratoId: CONTRATO,
      competencia: '2026-10',
      numero: '  # 00123 ',
    });

    expect(r.success && r.data.numero).toBe('00123');
  });

  it('recusa número com mais de 30 caracteres', () => {
    const r = BuscarChamadoDaBaseSchema.safeParse({
      contratoId: CONTRATO,
      competencia: '2026-10',
      numero: '1'.repeat(31),
    });

    expect(r.success).toBe(false);
  });
});

describe('FecharMesImrSchema', () => {
  it('aceita os limites de pontos (0 e o máximo de cada indicador)', () => {
    expect(FecharMesImrSchema.safeParse({ ...fechamento, i1Pontos: 0, i2Pontos: 0 }).success).toBe(
      true,
    );
    expect(FecharMesImrSchema.safeParse(fechamento).success).toBe(true);
  });

  it('recusa pontos fracionados', () => {
    expect(primeiraMensagem(FecharMesImrSchema.safeParse({ ...fechamento, i1Pontos: 39.5 }))).toBe(
      'Os pontos do indicador 1 são um número inteiro.',
    );
  });

  it('recusa pontos negativos', () => {
    expect(primeiraMensagem(FecharMesImrSchema.safeParse({ ...fechamento, i2Pontos: -1 }))).toBe(
      'Os pontos do indicador 2 vão de 0 a 20.',
    );
  });

  it('pede os pontos quando vêm como texto', () => {
    expect(primeiraMensagem(FecharMesImrSchema.safeParse({ ...fechamento, i1Pontos: '40' }))).toBe(
      'Informe os pontos do indicador 1.',
    );
  });

  it('a observação ausente ou só com espaços vira null', () => {
    const r = FecharMesImrSchema.safeParse({ ...fechamento, i2Observacao: '   ' });

    expect(r.success && [r.data.i1Observacao, r.data.i2Observacao]).toEqual([null, null]);
  });

  it('recusa observação com mais de 500 caracteres', () => {
    expect(
      primeiraMensagem(
        FecharMesImrSchema.safeParse({ ...fechamento, i1Observacao: 'a'.repeat(501) }),
      ),
    ).toBe('A observação tem no máximo 500 caracteres.');
  });

  it('recusa os pontos dos indicadores 3 e 4 enviados fora da conferência', () => {
    expect(FecharMesImrSchema.safeParse({ ...fechamento, i3Pontos: 20 }).success).toBe(false);
  });

  it('pede os pontos vistos dos indicadores 3 e 4', () => {
    const semVistos = { ...fechamento, pontosVistos: undefined };

    expect(FecharMesImrSchema.safeParse(semVistos).success).toBe(false);
  });

  it('recusa ponto visto fora da escala do indicador', () => {
    expect(
      primeiraMensagem(
        FecharMesImrSchema.safeParse({ ...fechamento, pontosVistos: { i3: 25, i4: 20 } }),
      ),
    ).toBe('Os pontos do indicador 3 vão de 0 a 20.');
  });
});

describe('ReabrirMesImrSchema', () => {
  it('pede motivo para reabrir', () => {
    const r = ReabrirMesImrSchema.safeParse({ contratoId: CONTRATO, competencia: '2026-09' });

    expect(r.success).toBe(false);
  });
});

describe('PedidoPdfImrSchema', () => {
  it('aceita só contrato e mês', () => {
    expect(
      PedidoPdfImrSchema.safeParse({ contratoId: CONTRATO, competencia: '2026-09' }).success,
    ).toBe(true);
  });

  it('recusa escolher a versão do fechamento pelo corpo', () => {
    expect(
      PedidoPdfImrSchema.safeParse({ contratoId: CONTRATO, competencia: '2026-09', versao: 1 })
        .success,
    ).toBe(false);
  });
});
