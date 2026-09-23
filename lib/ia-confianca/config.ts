import 'server-only';

import { dbConnect } from '@/lib/db';
import { IA_AUTONOMIA_CONFIG_CHAVE, IaAutonomiaConfigModel } from '@/models/IaAutonomiaConfig';
import type { SalvarIaAutonomiaConfigInput } from '@/shared/ia-confianca/ia-confianca.schemas';

/**
 * Leitura e gravação da configuração única de calibração (spec 0006). O
 * relatório de acurácia mora em `./calibragem.ts`; este arquivo só cuida do
 * documento de configuração (limite de confiança, amostra mínima, interruptor).
 */

export type CampoConfigLida = { limiteConfianca: number | null; amostraMinima: number };

export type IaAutonomiaConfigLida = {
  servico: CampoConfigLida;
  prioridade: CampoConfigLida;
  autonomiaAtiva: boolean;
};

const PADRAO_CAMPO: CampoConfigLida = { limiteConfianca: null, amostraMinima: 30 };

/** Lê a configuração única; cria com os padrões de fábrica na primeira leitura (AC-6). */
export async function lerConfig(): Promise<IaAutonomiaConfigLida> {
  await dbConnect();

  const doc = await IaAutonomiaConfigModel.findOneAndUpdate(
    { chave: IA_AUTONOMIA_CONFIG_CHAVE },
    { $setOnInsert: { chave: IA_AUTONOMIA_CONFIG_CHAVE } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return {
    servico: {
      limiteConfianca: doc.servico?.limiteConfianca ?? PADRAO_CAMPO.limiteConfianca,
      amostraMinima: doc.servico?.amostraMinima ?? PADRAO_CAMPO.amostraMinima,
    },
    prioridade: {
      limiteConfianca: doc.prioridade?.limiteConfianca ?? PADRAO_CAMPO.limiteConfianca,
      amostraMinima: doc.prioridade?.amostraMinima ?? PADRAO_CAMPO.amostraMinima,
    },
    autonomiaAtiva: doc.autonomiaAtiva ?? false,
  };
}

/** Grava a configuração única (upsert), registrando quem mudou por último (AC-5). */
export async function salvarConfig(
  input: SalvarIaAutonomiaConfigInput,
  updatedByUserId: string,
): Promise<void> {
  await dbConnect();

  await IaAutonomiaConfigModel.findOneAndUpdate(
    { chave: IA_AUTONOMIA_CONFIG_CHAVE },
    {
      $set: {
        servico: input.servico,
        prioridade: input.prioridade,
        autonomiaAtiva: input.autonomiaAtiva,
        updatedByUserId,
      },
      $setOnInsert: { chave: IA_AUTONOMIA_CONFIG_CHAVE },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
}
