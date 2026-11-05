import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { papeisDe, podeConcluirChecagem } from '@/lib/material/papeis';
import {
  buscarCandidatos,
  buscarMateriais,
  type MaterialSicam,
  type ResultadoSicam,
} from '@/lib/material/sicam';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { itensNaoChecados, palavrasDaBusca, precoMedioCentavos } from '@/shared/material/checagem';
import {
  BUSCA_CHECAGEM_MIN_LETRAS,
  MAX_RESULTADOS_BUSCA_CHECAGEM,
} from '@/shared/material/material.constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type MaterialDaChecagem = Omit<MaterialSicam, 'valorTotal'> & {
  precoMedioCentavos: number | null;
};

function paraTela(m: MaterialSicam): MaterialDaChecagem {
  const { valorTotal, ...resto } = m;
  return { ...resto, precoMedioCentavos: precoMedioCentavos(valorTotal, m.saldo) };
}

function sicamFora(r: Extract<ResultadoSicam<object>, { ok: false }>) {
  return NextResponse.json({ error: 'SICAM indisponível', motivo: r.motivo }, { status: 503 });
}

/**
 * Os materiais do almoxarifado para a tela da checagem (spec 0024, AC-5, AC-26).
 * Sem `q`, os candidatos dos itens em aberto; com `q`, a busca manual, que inclui
 * saldo zero. Só quem pode agir naquela cotação, naquele momento: 401 sem sessão,
 * e 403 para o resto, mesmo com id inexistente, para o id não revelar nada.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await verifySession();
  if (!sessao) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  await dbConnect();
  const proibido = NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  if (!Types.ObjectId.isValid(id)) return proibido;
  const cot = await CotacaoMaterialModel.findById(id).select('situacao itens checagem').lean();
  if (!cot) return proibido;
  const papeis = await papeisDe(sessao.userId, sessao.role);
  if (!podeConcluirChecagem(cot.situacao, papeis)) return proibido;

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q) {
    if (q.length < BUSCA_CHECAGEM_MIN_LETRAS) {
      return NextResponse.json({ error: 'Busca curta demais' }, { status: 400 });
    }
    const r = await buscarMateriais(q.slice(0, 100), MAX_RESULTADOS_BUSCA_CHECAGEM);
    if (!r.ok) return sicamFora(r);
    return NextResponse.json({
      consultadoEm: r.consultadoEm.toISOString(),
      materiais: r.materiais.map(paraTela),
    });
  }

  const abertos = itensNaoChecados(cot.itens, cot.checagem?.itens ?? [], (i) => String(i._id));
  const r = await buscarCandidatos(
    abertos.map((i) => ({ itemId: String(i._id), palavras: palavrasDaBusca(i.descricao) })),
  );
  if (!r.ok) return sicamFora(r);
  return NextResponse.json({
    consultadoEm: r.consultadoEm.toISOString(),
    candidatos: Object.fromEntries(
      [...r.porItem].map(([itemId, materiais]) => [itemId, materiais.map(paraTela)]),
    ),
  });
}
