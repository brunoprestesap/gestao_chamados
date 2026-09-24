import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { lerDecisoes } from '@/lib/conversas';
import { requireManager } from '@/lib/dal';

/**
 * GET /api/gestao/chamados/[id]/decisao-prioridade
 *
 * A sugestão de prioridade da IA, para pré-preencher o formulário de
 * classificação (spec 0007, AC-8). Só sugestão ainda não revisada; uma
 * decisão já `aplicado` (o chamado nasceu `validado` sozinho) ou já corrigida
 * não tem nada a pré-preencher aqui. Restrito a Preposto e Admin, mesma trava
 * de `lerDecisoes`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager();

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const lidas = await lerDecisoes({ userId: session.userId, role: session.role }, id);
  if (!lidas.ok) {
    return NextResponse.json({ sugestao: null });
  }

  const decisao = lidas.decisoes.find(
    (d) => d.campo === 'prioridade' && d.efeito === 'sugestao' && d.situacao !== 'corrigida',
  );

  if (!decisao || !decisao.valorFinal.prioridade) {
    return NextResponse.json({ sugestao: null });
  }

  return NextResponse.json({ sugestao: { prioridade: decisao.valorFinal.prioridade } });
}
