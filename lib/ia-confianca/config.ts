import 'server-only';

import { PROMPT_VERSION } from '@/lib/assistente/prompt';
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
  /** Spec 0008: independe de `PROMPT_VERSION`, porque a escolha é por regra e não pela confiança do modelo. */
  atribuicaoAutomaticaAtiva: boolean;
};

const PADRAO_CAMPO: CampoConfigLida = { limiteConfianca: null, amostraMinima: 30 };

/**
 * Lê a configuração única; cria com os padrões de fábrica na primeira leitura (AC-6).
 *
 * `autonomiaAtiva` sai como a autonomia em vigor, não só o interruptor: salva
 * sob outra `PROMPT_VERSION` (ou antes de a versão ser gravada), ela vale
 * `false`, porque o limite foi calibrado para outro texto de prompt (spec
 * 0007, AC-17). O deploy que sobe o prompt desliga a autonomia sozinho, e o
 * Admin religa salvando de novo na tela de calibração.
 */
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
    autonomiaAtiva: (doc.autonomiaAtiva ?? false) && doc.promptVersion === PROMPT_VERSION,
    atribuicaoAutomaticaAtiva: doc.atribuicaoAutomaticaAtiva ?? false,
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
        atribuicaoAutomaticaAtiva: input.atribuicaoAutomaticaAtiva,
        promptVersion: PROMPT_VERSION,
        updatedByUserId,
      },
      $setOnInsert: { chave: IA_AUTONOMIA_CONFIG_CHAVE },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
}
