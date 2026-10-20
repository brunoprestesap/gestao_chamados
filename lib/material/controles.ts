import 'server-only';

import { cnpjValido } from '@/shared/contratos/cnpj';
import {
  MIN_ORCAMENTOS_POR_ITEM,
  MIN_ORCAMENTOS_URGENCIA,
  MIN_RAIZES_POR_ITEM,
} from '@/shared/material/material.constants';
import { type CodigoControle, CODIGOS_ADVERTENCIA_RECALCULADA } from '@/shared/material/mensagens';
import {
  acimaDoPercentual,
  menorReferencia,
  raizCnpj,
  raizesDoItem,
} from '@/shared/material/valores';

/**
 * Os controles da cotação de material (spec 0019, _Controles_), puros: quem
 * chama lê o banco e passa o que precisa. O texto de cada código está em
 * `shared/material/mensagens.ts`, e quem vê cada um, em `CONTROLES`.
 */

export type AdvertenciaDeItem = { codigo: CodigoControle; itemId: string };

type ItemParaControle = {
  _id: unknown;
  origem: string | null;
  anexoVPrecoCentavos?: number | null;
  sinapiPrecoCentavos?: number | null;
};

/**
 * As advertências de preço da fatia 3 (AC-28), sobre as cópias do item:
 * Anexo V acima do SINAPI além do percentual, e item só do Anexo V, sem
 * referência SINAPI no mês mais recente (o envio já tirou o código que saiu
 * do mês, então `anexo_v` quer dizer exatamente isso).
 */
export function advertenciasDePreco(
  itens: readonly ItemParaControle[],
  percentualSinapi: number,
): AdvertenciaDeItem[] {
  const out: AdvertenciaDeItem[] = [];
  for (const i of itens) {
    const itemId = String(i._id);
    if (i.origem === 'anexo_v') out.push({ codigo: 'sem_referencia_sinapi', itemId });
    if (
      i.anexoVPrecoCentavos != null &&
      i.sinapiPrecoCentavos != null &&
      acimaDoPercentual(i.anexoVPrecoCentavos, i.sinapiPrecoCentavos, percentualSinapi)
    ) {
      out.push({ codigo: 'anexo_v_acima_sinapi', itemId });
    }
  }
  return out;
}

/** Uma advertência gravada que não é recalculada sobrevive ao recálculo do ato. */
export function ehAdvertenciaRecalculada(codigo: string): boolean {
  return CODIGOS_ADVERTENCIA_RECALCULADA.includes(codigo as CodigoControle);
}

type ReferenciaParaControle = {
  valorUnitarioCentavos: number;
  retiradaEm?: Date | string | null;
};

type ItemDoCaminho3 = {
  _id: unknown;
  origem?: string | null;
  precoAplicadoCentavos?: number | null;
  referencias?: readonly ReferenciaParaControle[] | null;
};

type OrcamentoParaControle = {
  _id?: unknown;
  cnpj: string;
  validade?: Date | null;
  fase?: string | null;
  precos: readonly { itemId: unknown; valorUnitarioCentavos?: number }[];
};

/** Os caminhos 1 e 2 não pedem orçamento nem referência (CA-01, CA-02). */
export function doCaminho3(i: { origem?: string | null }): boolean {
  return !i.origem || i.origem === 'orcamento';
}

/** `fase` ausente lê como `envio` (orçamento gravado antes da fatia 4). */
export function daFaseEnvio(o: { fase?: string | null }): boolean {
  return (o.fase ?? 'envio') === 'envio';
}

function comPrecosEmTexto(orcamentos: readonly OrcamentoParaControle[]) {
  return orcamentos.map((o) => ({
    cnpj: o.cnpj,
    precos: o.precos.map((p) => ({ itemId: String(p.itemId) })),
  }));
}

/**
 * O defeito de CNPJ do próprio orçamento (AC-31): dígito verificador
 * inválido, ou a raiz da contratada. `null` quando passa.
 */
export function defeitoDoCnpj(
  cnpj: string,
  raizContratada: string,
): 'cnpj_invalido' | 'cnpj_contratada' | null {
  if (!cnpjValido(cnpj)) return 'cnpj_invalido';
  if (raizCnpj(cnpj) === raizContratada) return 'cnpj_contratada';
  return null;
}

/**
 * Impedimentos do envio (AC-4, AC-31, AC-32, AC-34, AC-35), sobre os
 * orçamentos `envio`: CNPJ de cada orçamento, validade obrigatória e, por
 * item do caminho 3, a quantidade de orçamentos, as 3 raízes distintas e ao
 * menos uma referência ativa. Na urgência, basta 1 orçamento por item e as
 * 3 raízes ficam para a pesquisa depois da autorização.
 */
