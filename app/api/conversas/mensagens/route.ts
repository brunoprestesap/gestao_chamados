import { responderNaConversa } from '@/lib/assistente';
import { criarConversa, descartarRascunho } from '@/lib/conversas';
import { dbConnect } from '@/lib/db';

import { exigirViewer, falha, lerTexto, responder } from '../_lib/fluxo';

/**
 * Primeira mensagem de uma conversa nova (spec 0003, AC-3). Esta rota é a única
 * dona da sequência `criarConversa` → `enviarMensagem`: a conversa nasce no
 * banco só aqui, no envio, e nunca na abertura da tela de boas vindas.
 *
 * Se a mensagem não gravar, o rascunho recém criado é descartado antes de a
 * resposta voltar: um rascunho nunca fica vazio.
 */

// `lib/llm` e `lib/conversas` são só de servidor, nunca Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const sessao = await exigirViewer();
  if (!sessao.ok) return sessao.resposta;

  const corpo = await lerTexto(request);
  if (!corpo.ok) return corpo.resposta;

  await dbConnect();

  const criada = await criarConversa(sessao.viewer);
  if (!criada.ok) return falha(criada.reason);

  const iniciada = await responderNaConversa({
    viewer: sessao.viewer,
    conversaId: criada.conversaId,
    texto: corpo.texto,
    signal: request.signal,
  });

  if (!iniciada.ok) {
    // Nada sobra no banco: o rascunho que acabou de nascer sai junto com a
    // falha. `descartarRascunho` também não lança, então o motivo original é
    // o que a tela recebe.
    const descartado = await descartarRascunho(sessao.viewer, criada.conversaId);
    if (!descartado.ok) {
      console.error(
        '[conversas] rascunho orfao apos falha no envio:',
        JSON.stringify({ conversaId: criada.conversaId, motivo: descartado.reason }),
      );
    }
    return falha(iniciada.reason);
  }

  return responder(iniciada);
}
