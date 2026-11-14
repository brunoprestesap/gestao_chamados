/**
 * O órgão 1 (spec 0025, AC-1): os dados de hoje do Sigma. O `_id` é fixo para
 * o script do mongosh, o seed, as cargas e o código acertarem o mesmo órgão
 * sem consultar o banco.
 */
export const ORGAO_1_ID = '000000000000000000000001';
export const ORGAO_1_SIGLA = 'SJAP';
export const ORGAO_1_NOME = 'Seção Judiciária do Amapá';

/** Os dois modos do plugin de órgão (`ORGAO_ISOLAMENTO`). */
export const MODOS_ISOLAMENTO = ['observacao', 'estrito'] as const;
export type ModoIsolamento = (typeof MODOS_ISOLAMENTO)[number];
