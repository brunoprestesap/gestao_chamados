import { Types } from 'mongoose';

import {
  comOrgao,
  reiniciarModoIsolamentoParaTeste,
  type ResultadoNoEscopo,
} from '@/lib/orgaos/contexto';
import { OrgaoModel } from '@/models/Orgao';
import { ORGAO_1_ID, ORGAO_1_NOME, ORGAO_1_SIGLA } from '@/shared/orgaos/orgao.constants';

/**
 * Apoio dos testes de órgão (spec 0025). O órgão B tem `_id` fixo para os
 * testes lerem os dois sem consultar o banco.
 */
export const ORGAO_A_ID = ORGAO_1_ID;
export const ORGAO_B_ID = '000000000000000000000002';

/** Roda `fn` no órgão informado, como o código de produção faz fora da requisição. */
export function comOrgaoDeTeste<T>(orgaoId: string, fn: () => T): ResultadoNoEscopo<T> {
  return comOrgao(orgaoId, fn);
}

/** Troca o modo do plugin dentro do arquivo de teste. */
export function usarModo(modo: 'observacao' | 'estrito'): void {
  process.env.ORGAO_ISOLAMENTO = modo;
  reiniciarModoIsolamentoParaTeste();
}

/** Cria (ou mantém) o órgão 1 e um segundo órgão, de forma idempotente. */
export async function criarDoisOrgaos(): Promise<void> {
  await OrgaoModel.updateOne(
    { _id: new Types.ObjectId(ORGAO_A_ID) },
    {
      $setOnInsert: { sigla: ORGAO_1_SIGLA, nome: ORGAO_1_NOME, ativo: true, criadoEm: new Date() },
    },
    { upsert: true },
  );
  await OrgaoModel.updateOne(
    { _id: new Types.ObjectId(ORGAO_B_ID) },
    {
      $setOnInsert: {
        sigla: 'TESTEB',
        nome: 'Órgão B de teste',
        ativo: true,
        criadoEm: new Date(),
      },
    },
    { upsert: true },
  );
}
