import 'server-only';

import { MATERIAL_CONFIG_CHAVE, MaterialConfigModel } from '@/models/MaterialConfig';
import {
  CHECAGEM_ATIVA_PADRAO,
  MATERIAL_CONFIG_PADRAO,
} from '@/shared/material/material.constants';

export type ParametrosMaterial = {
  raizCnpjContratada: string;
  percentualSinapi: number;
  janelaDias: number;
  parcelaRelevantePercentual: number;
  prazoFornecimentoDiasUteis: number;
  prazoChecagemDiasUteis: number;
  checagemAlmoxarifadoAtiva: boolean;
};

/**
 * Os parâmetros vigentes do fluxo de material (spec 0019). Cada ato copia o
 * resultado para a trilha (`parametrosNoAto`). Sem documento gravado, ou sem
 * o campo, valem os padrões. O Admin edita na aba Parâmetros (fatia 5).
 */
export async function lerMaterialConfig(): Promise<ParametrosMaterial> {
  const doc = await MaterialConfigModel.findOne({ chave: MATERIAL_CONFIG_CHAVE })
    .select(
      'raizCnpjContratada percentualSinapi janelaDias parcelaRelevantePercentual prazoFornecimentoDiasUteis prazoChecagemDiasUteis checagemAlmoxarifadoAtiva',
    )
    .lean();
  return {
    raizCnpjContratada: doc?.raizCnpjContratada ?? MATERIAL_CONFIG_PADRAO.raizCnpjContratada,
    percentualSinapi: doc?.percentualSinapi ?? MATERIAL_CONFIG_PADRAO.percentualSinapi,
    janelaDias: doc?.janelaDias ?? MATERIAL_CONFIG_PADRAO.janelaDias,
    parcelaRelevantePercentual:
      doc?.parcelaRelevantePercentual ?? MATERIAL_CONFIG_PADRAO.parcelaRelevantePercentual,
    prazoFornecimentoDiasUteis:
      doc?.prazoFornecimentoDiasUteis ?? MATERIAL_CONFIG_PADRAO.prazoFornecimentoDiasUteis,
    prazoChecagemDiasUteis:
      doc?.prazoChecagemDiasUteis ?? MATERIAL_CONFIG_PADRAO.prazoChecagemDiasUteis,
    checagemAlmoxarifadoAtiva: doc?.checagemAlmoxarifadoAtiva ?? CHECAGEM_ATIVA_PADRAO,
  };
}
