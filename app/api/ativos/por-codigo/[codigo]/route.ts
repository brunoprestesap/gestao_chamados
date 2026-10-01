import { NextResponse } from 'next/server';

import { normalizarCodigo } from '@/lib/ativos/codigo';
import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { AtivoModel } from '@/models/Ativo';

/**
 * Leitura de etiqueta (spec 0011, AC-11): o código lido ou digitado passa por
 * `normalizarCodigo` (`00011997` acha `11997`). Qualquer sessão; achar o
 * ativo não depende de tier nem de status.
 */
/**
 * O Next já pode entregar o parâmetro decodificado; decodificar de novo um
 * texto com `%` solto lança `URIError`. Na falha, vale o texto como veio.
 */
function decodificar(bruto: string): string {
  try {
    return decodeURIComponent(bruto);
  } catch {
    return bruto;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { codigo: bruto } = await params;
  const codigo = normalizarCodigo(decodificar(bruto));
  if (!codigo) {
    return NextResponse.json({ error: 'Ativo não cadastrado', codigo }, { status: 404 });
  }

  await dbConnect();
  const ativo = await AtivoModel.findOne({ codigo }).select('_id codigo').lean();
  if (!ativo) {
    return NextResponse.json({ error: 'Ativo não cadastrado', codigo }, { status: 404 });
  }
  return NextResponse.json({ id: String(ativo._id), codigo: ativo.codigo });
}
