import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

import { cadastrarDocumento } from '@/lib/ativos/documentos/gravar';
import { canManage, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { detectMimeType, montarNomeEmDisco } from '@/lib/uploads/arquivo';
import {
  MAX_TAMANHO_DOCUMENTO,
  MAX_TAMANHO_DOCUMENTO_TEXTO,
  MIME_DOCUMENTO_ACEITOS,
} from '@/shared/ativos/documento.constants';
import { CadastrarDocumentoSchema } from '@/shared/ativos/documento.schemas';

const ERRO_GRANDE = `O arquivo passa de ${MAX_TAMANHO_DOCUMENTO_TEXTO}. Envie um arquivo menor.`;
const ERRO_TIPO = 'Tipo de arquivo não aceito. Envie PDF, JPEG, PNG ou WebP.';

function texto(form: FormData, campo: string): string | undefined {
  const v = form.get(campo);
  return typeof v === 'string' ? v : undefined;
}

/**
 * Cadastro de documento com arquivo (spec 0013, AC-3, AC-4 e AC-15). Rota e não
 * Server Action: o limite de corpo das actions é global (1 MB). Fica fora do
 * matcher do `proxy.ts` para o corpo de até 20 MB chegar inteiro, e o nginx
 * aceita 21M só neste caminho.
 */
export async function POST(req: Request) {
  const sessao = await verifySession();
  if (!sessao) return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  if (!canManage(sessao.role)) {
    return NextResponse.json(
      { ok: false, error: 'Sem permissão para esta ação.' },
      { status: 403 },
    );
  }

  // Recusa cedo pelo cabeçalho, antes de ler o corpo inteiro.
  const tamanhoDeclarado = Number(req.headers.get('content-length') ?? 0);
  if (tamanhoDeclarado > MAX_TAMANHO_DOCUMENTO + 64 * 1024) {
    return NextResponse.json({ ok: false, error: ERRO_GRANDE }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Envie o arquivo do documento.' },
      { status: 400 },
    );
  }

  const parsed = CadastrarDocumentoSchema.safeParse({
    tipo: texto(form, 'tipo'),
    ativoId: texto(form, 'ativoId'),
    localizacaoId: texto(form, 'localizacaoId'),
    numero: texto(form, 'numero'),
    emitidoPor: texto(form, 'emitidoPor'),
    emitidoEm: texto(form, 'emitidoEm'),
    validadeAte: texto(form, 'validadeAte'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' },
      { status: 400 },
    );
  }

  const arquivo = form.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json(
      { ok: false, error: 'Envie o arquivo do documento.' },
      { status: 400 },
    );
  }
  if (arquivo.size > MAX_TAMANHO_DOCUMENTO) {
    return NextResponse.json({ ok: false, error: ERRO_GRANDE }, { status: 413 });
  }
  const conteudo = new Uint8Array(await arquivo.arrayBuffer());
  if (conteudo.byteLength > MAX_TAMANHO_DOCUMENTO) {
    return NextResponse.json({ ok: false, error: ERRO_GRANDE }, { status: 413 });
  }
  const mime = detectMimeType(conteudo);
  if (!mime || !(MIME_DOCUMENTO_ACEITOS as readonly string[]).includes(mime)) {
    return NextResponse.json({ ok: false, error: ERRO_TIPO }, { status: 415 });
  }

  try {
    await dbConnect();
    const r = await cadastrarDocumento(
      parsed.data,
      {
        conteudo,
        originalName: arquivo.name || 'documento',
        mimeType: mime,
        filename: montarNomeEmDisco(arquivo.name || 'documento', mime),
      },
      sessao.userId,
    );
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });

    if (parsed.data.ativoId) revalidatePath(`/ativos/${parsed.data.ativoId}`);
    revalidatePath('/ativos/documentos');
    return NextResponse.json(
      { ok: true, id: r.id, ...(r.substituidoId ? { substituidoId: r.substituidoId } : {}) },
      { status: 201 },
    );
  } catch (e) {
    console.error('[documentos] erro ao cadastrar:', e);
    return NextResponse.json(
      { ok: false, error: 'Não deu para salvar o documento. Tente de novo.' },
      { status: 500 },
    );
  }
}
