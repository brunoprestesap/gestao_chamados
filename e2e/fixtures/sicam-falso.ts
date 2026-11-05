import { existsSync, readFileSync } from 'fs';
import { createServer, type Server } from 'http';
import mongoose from 'mongoose';
import { resolve } from 'path';

/**
 * O apoio do E2E da checagem do almoxarifado (spec 0024): um `sicam-gateway` de
 * mentira na porta do `SICAM_GATEWAY_URL` do servidor de teste, com as mesmas
 * rotas e a mesma barreira do segredo, e o interruptor e a designação no banco.
 */

export const PORTA_SICAM_FALSO = 3902;
const SEGREDO = process.env.SICAM_GATEWAY_SECRET ?? 'e2e-sicam';

const MATERIAL = {
  coMat: '302400',
  descricao: 'TORNEIRA DE LAVATÓRIO CROMADA',
  unidade: 'UN',
  saldo: 10,
  reservado: 2,
  disponivel: 8,
  valorTotal: 250,
};

export async function subirSicamFalso(): Promise<Server> {
  const servidor = createServer((req, res) => {
    const responder = (status: number, corpo: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(corpo));
    };
    if (req.headers['x-internal-secret'] !== SEGREDO) {
      responder(401, { error: 'Não autorizado' });
      return;
    }
    let corpo = '';
    req.on('data', (pedaco) => {
      corpo += pedaco;
    });
    req.on('end', () => {
      const url = req.url ?? '';
      if (url.startsWith('/candidatos')) {
        const { itens } = JSON.parse(corpo) as { itens: { itemId: string }[] };
        responder(200, {
          itens: Object.fromEntries(itens.map((i) => [i.itemId, [{ ...MATERIAL, acertos: 1 }]])),
        });
        return;
      }
      responder(200, { materiais: [MATERIAL] });
    });
  });
  await new Promise<void>((ok) => servidor.listen(PORTA_SICAM_FALSO, ok));
  return servidor;
}

function uriDoBanco(): string {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const p = resolve(process.cwd(), '.env.local');
  if (existsSync(p)) {
    for (const linha of readFileSync(p, 'utf8').split('\n')) {
      const t = linha.trim();
      if (t.startsWith('MONGODB_URI=')) {
        return t.slice('MONGODB_URI='.length).replace(/^["']|["']$/g, '');
      }
    }
  }
  throw new Error('MONGODB_URI não definido: o E2E da checagem precisa do banco.');
}

async function noBanco<T>(fn: (db: NonNullable<mongoose.Connection['db']>) => Promise<T>) {
  const conexao = await mongoose.createConnection(uriDoBanco()).asPromise();
  try {
    return await fn(conexao.db!);
  } finally {
    await conexao.close();
  }
}

/** Liga ou desliga o interruptor. Só esta suíte o deixa ligado, e desliga no fim. */
export async function definirChecagem(ativa: boolean): Promise<void> {
  await noBanco(async (db) => {
    await db
      .collection('materialconfig')
      .updateOne(
        { chave: 'global' },
        { $set: { checagemAlmoxarifadoAtiva: ativa } },
        { upsert: true },
      );
  });
}

/** Dá ao `solicitante` E2E o papel de almoxarifado; o `revogar` tira no fim da suíte. */
export async function designarAlmoxarifado(): Promise<void> {
  await noBanco(async (db) => {
    const user = await db.collection('users').findOne({ username: 'solicitante' });
    if (!user) throw new Error('Usuário solicitante ausente: rode o global-setup.');
    await db.collection('designacoesmaterial').insertOne({
      userId: user._id,
      papel: 'almoxarifado',
      faixaId: null,
      vigenciaInicio: '2020-01-01',
      vigenciaFim: null,
      revogadaEm: null,
      motivo: 'E2E',
      criadaPorUserId: user._id,
      em: new Date(),
    });
  });
}

export async function revogarAlmoxarifado(): Promise<void> {
  await noBanco(async (db) => {
    await db
      .collection('designacoesmaterial')
      .updateMany({ papel: 'almoxarifado', motivo: 'E2E' }, { $set: { revogadaEm: new Date() } });
  });
}
