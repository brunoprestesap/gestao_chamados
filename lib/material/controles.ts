import 'server-only';

import { MIN_ORCAMENTOS_POR_ITEM } from '@/shared/material/material.constants';
import { type CodigoControle, CODIGOS_ADVERTENCIA_PRECO } from '@/shared/material/mensagens';
import { acimaDoPercentual } from '@/shared/material/valores';

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

/** Uma advertência gravada que não é de preço sobrevive ao recálculo das de preço. */
export function ehAdvertenciaDePreco(codigo: string): boolean {
  return CODIGOS_ADVERTENCIA_PRECO.includes(codigo as CodigoControle);
}

/** Impedimento do envio: cada item do caminho 3 com preço em ao menos 3 orçamentos (AC-4). */
export function impedimentosDeEnvio(c: {
  itens: readonly { _id: unknown; origem?: string | null }[];
  orcamentos: readonly { precos: readonly { itemId: unknown }[] }[];
}): CodigoControle[] {
  const faltando = c.itens.some((i) => {
    // Os caminhos 1 e 2 não pedem orçamento (CA-01, CA-02).
    if (i.origem && i.origem !== 'orcamento') return false;
    const n = c.orcamentos.filter((o) =>
      o.precos.some((p) => String(p.itemId) === String(i._id)),
    ).length;
    return n < MIN_ORCAMENTOS_POR_ITEM;
  });
  return faltando ? ['orcamentos_insuficientes'] : [];
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
