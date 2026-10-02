import type { GrupoImportacao } from '@/shared/ativos/importacao.constants';

/**
 * Enxugamento da importação ao fechar (spec 0012, AC-25): depois de
 * `aplicada` ou `descartada`, o item guarda só grupo, código, se foi aplicado
 * e o motivo do pulo. Descrição, antes e depois (que podem ter nome e
 * matrícula) saem na mesma escrita que fecha a importação.
 */
export const CAMPOS_DO_ITEM_ENXUGADOS = [
  'descricao',
  'local',
  'camposAlterados',
  'dados',
  'tier',
  'categoriaSugerida',
  'categoriaId',
  'bloqueio',
  'retornou',
] as const;

/** O `$unset` que fecha a importação: `emAberto` e o detalhe de todos os itens. */
export function unsetEnxugamento(): Record<string, 1> {
  const unset: Record<string, 1> = { emAberto: 1 };
  for (const c of CAMPOS_DO_ITEM_ENXUGADOS) unset[`itens.$[].${c}`] = 1;
  return unset;
}

type ItemContado = {
  grupo: GrupoImportacao;
  aplicado?: boolean | null;
  motivoPulo?: string | null;
};

const CHAVE_DO_GRUPO = { novo: 'novos', alterado: 'alterados', sumido: 'sumidos' } as const;

/** Aplicados e pulados por grupo, contados dos itens. */
export function contarResultado(itens: ItemContado[]) {
  const aplicados = { novos: 0, alterados: 0, sumidos: 0 };
  const pulados = { novos: 0, alterados: 0, sumidos: 0 };
  for (const i of itens) {
    const chave = CHAVE_DO_GRUPO[i.grupo];
    if (i.aplicado) aplicados[chave] += 1;
    else if (i.motivoPulo) pulados[chave] += 1;
  }
  return { aplicados, pulados };
}
