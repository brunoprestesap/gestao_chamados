import type { Metadata } from 'next';

import { requireSession } from '@/lib/dal';

import { ConversasShell } from './_components/ConversasShell';
import { montarLateral } from './_lib/lateral';

/**
 * A lateral é montada no servidor e vale para as duas rotas, então a primeira
 * pintura já traz a lista pronta, sem estado de carregamento (spec 0003, AC-1).
 * A tela é de todos os quatro perfis; cada um vê só as próprias conversas e os
 * próprios chamados, regra que `lib/conversas` e a consulta da lateral aplicam.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Conversas',
  description: 'Relate o problema conversando e acompanhe seus chamados.',
};

export default async function ConversasLayout({ children }: { children: React.ReactNode }) {
  const sessao = await requireSession();
  const lateral = await montarLateral({ userId: sessao.userId, role: sessao.role });

  return (
    <ConversasShell
      rascunhos={lateral.rascunhos}
      chamados={lateral.chamados}
      temMais={lateral.temMais}
      cursor={lateral.cursor}
    >
      {children}
    </ConversasShell>
  );
}
