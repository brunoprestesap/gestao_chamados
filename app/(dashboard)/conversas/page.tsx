import { auth } from '@/auth';
// O teto de mensagens mora em `lib/conversas/config.ts`, que é só de servidor:
// a tela o recebe daqui em vez de guardar uma cópia própria.
import { CONVERSA_MENSAGENS_MAX } from '@/lib/conversas/config';
import { requireSession } from '@/lib/dal';

import { PainelConversa } from './_components/PainelConversa';

/**
 * A tela de boas vindas (spec 0003, AC-3). Abrir `Nova conversa` não grava
 * nada: a conversa só nasce no banco quando a primeira mensagem é enviada, e
 * quem cuida disso é a rota `POST /api/conversas/mensagens`.
 */

export const dynamic = 'force-dynamic';

function primeiroNome(nome: string | null | undefined): string | null {
  const limpo = nome?.trim();
  if (!limpo) return null;
  return limpo.split(/\s+/)[0] ?? null;
}

export default async function ConversasPage() {
  await requireSession();

  // `session.user.name` vem do AD (ou do username, na falta dele). Sem nome, a
  // saudação é só `Olá`.
  const sessao = await auth();

  return (
    <PainelConversa
      // A `key` por conversa faz o painel remontar na troca, e o estado local
      // do envio nasce limpo sem efeito de sincronização.
      key="nova"
      conversa={null}
      primeiroNome={primeiroNome(sessao?.user?.name)}
      mensagensMax={CONVERSA_MENSAGENS_MAX}
    />
  );
}
