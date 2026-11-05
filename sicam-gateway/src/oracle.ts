import oracledb, { type Connection, type Pool } from 'oracledb';

import type { Consultas, Material } from './app.js';
import { type Consulta, consultaCandidatos, consultaLote, consultaMateriais } from './sql.js';

/**
 * O acesso ao Oracle do SICAM (spec 0024). Cada pedido abre uma transação
 * somente leitura e desfaz no fim, e cada ida ao banco tem 3 segundos, para o
 * erro chegar antes do corte de 4 segundos do Next.
 */

const CALL_TIMEOUT_MS = 3_000;
const LIMITE_CANDIDATOS = 10;

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

type Linha = {
  CO_MAT: string;
  DE_MAT: string | null;
  CO_UNID_MEDIDA: string | null;
  QT_SALDO_ATU: number | null;
  VL_ATU: number | null;
  RESERVADO: number | null;
  ACERTOS?: number;
};

export function paraMaterial(l: Linha): Material {
  const saldo = l.QT_SALDO_ATU ?? 0;
  const reservado = l.RESERVADO ?? 0;
  return {
    coMat: String(l.CO_MAT),
    descricao: l.DE_MAT ?? '',
    unidade: l.CO_UNID_MEDIDA ?? '',
    saldo,
    reservado,
    disponivel: Math.max(0, saldo - reservado),
    valorTotal: l.VL_ATU ?? null,
    ...(l.ACERTOS !== undefined ? { acertos: l.ACERTOS } : {}),
  };
}

let poolPromise: Promise<Pool> | null = null;

function abrirPool(): Promise<Pool> {
  if (poolPromise) return poolPromise;
  const user = process.env.SICAM_ORACLE_USER;
  const password = process.env.SICAM_ORACLE_PASSWORD;
  const connectString = process.env.SICAM_ORACLE_CONNECT_STRING;
  if (!user || !password || !connectString) {
    return Promise.reject(new Error('SICAM_ORACLE_* ausentes'));
  }
  const libDir = process.env.SICAM_ORACLE_INSTANT_CLIENT_DIR;
  if (libDir) {
    const configDir = process.env.SICAM_ORACLE_CONFIG_DIR;
    oracledb.initOracleClient({ libDir, ...(configDir ? { configDir } : {}) });
  }
  poolPromise = oracledb
    .createPool({
      user,
      password,
      connectString,
      poolMin: 0,
      poolMax: 4,
      poolIncrement: 1,
      poolTimeout: 60,
      queueTimeout: CALL_TIMEOUT_MS,
    })
    .catch((e: unknown) => {
      poolPromise = null;
      throw e;
    });
  return poolPromise;
}

async function emLeitura<T>(fn: (c: Connection) => Promise<T>): Promise<T> {
  const pool = await abrirPool();
  const conexao = await pool.getConnection();
  try {
    conexao.callTimeout = CALL_TIMEOUT_MS;
    await conexao.execute('SET TRANSACTION READ ONLY');
    return await fn(conexao);
  } finally {
    await conexao.rollback().catch(() => {});
    await conexao.close().catch(() => {});
  }
}

async function linhas(conexao: Connection, c: Consulta): Promise<Linha[]> {
  const r = await conexao.execute<Linha>(c.sql, c.binds);
  return r.rows ?? [];
}

export const consultasOracle: Consultas = {
  candidatos: (itens) =>
    emLeitura(async (conexao) => {
      const saida: Record<string, Material[]> = {};
      for (const item of itens) {
        saida[item.itemId] =
          item.palavras.length === 0
            ? []
            : (await linhas(conexao, consultaCandidatos(item.palavras, LIMITE_CANDIDATOS))).map(
                paraMaterial,
              );
      }
      return saida;
    }),
  materiais: (q, limite) =>
    emLeitura(async (conexao) =>
      (await linhas(conexao, consultaMateriais(q, limite))).map(paraMaterial),
    ),
  lote: (coMats) =>
    emLeitura(async (conexao) => {
      const achadas = await linhas(conexao, consultaLote(coMats));
      return coMats.length === 0 ? [] : achadas.map(paraMaterial);
    }),
};

export async function fecharPool(): Promise<void> {
  if (!poolPromise) return;
  const pool = await poolPromise.catch(() => null);
  poolPromise = null;
  await pool?.close(5).catch(() => {});
}
