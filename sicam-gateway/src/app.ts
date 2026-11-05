import { timingSafeEqual } from 'node:crypto';

import express, { type Express, type NextFunction, type Request, type Response } from 'express';

/**
 * As rotas do serviço (spec 0024, AC-29). Só `/healthz` fica aberta, sem tocar
 * no Oracle; o resto exige `x-internal-secret`, e um segredo vazio recusa tudo.
 * O texto da busca nunca vai para o log (LGPD): o erro registra só o código.
 */

export type Material = {
  coMat: string;
  descricao: string;
  unidade: string;
  saldo: number;
  reservado: number;
  disponivel: number;
  /** `VL_ATU` bruto: o preço médio é conta do Next. */
  valorTotal: number | null;
  acertos?: number;
};

export type Consultas = {
  candidatos(itens: { itemId: string; palavras: string[] }[]): Promise<Record<string, Material[]>>;
  materiais(q: string, limite: number): Promise<Material[]>;
  lote(coMats: string[]): Promise<Material[]>;
};

const MAX_ITENS = 50;
const MAX_PALAVRAS = 8;
const MAX_LETRAS_PALAVRA = 40;
const MIN_LETRAS_BUSCA = 3;
const MAX_LETRAS_BUSCA = 100;
const LIMITE_PADRAO = 25;

function segredoConfere(recebido: unknown, esperado: string): boolean {
  if (!esperado || typeof recebido !== 'string') return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function itensValidos(v: unknown): v is { itemId: string; palavras: string[] }[] {
  if (!Array.isArray(v) || v.length > MAX_ITENS) return false;
  return v.every(
    (i: { itemId?: unknown; palavras?: unknown }) =>
      typeof i?.itemId === 'string' &&
      i.itemId.length > 0 &&
      i.itemId.length <= 64 &&
      Array.isArray(i.palavras) &&
      i.palavras.length <= MAX_PALAVRAS &&
      i.palavras.every(
        (p) => typeof p === 'string' && p.length > 0 && p.length <= MAX_LETRAS_PALAVRA,
      ),
  );
}

function coMatsValidos(v: unknown): v is string[] {
  return (
    Array.isArray(v) &&
    v.length <= MAX_ITENS &&
    v.every((c) => typeof c === 'string' && /^\d{1,30}$/.test(c))
  );
}

async function responder(res: Response, fn: () => Promise<unknown>): Promise<void> {
  try {
    res.json(await fn());
  } catch (e) {
    console.error(
      '[sicam-gateway] consulta falhou:',
      (e as { code?: string }).code ?? 'sem código',
    );
    res.status(503).json({ error: 'SICAM indisponível' });
  }
}

export function criarApp(segredo: string, consultas: Consultas): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!segredoConfere(req.headers['x-internal-secret'], segredo)) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }
    next();
  });

  app.post('/candidatos', (req, res) => {
    const itens = (req.body as { itens?: unknown } | undefined)?.itens;
    if (!itensValidos(itens)) {
      res.status(400).json({ error: 'Entrada inválida' });
      return;
    }
    void responder(res, async () => ({ itens: await consultas.candidatos(itens) }));
  });

  app.get('/materiais', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limite = req.query.limite === undefined ? LIMITE_PADRAO : Number(req.query.limite);
    if (
      q.length < MIN_LETRAS_BUSCA ||
      q.length > MAX_LETRAS_BUSCA ||
      !Number.isInteger(limite) ||
      limite < 1 ||
      limite > LIMITE_PADRAO
    ) {
      res.status(400).json({ error: 'Entrada inválida' });
      return;
    }
    void responder(res, async () => ({ materiais: await consultas.materiais(q, limite) }));
  });

  app.post('/materiais/lote', (req, res) => {
    const coMats = (req.body as { coMats?: unknown } | undefined)?.coMats;
    if (!coMatsValidos(coMats)) {
      res.status(400).json({ error: 'Entrada inválida' });
      return;
    }
    void responder(res, async () => ({ materiais: await consultas.lote(coMats) }));
  });

  return app;
}
