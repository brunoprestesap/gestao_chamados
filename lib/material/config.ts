import 'server-only';

import { MATERIAL_CONFIG_CHAVE, MaterialConfigModel } from '@/models/MaterialConfig';
import { MATERIAL_CONFIG_PADRAO } from '@/shared/material/material.constants';

/**
 * Os parâmetros vigentes do fluxo de material (spec 0019). Cada ato copia o
 * resultado para a trilha (`parametrosNoAto`). Sem documento gravado, valem
 * os padrões; a fatia 1 só tem a raiz da contratada.
 */
export async function lerMaterialConfig(): Promise<{ raizCnpjContratada: string }> {
  const doc = await MaterialConfigModel.findOne({ chave: MATERIAL_CONFIG_CHAVE })
    .select('raizCnpjContratada')
    .lean();
  return {
    raizCnpjContratada: doc?.raizCnpjContratada ?? MATERIAL_CONFIG_PADRAO.raizCnpjContratada,
  };
}
