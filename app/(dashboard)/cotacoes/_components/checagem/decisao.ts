import type { MaterialDaChecagem } from '@/app/api/cotacoes/[id]/checagem/materiais/route';
import type { ItemDTO } from '@/lib/material/serializar';
import { mesmaUnidade } from '@/shared/material/checagem';
import type { DecisaoChecagemInput } from '@/shared/material/cotacao.schemas';
import type { DecisaoChecagem } from '@/shared/material/material.constants';
import { reaisParaCentavos } from '@/shared/material/valores';

/**
 * O estado de um item na tela da checagem e o adaptador para a entrada de
 * `concluirChecagemAction`. O servidor confere tudo de novo com o saldo relido.
 */

export type EstadoItemChecagem = {
  resultado: DecisaoChecagem | null;
  material: MaterialDaChecagem | null;
  atendida: string;
  saida: string;
  motivo: string;
  preco: string;
  saldoManual: string;
  descricaoManual: string;
  codigoManual: string;
  unidadeManual: string;
};

export const ESTADO_INICIAL: EstadoItemChecagem = {
  resultado: null,
  material: null,
  atendida: '',
  saida: '',
  motivo: '',
  preco: '',
  saldoManual: '',
  descricaoManual: '',
  codigoManual: '',
  unidadeManual: '',
};

const numero = (texto: string): number | undefined => {
  const t = texto.trim();
  if (!t) return undefined;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/** A unidade do SICAM é outra: a tela pede também a saída (AC-8). */
export function unidadesDiferentes(item: Pick<ItemDTO, 'unidade'>, e: EstadoItemChecagem): boolean {
  const unidade = e.material?.unidade ?? e.unidadeManual.trim();
  return !!unidade && !mesmaUnidade(item.unidade, unidade);
}

/** O SICAM está no ar, mas sem o valor do material: a tela pede o preço (AC-13). */
export function precisaDePreco(e: EstadoItemChecagem, sicamFora: boolean): boolean {
  if (e.resultado !== 'usar') return false;
  return sicamFora || (!!e.material && e.material.precoMedioCentavos == null);
}

/** A decisão pronta para o servidor, ou `null` enquanto o item não foi decidido. */
export function montarDecisao(
  itemId: string,
  e: EstadoItemChecagem,
  sicamFora: boolean,
): DecisaoChecagemInput | null {
  if (!e.resultado) return null;
  const motivo = e.motivo.trim();
  const base: DecisaoChecagemInput = {
    itemId,
    resultado: e.resultado,
    ...(motivo ? { motivo } : {}),
  };
  if (sicamFora) {
    base.manual = true;
    const saldo = numero(e.saldoManual);
    if (saldo !== undefined) base.saldoManual = saldo;
    if (e.descricaoManual.trim().length >= 2) base.materialDescricao = e.descricaoManual.trim();
    if (e.unidadeManual.trim()) base.materialUnidade = e.unidadeManual.trim();
    if (/^\d+$/.test(e.codigoManual.trim())) base.coMat = e.codigoManual.trim();
  } else if (e.material && e.resultado !== 'sem_correspondente') {
    base.coMat = e.material.coMat;
  }
  if (e.resultado === 'usar') {
    const atendida = numero(e.atendida);
    const saida = numero(e.saida);
    if (atendida !== undefined) base.quantidadeAtendida = atendida;
    if (saida !== undefined) base.quantidadeSaida = saida;
    const preco = reaisParaCentavos(e.preco);
    if (preco != null) base.precoUnitarioCentavos = preco;
  }
  return base;
}