export function impedimentosDeEnvio(c: {
  itens: readonly ItemDoCaminho3[];
  orcamentos: readonly OrcamentoParaControle[];
  raizContratada: string;
  urgencia?: boolean;
}): CodigoControle[] {
  const out = new Set<CodigoControle>();
  const envio = c.orcamentos.filter(daFaseEnvio);
  for (const o of envio) {
    const defeito = defeitoDoCnpj(o.cnpj, c.raizContratada);
    if (defeito) out.add(defeito);
    if (!o.validade) out.add('validade_ausente');
  }
  const paraRaiz = comPrecosEmTexto(envio);
  const minimo = c.urgencia ? MIN_ORCAMENTOS_URGENCIA : MIN_ORCAMENTOS_POR_ITEM;
  for (const i of c.itens) {
    if (!doCaminho3(i)) continue;
    const id = String(i._id);
    const n = paraRaiz.filter((o) => o.precos.some((p) => p.itemId === id)).length;
    if (n < minimo) out.add('orcamentos_insuficientes');
    else if (!c.urgencia && raizesDoItem(id, paraRaiz) < MIN_RAIZES_POR_ITEM) {
      out.add('cnpj_mesma_raiz');
    }
    if (menorReferencia(i.referencias ?? []) == null) out.add('sem_referencia');
  }
  return [...out];
}

/**
 * A pesquisa está completa (AC-35): todo item do caminho 3 com 3 raízes de
 * CNPJ distintas entre todos os orçamentos, do envio e do complemento.
 */
export function pesquisaCompleta(
  itens: readonly { _id: unknown; origem?: string | null }[],
  orcamentos: readonly OrcamentoParaControle[],
): boolean {
  const paraRaiz = comPrecosEmTexto(orcamentos);
  return itens
    .filter(doCaminho3)
    .every((i) => raizesDoItem(String(i._id), paraRaiz) >= MIN_RAIZES_POR_ITEM);
}

/**
 * Itens cujo menor orçamento passa da menor referência ativa além do
 * percentual (RN-27, AC-33). Só o caminho 3; item sem referência (cotação
 * enviada antes da fatia 4) não é barrado.
 */
export function itensComVariacaoAcima(
  itens: readonly ItemDoCaminho3[],
  percentual: number,
): string[] {
  return itens
    .filter((i) => i.origem === 'orcamento' && i.precoAplicadoCentavos != null)
    .filter((i) => {
      const ref = menorReferencia(i.referencias ?? []);
      return ref != null && acimaDoPercentual(i.precoAplicadoCentavos!, ref, percentual);
    })
    .map((i) => String(i._id));
}

/**
 * Orçamentos vencidos no dia do encaminhar (AC-34): do `envio`, com preço
 * para algum item do caminho 3, e validade nula ou anterior a `hoje`
 * (`YYYY-MM-DD` em Belém; vencer hoje ainda vale).
 */
export function orcamentosVencidos(
  itens: readonly { _id: unknown; origem?: string | null }[],
  orcamentos: readonly OrcamentoParaControle[],
  hoje: string,
): string[] {
  const doCaminho = new Set(
    itens.filter((i) => i.origem === 'orcamento').map((i) => String(i._id)),
  );
  return orcamentos
    .filter(daFaseEnvio)
    .filter((o) => o.precos.some((p) => doCaminho.has(String(p.itemId))))
    .filter((o) => !o.validade || o.validade.toISOString().slice(0, 10) < hoje)
    .map((o) => String(o._id));
}

/**
 * Itens em que um orçamento do complemento ficou abaixo do preço aplicado
 * (AC-35, `pesquisa_posterior_divergente`). Os do envio nunca ficam: o preço
 * aplicado já é o menor deles.
 */
export function itensComPesquisaDivergente(
  itens: readonly ItemDoCaminho3[],
  orcamentos: readonly OrcamentoParaControle[],
): string[] {
  const complemento = orcamentos.filter((o) => !daFaseEnvio(o));
  return itens
    .filter((i) => i.origem === 'orcamento' && i.precoAplicadoCentavos != null)
    .filter((i) =>
      complemento.some((o) =>
        o.precos.some(
          (p) =>
            String(p.itemId) === String(i._id) &&
            p.valorUnitarioCentavos != null &&
            p.valorUnitarioCentavos < i.precoAplicadoCentavos!,
        ),
      ),
    )
    .map((i) => String(i._id));
}

/**
 * Impedimentos do encaminhar que vêm dos itens (AC-27, AC-29): todo item
 * `ambas` com base escolhida, e todo item da lista de conferência
 * obrigatória com conferência registrada.
 */
export function impedimentosDoEncaminhar(
  itens: readonly { _id: unknown; origem: string | null }[],
  escolhas: { bases: ReadonlySet<string>; conferencias: ReadonlySet<string> },
  naLista: ReadonlySet<string>,
): CodigoControle[] {
  const out: CodigoControle[] = [];
  if (itens.some((i) => i.origem === 'ambas' && !escolhas.bases.has(String(i._id)))) {
    out.push('base_nao_escolhida');
  }
  if ([...naLista].some((id) => !escolhas.conferencias.has(id))) out.push('conferencia_pendente');
  return out;
}
