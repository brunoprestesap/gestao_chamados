import { NextResponse } from 'next/server';

import { TAMANHO_MAXIMO_ARQUIVO } from '@/lib/ativos/importacao/layout';
import { decodificarCp1252, parseSicam } from '@/lib/ativos/importacao/parse';
import { registrarImportacao } from '@/lib/ativos/importacao/pendente';
import { isAdmin, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ERRO_ARQUIVO_GRANDE } from '@/shared/ativos/importacao.constants';

/**
 * Upload do export bruto do SICAM (spec 0012, AC-17, AC-21 e AC-27). Rota e
 * não Server Action: o limite de corpo das actions é global (1 MB), e subir
 * para 10 MB valeria para o app todo. O arquivo só é lido em memória, nunca
 * gravado em disco (tem nome e matrícula), e o log leva só contagens.
 */
export async function POST(req: Request) {
  const sessao = await verifySession();
  if (!sessao) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  if (!isAdmin(sessao.role)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  // Recusa cedo pelo cabeçalho, antes de ler o corpo inteiro.
  const tamanhoDeclarado = Number(req.headers.get('content-length') ?? 0);
  if (tamanhoDeclarado > TAMANHO_MAXIMO_ARQUIVO + 64 * 1024) {
    return NextResponse.json({ error: ERRO_ARQUIVO_GRANDE }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Envie o arquivo do SICAM.' }, { status: 400 });
  }
  const arquivo = form.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ error: 'Envie o arquivo do SICAM.' }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
    return NextResponse.json({ error: ERRO_ARQUIVO_GRANDE }, { status: 413 });
  }

  const parse = parseSicam(decodificarCp1252(await arquivo.arrayBuffer()));
  if (!parse.ok) return NextResponse.json({ error: parse.error }, { status: 400 });

  try {
    await dbConnect();
    const r = await registrarImportacao({
      arquivoNome: arquivo.name || 'sicam.csv',
      autorId: sessao.userId,
      linhas: parse.linhas,
      codigosAceitos: parse.codigosAceitos,
      contagensParse: {
        linhasLidas: parse.linhasLidas,
        linhasReparadas: parse.linhasReparadas,
        linhasAceitas: parse.linhasAceitas,
        linhasDuplicadas: parse.linhasDuplicadas,
        valoresIlegiveis: parse.valoresIlegiveis,
      },
      substituirPendente: form.get('substituirPendente') === 'true',
    });
    if (!r.ok) return NextResponse.json({ pendente: r.conflito }, { status: 409 });
    return NextResponse.json({ id: r.id }, { status: 201 });
  } catch (e) {
    console.error('[importacao] upload:', e);
    return NextResponse.json(
      { error: 'Não foi possível ler o arquivo agora. Tente de novo.' },
      { status: 500 },
    );
  }
}
