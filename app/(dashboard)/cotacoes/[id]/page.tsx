import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/dashboard/header';
import { requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { lerDetalhe } from '@/lib/material/leitura';

import { DetalheCotacaoView } from '../_components/DetalheCotacaoView';

/**
 * Detalhe da cotação de material (spec 0019). Abre para o lado TRF1, o
 * responsável técnico e o técnico atribuído; a visão de cada um sai de
 * `serializarCotacao` (AC-15).
 */
export default async function CotacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requireSession();
  const { id } = await params;
  await dbConnect();
  const detalhe = await lerDetalhe(id, { userId: sessao.userId, role: sessao.role });
  if (!detalhe) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Cotação ${detalhe.cotacao.numero}`}
        subtitle="Material do chamado: itens, orçamentos, decisões e a trilha de cada ato."
      />
      <DetalheCotacaoView detalhe={detalhe} />
    </div>
  );
}
