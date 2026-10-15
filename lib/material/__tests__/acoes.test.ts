import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/ativos/documentos/situacao', () => ({ hojeEmBelem: () => '2026-10-15' }));

import { acoesDisponiveis } from '../leitura';
import type { Papeis } from '../papeis';
import { impedimentosDeEnvio } from '../transicoes';

/**
 * O que cada papel pode fazer em cada situação (spec 0019). A tela esconde
 * o botão a partir daqui; o servidor confere de novo em `transicionar`.
 *
 * covers: AC-1, AC-4, AC-5, AC-7, AC-10, AC-11, AC-12
 */

const EU = String(new Types.ObjectId());

function papeis(...lista: { papel: string; limite?: number }[]): Papeis {
  const designacoes = lista.map((d, i) => ({
    id: String(i),
    papel: d.papel as Papeis['designacoes'][number]['papel'],
    faixaId: d.limite != null ? `f${i}` : null,
    limiteCentavos: d.limite ?? null,
  }));
  const tem = (p: string) => designacoes.some((d) => d.papel === p);
  return {
    userId: EU,
    role: 'Admin',
    designacoes,
    tem,
    ladoTrf1: ['fiscal', 'gestor', 'aprovador'].some(tem),
    leitorAdmin: false,
    contratada: tem('responsavel_tecnico'),
  };
}

const cot = (situacao: string, extra: Record<string, unknown> = {}) => ({
  situacao: situacao as never,
  emTramite: !['executada', 'atestada', 'reprovada', 'cancelada'].includes(situacao),
  montadoPorUserId: null as Types.ObjectId | null,
  valorTotalCentavos: 2000,
  ...extra,
});

describe('acoesDisponiveis', () => {
  it('o técnico edita o diagnóstico só no rascunho e antes de o responsável técnico salvar (AC-1)', () => {
    expect(acoesDisponiveis(cot('rascunho'), papeis(), true).editarDiagnostico).toBe(true);
    expect(
      acoesDisponiveis(cot('rascunho', { montadoPorUserId: new Types.ObjectId() }), papeis(), true)
        .editarDiagnostico,
    ).toBe(false);
    expect(acoesDisponiveis(cot('devolvida'), papeis(), true).editarDiagnostico).toBe(false);
  });

  it('o responsável técnico monta e envia em rascunho e devolvida', () => {
    const rt = papeis({ papel: 'responsavel_tecnico' });
    for (const s of ['rascunho', 'devolvida']) {
      const a = acoesDisponiveis(cot(s), rt, false);
      expect(a.montar && a.enviar).toBe(true);
    }
    expect(acoesDisponiveis(cot('enviada'), rt, false).enviar).toBe(false);
  });

  it('o fiscal assume a enviada e encaminha a em análise (AC-5)', () => {
    const fiscal = papeis({ papel: 'fiscal' });
    expect(acoesDisponiveis(cot('enviada'), fiscal, false).assumir).toBe(true);
    const a = acoesDisponiveis(cot('em_analise'), fiscal, false);
    expect([a.encaminhar, a.devolver, a.reprovar]).toEqual([true, true, true]);
    expect(a.aprovar).toBe(false);
  });

  it('o aprovador aprova só quando a faixa cobre o valor (AC-7)', () => {
    expect(
      acoesDisponiveis(cot('em_aprovacao'), papeis({ papel: 'aprovador', limite: 2000 }), false)
        .aprovar,
    ).toBe(true);
    expect(
      acoesDisponiveis(cot('em_aprovacao'), papeis({ papel: 'aprovador', limite: 1999 }), false)
        .aprovar,
    ).toBe(false);
  });

  it('aprovador com faixa desativada (limite nulo) não aprova (AC-7)', () => {
    expect(
      acoesDisponiveis(cot('em_aprovacao'), papeis({ papel: 'aprovador' }), false).aprovar,
    ).toBe(false);
  });

  it('quem montou a cotação não aprova (AC-7, CA-12)', () => {
    const p = papeis({ papel: 'aprovador', limite: 100000 });
    const montada = cot('em_aprovacao', { montadoPorUserId: new Types.ObjectId(EU) });
    expect(acoesDisponiveis(montada, p, false).aprovar).toBe(false);
  });

  it('o aprovador devolve e reprova na aprovação, não na análise', () => {
    const p = papeis({ papel: 'aprovador', limite: 100000 });
    expect(acoesDisponiveis(cot('em_aprovacao'), p, false).devolver).toBe(true);
    expect(acoesDisponiveis(cot('em_analise'), p, false).devolver).toBe(false);
  });

  it('só o técnico atribuído executa, e só a autorizada (AC-10)', () => {
    expect(acoesDisponiveis(cot('autorizada'), papeis(), true).executar).toBe(true);
    expect(acoesDisponiveis(cot('autorizada'), papeis(), false).executar).toBe(false);
    expect(acoesDisponiveis(cot('em_aprovacao'), papeis(), true).executar).toBe(false);
  });

  it('o responsável técnico pede alteração da autorizada (AC-11)', () => {
    expect(
      acoesDisponiveis(cot('autorizada'), papeis({ papel: 'responsavel_tecnico' }), false).alterar,
    ).toBe(true);
  });

  it('cancelar: responsável técnico ou gestor, só em trâmite (AC-12)', () => {
    expect(acoesDisponiveis(cot('autorizada'), papeis({ papel: 'gestor' }), false).cancelar).toBe(
      true,
    );
    expect(acoesDisponiveis(cot('executada'), papeis({ papel: 'gestor' }), false).cancelar).toBe(
      false,
    );
    expect(acoesDisponiveis(cot('enviada'), papeis({ papel: 'fiscal' }), false).cancelar).toBe(
      false,
    );
  });

  it('o Admin sem designação não tem ação nenhuma', () => {
    const leitor = { ...papeis(), leitorAdmin: true };
    const a = acoesDisponiveis(cot('em_aprovacao'), leitor, false);
    expect(Object.values(a).every((v) => v === false)).toBe(true);
  });
});

describe('impedimentosDeEnvio (AC-4)', () => {
  const i1 = new Types.ObjectId();
  const i2 = new Types.ObjectId();
  const orc = (...itens: Types.ObjectId[]) => ({ precos: itens.map((itemId) => ({ itemId })) });

  it('passa quando cada item tem preço em 3 orçamentos', () => {
    expect(
      impedimentosDeEnvio({ itens: [{ _id: i1 }], orcamentos: [orc(i1), orc(i1), orc(i1)] }),
    ).toEqual([]);
  });

  it('um orçamento pode cobrir só parte dos itens', () => {
    expect(
      impedimentosDeEnvio({
        itens: [{ _id: i1 }, { _id: i2 }],
        orcamentos: [orc(i1, i2), orc(i1, i2), orc(i1), orc(i2)],
      }),
    ).toEqual([]);
  });

  it('item com 2 orçamentos impede o envio', () => {
    expect(
      impedimentosDeEnvio({
        itens: [{ _id: i1 }, { _id: i2 }],
        orcamentos: [orc(i1, i2), orc(i1, i2), orc(i1)],
      }),
    ).toEqual(['orcamentos_insuficientes']);
  });

  it('sem orçamento nenhum, impede', () => {
    expect(impedimentosDeEnvio({ itens: [{ _id: i1 }], orcamentos: [] })).toEqual([
      'orcamentos_insuficientes',
    ]);
  });
});
