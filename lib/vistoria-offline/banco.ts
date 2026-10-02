import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import type { EstadoOperacao } from '@/shared/vistoria/vistoria.constants';
import type {
  OperacaoCadastroInput,
  OperacaoConferenciaInput,
  PacoteVistoria,
  ResultadoOperacao,
} from '@/shared/vistoria/vistoria.schemas';

/**
 * O banco local do navegador da vistoria (spec 0012, parte 1): o pacote de
 * cada pessoa e a fila de operações. Módulo de cliente, sem `server-only`.
 */

export const NOME_BANCO = 'sigma-vistoria';

export type PacoteGuardado = { userId: string; pacote: PacoteVistoria; salvoEm: string };

type ComDataEmTexto<T> = Omit<T, 'conferidoEm'> & { conferidoEm: string };

/** O corpo que vai para o servidor, com a data já em texto. */
export type OperacaoConferenciaEnviada = ComDataEmTexto<OperacaoConferenciaInput>;
export type OperacaoCadastroEnviada = ComDataEmTexto<OperacaoCadastroInput>;
export type OperacaoEnviada = OperacaoConferenciaEnviada | OperacaoCadastroEnviada;

export type OperacaoGuardada = {
  clientOpId: string;
  /** Dono da operação: só sobe com a sessão desta pessoa (AC-15). */
  userId: string;
  estado: EstadoOperacao;
  criadaEm: string;
  operacao: OperacaoEnviada;
  /**
   * Para mostrar o item sem depender do pacote. No cadastro interno, `codigo`
   * é o provisório `PROV-` (AC-12), que nunca vai ao servidor; o definitivo
   * chega em `resultado.codigo`.
   */
  rotulo: { codigo: string; descricao: string; local: string };
  resultado?: ResultadoOperacao;
  resolvidaEm?: string;
};

interface VistoriaDB extends DBSchema {
  pacote: { key: string; value: PacoteGuardado };
  operacoes: { key: string; value: OperacaoGuardada; indexes: { userId: string } };
}

let aberto: Promise<IDBPDatabase<VistoriaDB>> | null = null;

export function abrirBanco(): Promise<IDBPDatabase<VistoriaDB>> {
  if (!aberto) {
    const promessa = openDB<VistoriaDB>(NOME_BANCO, 1, {
      upgrade(db) {
        db.createObjectStore('pacote', { keyPath: 'userId' });
        const ops = db.createObjectStore('operacoes', { keyPath: 'clientOpId' });
        ops.createIndex('userId', 'userId');
      },
    });
    // Falhou ao abrir (navegação privada, cota): a próxima chamada tenta de novo.
    promessa.catch(() => {
      if (aberto === promessa) aberto = null;
    });
    aberto = promessa;
  }
  return aberto;
}

/** Só para testes: fecha e esquece a conexão, para um banco novo a cada teste. */
export async function fecharBanco(): Promise<void> {
  const atual = aberto;
  aberto = null;
  if (atual) (await atual).close();
}
