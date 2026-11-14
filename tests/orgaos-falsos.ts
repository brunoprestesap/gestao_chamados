import { ORGAO_1_ID, ORGAO_1_SIGLA } from '@/shared/orgaos/orgao.constants';

/**
 * `OrgaoModel` falso para os testes de rota do cron (spec 0025, AC-13): a
 * leitura `find().sort().select().lean()` de `paraCadaOrgaoAtivo` devolve a
 * lista informada, sem banco. Por padrão, só o órgão 1.
 */
export function orgaosFalsos(
  lista: { _id: string; sigla: string }[] = [{ _id: ORGAO_1_ID, sigla: ORGAO_1_SIGLA }],
) {
  return {
    OrgaoModel: {
      find: () => ({ sort: () => ({ select: () => ({ lean: async () => lista }) }) }),
    },
  };
}
