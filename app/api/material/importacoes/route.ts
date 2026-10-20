import { NextResponse } from 'next/server';

import { isAdmin, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { enviarImportacaoAnexoV, enviarImportacaoSinapi } from '@/lib/material/importacao/pendente';
import { referenciaSinapi } from '@/shared/material/cotacao.schemas';
import { TAMANHO_MAXIMO_IMPORTACAO_MATERIAL } from '@/shared/material/material.constants';
import { ERROS_IMPORTACAO_MATERIAL } from '@/shared/material/mensagens';

/**
 * Envio do CSV do Anexo V e do SINAPI (spec 0019, AC-24, AC-25). Rota e não
 * Server Action, como o importador do SICAM: o limite de corpo das actions é
 * de 1 MB e o arquivo vai até 10 MB. O arquivo só é lido em memória; o que
 * fica é a importação `pendente` com a revisão, até o Admin aplicar.
 */
export async function POST(req: Request) {
  const sessao = await verifySession();
  if (!sessao) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  if (!isAdmin(sessao.role)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  // Recusa cedo pelo cabeçalho, antes de ler o corpo inteiro.
  const tamanhoDeclarado = Number(req.headers.get('content-length') ?? 0);
  if (tamanhoDeclarado > TAMANHO_MAXIMO_IMPORTACAO_MATERIAL + 64 * 1024) {
    return NextResponse.json({ error: ERROS_IMPORTACAO_MATERIAL.arquivo_grande }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: ERROS_IMPORTACAO_MATERIAL.arquivo_ausente }, { status: 400 });
  }
  const arquivo = form.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ error: ERROS_IMPORTACAO_MATERIAL.arquivo_ausente }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO_IMPORTACAO_MATERIAL) {
    return NextResponse.json({ error: ERROS_IMPORTACAO_MATERIAL.arquivo_grande }, { status: 413 });
  }

  const tipo = form.get('tipo');
  const contratoId = form.get('contratoId');
  const referencia = form.get('referencia');
  if (tipo === 'anexo_v' && (typeof contratoId !== 'string' || !contratoId)) {
    return NextResponse.json(
      { error: ERROS_IMPORTACAO_MATERIAL.contrato_ausente },
      { status: 422 },
    );
  }
  if (tipo === 'sinapi' && !referenciaSinapi.safeParse(referencia).success) {
    return NextResponse.json(
      { error: ERROS_IMPORTACAO_MATERIAL.referencia_invalida },
      { status: 422 },
    );
  }
  if (tipo !== 'anexo_v' && tipo !== 'sinapi') {
    return NextResponse.json({ error: 'Tipo de importação inválido.' }, { status: 400 });
  }

  try {
    await dbConnect();
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const arquivoNome = (arquivo.name || `${tipo}.csv`).slice(0, 200);
    const r =
      tipo === 'anexo_v'
        ? await enviarImportacaoAnexoV({
            contratoId: contratoId as string,
            arquivoNome,
            bytes,
            autorId: sessao.userId,
          })
        : await enviarImportacaoSinapi({
            referencia: referencia as string,
            arquivoNome,
            bytes,
            autorId: sessao.userId,
          });
    if (!r.ok) {
      const { status, ...corpo } = r;
      return NextResponse.json(corpo, { status });
    }
    return NextResponse.json({ id: r.id }, { status: 201 });
  } catch (e) {
    console.error('[material] importação:', e);
    return NextResponse.json(
      { error: 'Não foi possível ler o arquivo agora. Tente de novo.' },
      { status: 500 },
    );
  }
}
