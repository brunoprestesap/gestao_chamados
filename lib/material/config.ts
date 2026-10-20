import 'server-only';

import { MATERIAL_CONFIG_CHAVE, MaterialConfigModel } from '@/models/MaterialConfig';
import { MATERIAL_CONFIG_PADRAO } from '@/shared/material/material.constants';

export type ParametrosMaterial = { raizCnpjContratada: string; percentualSinapi: number };

/**
 * Os parâmetros vigentes do fluxo de material (spec 0019). Cada ato copia o
 * resultado para a trilha (`parametrosNoAto`). Sem documento gravado, valem
 * os padrões. A fatia 3 acrescenta o percentual sobre o SINAPI; a tela que o
 * edita é da fatia 5.
 */
export async function lerMaterialConfig(): Promise<ParametrosMaterial> {
  const doc = await MaterialConfigModel.findOne({ chave: MATERIAL_CONFIG_CHAVE })
    .select('raizCnpjContratada percentualSinapi')
    .lean();
  return {
    raizCnpjContratada: doc?.raizCnpjContratada ?? MATERIAL_CONFIG_PADRAO.raizCnpjContratada,
    percentualSinapi: doc?.percentualSinapi ?? MATERIAL_CONFIG_PADRAO.percentualSinapi,
  };
}
