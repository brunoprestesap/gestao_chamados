import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { MIME_ARQUIVO_COTACAO, salvarArquivoCotacao } from '@/lib/material/arquivos';
import { detectMimeType } from '@/lib/uploads/arquivo';
import {
  MAX_TAMANHO_ARQUIVO_COTACAO,
  type TipoArquivoCotacao,
  TIPOS_ARQUIVO_COTACAO,
} from '@/shared/material/material.constants';

const ERRO_GRANDE = 'O arquivo passa de 20 MB. Envie um arquivo menor.';
const ERRO_TIPO = 'Tipo de arquivo não aceito. Envie PDF, JPEG ou PNG.';

/**
 * Upload de arquivo da cotação de material (spec 0019): orçamento, evidência
 * ou nota fiscal. Rota e não Server Action, pelo limite de corpo; fica fora
 * do matcher do `proxy.ts`, e o nginx aceita 21M neste caminho.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await verifySession();
  if (!sessao) return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Cotação não encontrada.' }, { status: 404 });
  }

  const tamanhoDeclarado = Number(req.headers.get('content-length') ?? 0);
  if (tamanhoDeclarado > MAX_TAMANHO_ARQUIVO_COTACAO + 64 * 1024) {
    return NextResponse.json({ ok: false, error: ERRO_GRANDE }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Envie o arquivo.' }, { status: 400 });
  }
  const tipo = form.get('tipo');
  if (typeof tipo !== 'string' || !(TIPOS_ARQUIVO_COTACAO as readonly string[]).includes(tipo)) {
    return NextResponse.json({ ok: false, error: 'Tipo de arquivo inválido.' }, { status: 400 });
  }
  const arquivo = form.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ ok: false, error: 'Envie o arquivo.' }, { status: 400 });
  }
  if (arquivo.size > MAX_TAMANHO_ARQUIVO_COTACAO) {
    return NextResponse.json({ ok: false, error: ERRO_GRANDE }, { status: 413 });
  }
  const conteudo = new Uint8Array(await arquivo.arrayBuffer());
  if (conteudo.byteLength > MAX_TAMANHO_ARQUIVO_COTACAO) {
    return NextResponse.json({ ok: false, error: ERRO_GRANDE }, { status: 413 });
  }
  const mime = detectMimeType(conteudo);
  if (!mime || !(MIME_ARQUIVO_COTACAO as readonly string[]).includes(mime)) {
    return NextResponse.json({ ok: false, error: ERRO_TIPO }, { status: 415 });
  }

  try {
    await dbConnect();
    const r = await salvarArquivoCotacao({
      cotacaoId: id,
      tipo: tipo as TipoArquivoCotacao,
      conteudo,
      nomeOriginal: arquivo.name || 'arquivo',
      mimeType: mime,
      sessao: { userId: sessao.userId, role: sessao.role },
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    revalidatePath(`/cotacoes/${id}`);
    return NextResponse.json({ ok: true, arquivoId: r.arquivoId }, { status: 201 });
  } catch (e) {
    console.error('[material] erro no upload:', e);
    return NextResponse.json(
      { ok: false, error: 'Não deu para salvar o arquivo. Tente de novo.' },
      { status: 500 },
    );
  }
}
