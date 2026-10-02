import type { QueryFilter } from 'mongoose';

import type { Ativo } from '@/models/Ativo';
import { type TierManutencao, TIERS_VINCULAVEIS } from '@/shared/ativos/ativo.constants';

/**
 * Vistoriável = Tier A ou B e não `baixado` (spec 0012, contrato entre as
 * partes). A cobertura, o pacote do campo e a sincronização usam esta regra,
 * e só esta. É a mesma do `FILTRO_VINCULAVEL` da 0011, sem importar o seletor.
 */
export const FILTRO_VISTORIAVEL: QueryFilter<Ativo> = {
  tierManutencao: { $in: [...TIERS_VINCULAVEIS] },
  status: { $ne: 'baixado' },
};

export function ehVistoriavel(ativo: { tierManutencao: string; status?: string | null }): boolean {
  return (
    TIERS_VINCULAVEIS.includes(ativo.tierManutencao as TierManutencao) && ativo.status !== 'baixado'
  );
}
