/**
 * As consultas do serviço (spec 0024, AC-29). Só lê `MATERIAL` e
 * `ALMOXARIFADO_MATERIAL`, e todo texto vindo de fora vai por bind: as únicas
 * coisas montadas por concatenação são os nomes dos binds, gerados aqui.
 */

const ACENTUADAS = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ';
const SEM_ACENTO = 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn';

const DESCRICAO_NORMALIZADA = `UPPER(TRANSLATE(m.DE_MAT, '${ACENTUADAS}', '${SEM_ACENTO}'))`;

const COLUNAS = `TO_CHAR(m.CO_MAT) AS CO_MAT, m.DE_MAT, m.CO_UNID_MEDIDA, m.QT_SALDO_ATU, m.VL_ATU, NVL(r.RESERVADO, 0) AS RESERVADO`;

const ORIGEM = `FROM SICAM.MATERIAL m
LEFT JOIN (
  SELECT ALMX_CO_MAT, SUM(ALMX_QT_RESERVADA) AS RESERVADO
  FROM SICAM.ALMOXARIFADO_MATERIAL
  GROUP BY ALMX_CO_MAT
) r ON r.ALMX_CO_MAT = m.CO_MAT
WHERE m.FG_DESUSO IS NULL`;

export type Binds = Record<string, string | number>;
export type Consulta = { sql: string; binds: Binds };

/** A palavra como a descrição é comparada: sem acento, em caixa alta e com o LIKE escapado. */
export function paraBusca(palavra: string): string {
  return palavra
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[\\%_]/g, (c) => `\\${c}`);
}

function clausula(bind: string): string {
  return `${DESCRICAO_NORMALIZADA} LIKE '%' || :${bind} || '%' ESCAPE '\\'`;
}

/** Até `limite` materiais com disponível acima de zero, por palavras que bateram. */
export function consultaCandidatos(palavras: readonly string[], limite: number): Consulta {
  const binds: Binds = { limite };
  const nomes = palavras.map((p, n) => {
    binds[`p${n}`] = paraBusca(p);
    return `p${n}`;
  });
  const acertos = nomes.map((b) => `CASE WHEN ${clausula(b)} THEN 1 ELSE 0 END`).join(' + ');
  const alguma = nomes.map(clausula).join(' OR ');
  return {
    binds,
    sql: `SELECT * FROM (
  SELECT ${COLUNAS}, (${acertos}) AS ACERTOS
  ${ORIGEM}
  AND (${alguma})
  AND NVL(m.QT_SALDO_ATU, 0) - NVL(r.RESERVADO, 0) > 0
  ORDER BY ACERTOS DESC, m.CO_MAT
) WHERE ROWNUM <= :limite`,
  };
}

/** A busca manual: toda palavra do texto na descrição, ou o começo do código. Inclui saldo zero. */
export function consultaMateriais(q: string, limite: number): Consulta {
  const binds: Binds = { limite };
  const nomes = q
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((p, n) => {
      binds[`p${n}`] = paraBusca(p);
      return `p${n}`;
    });
  const texto = nomes.map(clausula).join(' AND ');
  let condicao = `(${texto})`;
  if (/^\d+$/.test(q.trim())) {
    binds.codigo = q.trim();
    condicao = `(${texto} OR TO_CHAR(m.CO_MAT) LIKE :codigo || '%')`;
  }
  return {
    binds,
    sql: `SELECT * FROM (
  SELECT ${COLUNAS}
  ${ORIGEM}
  AND ${condicao}
  ORDER BY m.CO_MAT
) WHERE ROWNUM <= :limite`,
  };
}

/** A releitura pelo código. Sem código, só confirma que o Oracle responde. */
export function consultaLote(coMats: readonly string[]): Consulta {
  if (coMats.length === 0) {
    return { binds: {}, sql: 'SELECT COUNT(*) AS CO_MAT FROM SICAM.MATERIAL WHERE ROWNUM = 1' };
  }
  const binds: Binds = {};
  const nomes = coMats.map((c, n) => {
    binds[`c${n}`] = c;
    return `:c${n}`;
  });
  return {
    binds,
    sql: `SELECT ${COLUNAS}
${ORIGEM}
AND TO_CHAR(m.CO_MAT) IN (${nomes.join(', ')})`,
  };
}
