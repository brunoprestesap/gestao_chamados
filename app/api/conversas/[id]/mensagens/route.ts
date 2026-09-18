import { responderNaConversa } from '@/lib/assistente';
import { dbConnect } from '@/lib/db';
import { objectIdSchema } from '@/shared/conversas/conversa.schemas';

import { exigirViewer, falha, lerTexto, responder } from '../../_lib/fluxo';

/**
 * Mensagens seguintes de uma conversa que já existe (spec 0003, AC-5). Esta
 * rota nunca cria nem descarta rascunho: assim que a tela conhece o
 * `conversaId`, toda tentativa vem para cá, e nova tentativa nunca gera um
 * segundo rascunho (AC-4).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const sessao = await exigirViewer();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await params;
  if (!objectIdSchema.safeParse(id).success) return falha('nao_encontrada');

  const corpo = await lerTexto(request);
  if (!corpo.ok) return corpo.resposta;

  await dbConnect();

  const iniciada = await responderNaConversa({
    viewer: sessao.viewer,
    conversaId: id,
    texto: corpo.texto,
    signal: request.signal,
  });

  return responder(iniciada);
}
