import 'server-only';

import { NextResponse } from 'next/server';

import type { RespostaIniciada } from '@/lib/assistente';
import type { Viewer } from '@/lib/conversas';
import { verifySession } from '@/lib/dal';
import type { ConversaFalha } from '@/shared/conversas/conversa.constants';
import { conversaTextoSchema } from '@/shared/conversas/conversa.schemas';
import { type QuadroResposta, serializarQuadro } from '@/shared/conversas/quadro.schemas';

/**
 * O que as duas rotas de envio têm em comum (spec 0003): sessão, leitura do
 * corpo, tradução de motivo em status e a transformação do gerador de quadros
 * em uma resposta NDJSON. A diferença entre elas é só o começo: a rota sem `id`
 * é a dona da criação do rascunho.
 */

/** Motivos que a rota devolve com 404, para não revelar conversa de outra pessoa. */
const ESCONDIDOS: ConversaFalha[] = ['nao_encontrada', 'sem_permissao'];

const STATUS: Record<ConversaFalha, number> = {
  invalida: 400,
  nao_encontrada: 404,
  sem_permissao: 404,
  limite_rascunhos: 409,
  limite_mensagens: 409,
  confirmacao_em_andamento: 409,
  ja_existe: 409,
  erro: 500,
};

/** Sessão verificada ou 401. Rota de API responde em JSON, nunca redireciona. */
export async function exigirViewer(): Promise<
  { ok: true; viewer: Viewer } | { ok: false; resposta: NextResponse }
> {
  const sessao = await verifySession();
  if (!sessao) {
    return {
      ok: false,
      resposta: NextResponse.json({ reason: 'sem_sessao' }, { status: 401 }),
    };
  }
  return { ok: true, viewer: { userId: sessao.userId, role: sessao.role } };
}

/** Texto do corpo, validado pelo mesmo schema que `lib/conversas` aplica. */
export async function lerTexto(
  request: Request,
): Promise<{ ok: true; texto: string } | { ok: false; resposta: NextResponse }> {
  let corpo: unknown = null;
  try {
    corpo = await request.json();
  } catch {
    return { ok: false, resposta: falha('invalida') };
  }

  const texto = conversaTextoSchema.safeParse(
    typeof corpo === 'object' && corpo !== null ? (corpo as { texto?: unknown }).texto : undefined,
  );
  if (!texto.success) return { ok: false, resposta: falha('invalida') };

  return { ok: true, texto: texto.data };
}

/**
 * Motivo de `lib/conversas` virando resposta HTTP. `sem_permissao` responde com
 * o mesmo corpo de `nao_encontrada`, de propósito (AC-1).
 */
export function falha(reason: ConversaFalha): NextResponse {
  const exposto = ESCONDIDOS.includes(reason) ? 'nao_encontrada' : reason;
  return NextResponse.json({ reason: exposto }, { status: STATUS[reason] ?? 500 });
}

/**
 * Os quadros como NDJSON, um por linha. O corpo começa a sair no primeiro
 * quadro, que é o que faz o texto crescer na tela enquanto o modelo escreve.
 */
export function emQuadros(quadros: AsyncGenerator<QuadroResposta>): Response {
  const encoder = new TextEncoder();

  const corpo = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const quadro of quadros) {
          controller.enqueue(encoder.encode(serializarQuadro(quadro)));
        }
      } catch (err) {
        // O gerador não lança por falha da IA; se chegou aqui é defeito nosso.
        // A conexão fecha e a tela mostra o que já recebeu, sem quebrar.
        console.error('[conversas] fluxo interrompido:', err instanceof Error ? err.name : 'erro');
      } finally {
        controller.close();
      }
    },
    cancel() {
      // A pessoa fechou a aba. O `signal` da requisição já aborta a chamada ao
      // modelo e devolve a vaga na GPU; aqui não sobra nada a fazer.
    },
  });

  return new Response(corpo, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // O deploy fica atrás do nginx, que bufferiza respostas por padrão e
      // entregaria tudo de uma vez, matando o efeito do streaming.
      'X-Accel-Buffering': 'no',
    },
  });
}

/** Quadros ou falha, o mesmo desfecho nas duas rotas. */
export function responder(iniciada: RespostaIniciada): Response {
  return iniciada.ok ? emQuadros(iniciada.quadros) : falha(iniciada.reason);
}
