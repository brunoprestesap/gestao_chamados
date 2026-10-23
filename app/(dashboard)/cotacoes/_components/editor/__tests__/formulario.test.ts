import { describe, expect, it } from 'vitest';

import { impedimentosDeEnvio } from '@/lib/material/controles';
import { EnviarSchema, SalvarRascunhoSchema } from '@/shared/material/cotacao.schemas';
import { TEXTO_EDITOR } from '@/shared/material/mensagens';

import {
  type EstadoDoFormulario,
  itemNovo,
  linhaPassa,
  linhasDaLista,
  montarEntrada,
  orcamentoNovo,
  prontaParaEnviar,
  totalPeloMenorPreco,
} from '../formulario';

/**
 * A lista "Pronta para enviar?" do editor da contratada (spec 0021, AC-15)
 * dá o mesmo resultado que o envio no servidor para o mesmo formulário. O
 * lado do servidor aqui é o caminho do salvar e do enviar: o schema do
 * `salvarRascunhoAction` sobre a saída do adaptador, as datas como o
 * `transicoes.ts` grava, e `impedimentosDeEnvio` importado de `lib/material`.
 *
 * covers: AC-15
 */

const COTACAO = 'c'.repeat(24);
const RAIZ_CONTRATADA = '03543374';
const id = (n: number) => n.toString(16).padStart(24, '0');

