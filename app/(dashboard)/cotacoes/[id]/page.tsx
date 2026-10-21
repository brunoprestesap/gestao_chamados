import { notFound } from 'next/navigation';

import { requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { lerDetalhe } from '@/lib/material/leitura';

import { DetalheCotacaoView } from '../_components/DetalheCotacaoView';

/**
 * Detalhe da cotação de material (spec 0019). Abre para o lado TRF1, o
 * responsável técnico e o técnico atribuído; a visão de cada um sai de
 * `serializarCotacao` (AC-15). O cabeçalho com o título é do próprio detalhe
 * (spec 0021, AC-5).
 */
export default async function CotacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requireSession();
  const { id } = await params;
  await dbConnect();
  const detalhe = await lerDetalhe(id, { userId: sessao.userId, role: sessao.role });
  if (!detalhe) notFound();

  return <DetalheCotacaoView detalhe={detalhe} />;
}
