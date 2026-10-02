import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { campanhaAberta } from '@/lib/vistoria/campanha';
import { montarPacote } from '@/lib/vistoria/pacote';
import { ERRO_SEM_CAMPANHA, podeVistoriar } from '@/shared/vistoria/vistoria.constants';

/**
 * Pacote do campo (spec 0012, AC-3): tudo que é vistoriável, a árvore de
 * locais ativa, as categorias ativas e as conferências já feitas na campanha
 * aberta. Admin, Preposto e Técnico; o Solicitante recebe 403.
 */
export async function GET() {
  const sessao = await verifySession();
  if (!sessao) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  if (!podeVistoriar(sessao.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  await dbConnect();
  const campanha = await campanhaAberta();
  if (!campanha) return NextResponse.json({ error: ERRO_SEM_CAMPANHA }, { status: 409 });

  const pacote = await montarPacote(campanha);
  return NextResponse.json(pacote, { headers: { 'Cache-Control': 'no-store' } });
}
