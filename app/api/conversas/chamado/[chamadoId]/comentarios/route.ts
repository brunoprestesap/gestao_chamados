import { NextResponse } from 'next/server';

import { criarComentario } from '@/lib/chamados/comentarios';
import { dbConnect } from '@/lib/db';
import { AddCommentSchema } from '@/shared/chamados/comment.schemas';

import { exigirViewer } from '../../../_lib/fluxo';

/**
 * Comentário pela tela de conversas (spec 0005). Rota nova e simples: JSON
 * comum, sem IA e sem NDJSON, porque aqui não há resposta para transmitir aos
 * poucos. Chama `criarComentario` direto, com o `chamadoId` do próprio
 * caminho: nunca depende de existir uma Conversa (AC-9).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ chamadoId: string }> },
): Promise<Response> {
  const sessao = await exigirViewer();
  if (!sessao.ok) return sessao.resposta;

  const { chamadoId } = await params;

  let corpo: unknown = null;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ reason: 'invalida' }, { status: 400 });
  }

  const campo = (nome: string) =>
    typeof corpo === 'object' && corpo !== null
      ? (corpo as Record<string, unknown>)[nome]
      : undefined;

  const parsed = AddCommentSchema.safeParse({
    chamadoId,
    content: campo('texto'),
    visibility: campo('visibility'),
  });
  if (!parsed.success) {
    return NextResponse.json({ reason: 'invalida' }, { status: 400 });
  }

  await dbConnect();

  const resultado = await criarComentario({
    chamadoId: parsed.data.chamadoId,
    autorUserId: sessao.viewer.userId,
    autorRole: sessao.viewer.role,
    content: parsed.data.content,
    visibility: parsed.data.visibility,
  });

  if (!resultado.ok) {
    // Chamado inexistente e sem permissão respondem igual, para não revelar
    // que o chamado existe (spec 0005, AC-11).
    return NextResponse.json({ reason: 'nao_encontrada' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: resultado.id, visibility: resultado.visibility });
}
