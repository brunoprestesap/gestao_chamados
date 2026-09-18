import { notFound } from 'next/navigation';

import { CONVERSA_MENSAGENS_MAX } from '@/lib/conversas/config';
import { requireSession } from '@/lib/dal';

import { PainelChamado } from '../_components/PainelChamado';
import { PainelConversa } from '../_components/PainelConversa';
import { abrirConversa } from '../_lib/leitura';

/**
 * Uma conversa aberta (spec 0003, AC-10). O `id` é o da conversa quando ela
 * existe e o do chamado quando não existe, e a resolução segue essa ordem:
 * conversa primeiro, chamado depois.
 *
 * Insucesso nos dois responde 404, igual para conversa de outra pessoa e para
 * conversa inexistente: a resposta não revela que a de outra pessoa existe.
 */

export const dynamic = 'force-dynamic';

export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await requireSession();

  const aberta = await abrirConversa({ userId: sessao.userId, role: sessao.role }, id);

  if (aberta.tipo === 'falha') notFound();

  if (aberta.tipo === 'chamado') return <PainelChamado leitura={aberta.leitura} />;

  return (
    <PainelConversa
      key={aberta.conversa.id}
      conversa={aberta.conversa}
      primeiroNome={null}
      mensagensMax={CONVERSA_MENSAGENS_MAX}
    />
  );
}