/** Um CNPJ válido com a raiz dada (8 dígitos), com máscara. */
function cnpj(raiz: string, filial = '0001'): string {
  const base = `${raiz}${filial}`.split('').map(Number);
  const dv = (nums: number[]) => {
    const pesos =
      nums.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = nums.reduce((s, d, i) => s + d * pesos[i]!, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  const d = `${raiz}${filial}${d1}${d2}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function orcamento(
  n: number,
  raiz: string,
  precos: Record<string, string>,
  validade = '2099-12-31',
) {
  return {
    ...orcamentoNovo(id(100 + n)),
    fornecedor: `Loja ${n}`,
    cnpj: cnpj(raiz),
    data: '2026-10-10',
    validade,
    arquivoId: id(200 + n),
    arquivoNome: `orc-${n}.pdf`,
    precos,
  };
}

function estadoBase(): EstadoDoFormulario {
  const disjuntor = {
    ...itemNovo(id(1)),
    descricao: 'Disjuntor bipolar 40 A',
    quantidade: '2,5',
    motivo: 'Trocar o disjuntor queimado',
    referencias: [
      {
        entrada: {
          id: id(50),
          fonte: 'Painel de preços',
          valorUnitarioCentavos: 10000,
          data: '2026-10-01',
        },
        gravada: null,
      },
    ],
  };
  const lampada = {
    ...itemNovo(id(2)),
    descricao: 'Lâmpada',
    quantidade: '4',
    motivo: 'Troca',
    origem: 'anexo_v',
    anexoVNumero: 3,
    precoTabelaCentavos: 2500,
  };
  return {
    itens: [disjuntor, lampada],
    orcamentos: [
      orcamento(1, '11222333', { [id(1)]: '12,00', [id(2)]: '1,00' }),
      orcamento(2, '22333444', { [id(1)]: '1.010,50' }),
      orcamento(3, '33444555', { [id(1)]: '11,00' }),
    ],
  };
}

/** O que o servidor diria do mesmo formulário: schema do salvar, gravação e o controle do envio. */
function doServidor(e: EstadoDoFormulario, urgencia = false) {
  const p = SalvarRascunhoSchema.safeParse(montarEntrada(e, COTACAO, 1));
  if (!p.success) return { ok: false as const, erro: p.error.issues[0]!.message };
  return {
    ok: true as const,
    impedimentos: impedimentosDeEnvio({
      itens: p.data.itens.map((i) => ({
        _id: i.id,
        origem: e.itens.find((f) => f.id === i.id)!.origem,
        referencias: (i.referencias ?? []).map(() => ({ valorUnitarioCentavos: 1 })),
      })),
      orcamentos: (p.data.orcamentos ?? []).map((o) => ({
        _id: o.id,
        cnpj: o.cnpj,
        validade: o.validade ? new Date(`${o.validade}T12:00:00.000Z`) : null,
        fase: 'envio',
        precos: o.precos,
      })),
      raizContratada: RAIZ_CONTRATADA,
      urgencia,
    }),
  };
}

const naTela = (e: EstadoDoFormulario, urgencia = false) =>
  prontaParaEnviar(e, { cotacaoId: COTACAO, raizContratada: RAIZ_CONTRATADA, urgencia });

describe('paridade da lista com o envio', () => {
  it('formulário completo, com vírgula decimal, milhar e CNPJ com máscara: nada impede', () => {
    const e = estadoBase();
    expect(naTela(e)).toEqual({ ok: true, impedimentos: [] });
    expect(naTela(e)).toEqual(doServidor(e));
  });

  it('célula vazia não conta como orçamento do item', () => {
    const e = estadoBase();
    e.orcamentos[2]!.precos = { [id(1)]: '   ' };
    expect(naTela(e)).toEqual({ ok: true, impedimentos: ['orcamentos_insuficientes'] });
    expect(naTela(e)).toEqual(doServidor(e));
  });

  it('o preço do item de tabela não entra como orçamento', () => {
    const e = estadoBase();
    // A Lâmpada é do Anexo V: o preço que o orçamento 1 deu a ela sai da entrada.
    const entrada = montarEntrada(e, COTACAO, 1);
    expect(entrada.orcamentos[0]!.precos.map((p) => p.itemId)).toEqual([id(1)]);
  });

  it('mesma raiz de CNPJ, CNPJ da contratada e validade vazia', () => {
    const e = estadoBase();
    e.orcamentos[1]!.cnpj = cnpj('11222333', '0002');
    e.orcamentos[2]!.cnpj = cnpj(RAIZ_CONTRATADA);
    e.orcamentos[0]!.validade = '';
    const r = naTela(e);
    expect(r.ok && [...r.impedimentos].sort()).toEqual(
      ['cnpj_contratada', 'cnpj_mesma_raiz', 'validade_ausente'].sort(),
    );
    expect(r).toEqual(doServidor(e));
  });

  it('sem referência no item do caminho 3', () => {
    const e = estadoBase();
    e.itens[0]!.referencias = [];
    expect(naTela(e)).toEqual({ ok: true, impedimentos: ['sem_referencia'] });
    expect(naTela(e)).toEqual(doServidor(e));
  });

  it('a referência do fiscal ativa conta; a retirada não', () => {
    const e = estadoBase();
    e.itens[0]!.referencias = [];
    const doFiscal = {
      id: id(60),
      tipo: 'livre' as const,
      fonte: 'Contrato de outro órgão',
      sinapiCodigo: null,
      sinapiReferencia: null,
      unidade: null,
      valorUnitarioCentavos: 900,
      data: '2026-10-02',
      papel: 'fiscal' as const,
      autorNome: null,
      minha: false,
      retirada: false,
    };
    e.itens[0]!.referenciasFiscal = [doFiscal];
    expect(naTela(e)).toEqual({ ok: true, impedimentos: [] });
    e.itens[0]!.referenciasFiscal = [{ ...doFiscal, retirada: true }];
    expect(naTela(e)).toEqual({ ok: true, impedimentos: ['sem_referencia'] });
  });

  it('na urgência basta 1 orçamento por item e as raízes ficam para depois', () => {
    const e = estadoBase();
    e.orcamentos = [e.orcamentos[0]!];
    expect(naTela(e, true)).toEqual({ ok: true, impedimentos: [] });
    expect(naTela(e, true)).toEqual(doServidor(e, true));
    expect(naTela(e, false)).toEqual(doServidor(e, false));
  });

  it('campo vazio barra pelo mesmo texto do salvar', () => {
    const e = estadoBase();
    e.orcamentos[1]!.fornecedor = '';
    const r = naTela(e);
    expect(r).toEqual({ ok: false, erro: 'Informe o fornecedor.' });
    expect(r).toEqual(doServidor(e));
  });

  it('CNPJ incompleto e preço inválido barram pelo schema', () => {
    const e = estadoBase();
    e.orcamentos[1]!.cnpj = '22.333';
    expect(naTela(e)).toEqual(doServidor(e));
    const f = estadoBase();
    f.orcamentos[1]!.precos = { [id(1)]: 'dez reais' };
    expect(naTela(f).ok).toBe(false);
    expect(naTela(f)).toEqual(doServidor(f));
  });

  it('orçamento sem arquivo barra antes do schema, como o editor', () => {
    const e = estadoBase();
    e.orcamentos[0]!.arquivoId = '';
    expect(naTela(e)).toEqual({ ok: false, erro: TEXTO_EDITOR.arquivoAntesDeSalvar });
  });
});

describe('linhas da lista e total', () => {
  it('cada linha junta os códigos que confere', () => {
    const e = estadoBase();
    e.orcamentos[0]!.validade = '';
    const linhas = linhasDaLista(e, naTela(e), false);
    expect(linhas.map((l) => l.chave)).toEqual([
      'formulario',
      'cnpj',
      'validade',
      'orcamentos',
      'raizes',
      'referencia',
    ]);
    expect(linhas.find((l) => l.chave === 'validade')!.codigos).toEqual(['validade_ausente']);
  });

  it('urgência pedida agora: a justificativa passa pelo schema do envio', () => {
    const e = estadoBase();
    const linha = (justificativa: string) =>
      linhasDaLista(e, naTela(e, true), true, { cotacaoId: COTACAO, justificativa }).find(
        (l) => l.chave === 'urgencia',
      )!;
    for (const curta of ['', '   curta   ']) {
      const l = linha(curta);
      const servidor = EnviarSchema.safeParse({
        id: COTACAO,
        versao: 1,
        urgencia: { justificativa: curta },
      });
      expect(servidor.success).toBe(false);
      expect(l.erro).toBe(servidor.error!.issues[0]!.message);
      expect(linhaPassa(l, naTela(e, true))).toBe(false);
    }
    const ok = linha('Elevador parado com gente dependendo dele');
    expect(ok.erro).toBeUndefined();
    expect(linhaPassa(ok, naTela(e, true))).toBe(true);
    // Sem pedido agora (não pediu, ou já pedida), não há linha da justificativa.
    expect(linhasDaLista(e, naTela(e), false).some((l) => l.chave === 'urgencia')).toBe(false);
  });

  it('só com itens de tabela, sem linhas de orçamento', () => {
    const e = estadoBase();
    e.itens = [e.itens[1]!];
    e.orcamentos = [];
    const linhas = linhasDaLista(e, naTela(e), false);
    expect(linhas.map((l) => l.chave)).toEqual(['formulario', 'tabela']);
  });

  it('total pelo menor preço de cada item, em centavos', () => {
    const e = estadoBase();
    // Disjuntor: menor 11,00 × 2,5 = 27,50; Lâmpada: 25,00 × 4 = 100,00.
    expect(totalPeloMenorPreco(e)).toEqual({ totalCentavos: 12750, semPreco: 0 });
    e.orcamentos = [];
    expect(totalPeloMenorPreco(e)).toEqual({ totalCentavos: 10000, semPreco: 1 });
  });
});
