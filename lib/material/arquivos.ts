import 'server-only';

import fs from 'fs/promises';
import { Types } from 'mongoose';

import { mimeToExt, resolverCaminhoSeguro, UPLOADS_ROOT } from '@/lib/uploads/arquivo';
import { ArquivoCotacaoModel } from '@/models/ArquivoCotacao';
import { ChamadoModel } from '@/models/Chamado';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import {
  MAX_ARQUIVOS_POR_TIPO,
  type SituacaoCotacao,
  SITUACOES_EDITAVEIS,
  type TipoArquivoCotacao,
} from '@/shared/material/material.constants';

import { papeisDe } from './papeis';
import { podeBaixar, visaoDe } from './serializar';

/**
 * Arquivos da cotação de material (spec 0019): orçamento e nota fiscal do
 * responsável técnico, evidência do técnico atribuído. Disco em
 * `cotacoes/<cotacaoId>/<arquivoId>.<ext>`, nunca com o nome original.
 */

export const MIME_ARQUIVO_COTACAO = ['application/pdf', 'image/jpeg', 'image/png'] as const;

const SUBDIR = 'cotacoes';

/**
 * Remover um arquivo (só marca `removidoEm`) vale em `rascunho` e
 * `devolvida`. Exceção estreita (AC-22): na `atestada`, o arquivo de nota
 * fiscal ainda não ligado a `notaFiscal.arquivoId`, para uma tentativa
 * recusada não deixar um arquivo preso nem travar o limite de 10.
 */
export function podeRemoverArquivo(
  arq: { _id: Types.ObjectId | string; tipo: TipoArquivoCotacao },
  cot: { situacao: SituacaoCotacao; notaFiscal?: { arquivoId: Types.ObjectId | string } | null },
): boolean {
  if (SITUACOES_EDITAVEIS.includes(cot.situacao)) return true;
  return (
    cot.situacao === 'atestada' &&
    arq.tipo === 'nota_fiscal' &&
    String(cot.notaFiscal?.arquivoId ?? '') !== String(arq._id)
  );
}

export function caminhoDoArquivoCotacao(caminhoRelativo: string): string | null {
  const partes = caminhoRelativo.split('/');
  if (partes.length !== 3 || partes[0] !== SUBDIR) return null;
  const r = resolverCaminhoSeguro(UPLOADS_ROOT, `${SUBDIR}/${partes[1]}`, partes[2]);
  return r?.arquivo ?? null;
}

type Falha = { ok: false; status: number; error: string };

/** Quem envia cada tipo, e em que situação. */
async function conferirEnvio(
  cotacaoId: string,
  tipo: TipoArquivoCotacao,
  sessao: { userId: string; role: string },
): Promise<{ ok: true } | Falha> {
  const cot = await CotacaoMaterialModel.findById(cotacaoId).select('situacao chamadoId').lean();
  if (!cot) return { ok: false, status: 404, error: 'Cotação não encontrada.' };
  const situacao = cot.situacao as SituacaoCotacao;
  if (tipo === 'evidencia') {
    const chamado = await ChamadoModel.findById(cot.chamadoId).select('assignedToUserId').lean();
    if (String(chamado?.assignedToUserId ?? '') !== sessao.userId) {
      return { ok: false, status: 403, error: 'Só o técnico atribuído envia evidência.' };
    }
    if (situacao !== 'autorizada') {
      return { ok: false, status: 409, error: 'A evidência é enviada com a cotação autorizada.' };
    }
    return { ok: true };
  }
  const papeis = await papeisDe(sessao.userId, sessao.role);
  if (!papeis.tem('responsavel_tecnico')) {
    return { ok: false, status: 403, error: 'Só o responsável técnico envia este arquivo.' };
  }
  if (tipo === 'orcamento' && !SITUACOES_EDITAVEIS.includes(situacao)) {
    return { ok: false, status: 409, error: 'A cotação não está mais em edição.' };
  }
  if (tipo === 'nota_fiscal' && situacao !== 'atestada') {
    return { ok: false, status: 409, error: 'A nota fiscal só é aceita depois do ateste.' };
  }
  return { ok: true };
}

export async function salvarArquivoCotacao(params: {
  cotacaoId: string;
  tipo: TipoArquivoCotacao;
  conteudo: Uint8Array;
  nomeOriginal: string;
  mimeType: string;
  sessao: { userId: string; role: string };
}): Promise<{ ok: true; arquivoId: string } | Falha> {
  const conferido = await conferirEnvio(params.cotacaoId, params.tipo, params.sessao);
  if (!conferido.ok) return conferido;
  const cotacaoId = new Types.ObjectId(params.cotacaoId);
  const ativos = await ArquivoCotacaoModel.countDocuments({
    cotacaoId,
    tipo: params.tipo,
    removidoEm: null,
  });
  if (ativos >= MAX_ARQUIVOS_POR_TIPO) {
    return { ok: false, status: 409, error: `Até ${MAX_ARQUIVOS_POR_TIPO} arquivos deste tipo.` };
  }

  const arquivoId = new Types.ObjectId();
  const nome = `${String(arquivoId)}${mimeToExt(params.mimeType)}`;
  const destino = resolverCaminhoSeguro(UPLOADS_ROOT, `${SUBDIR}/${params.cotacaoId}`, nome);
  if (!destino?.arquivo) return { ok: false, status: 400, error: 'Caminho inválido.' };
  await fs.mkdir(destino.dir, { recursive: true });
  await fs.writeFile(destino.arquivo, params.conteudo);
  try {
    await ArquivoCotacaoModel.create({
      _id: arquivoId,
      cotacaoId,
      tipo: params.tipo,
      nomeOriginal: params.nomeOriginal.slice(0, 255),
      mimeType: params.mimeType,
      tamanho: params.conteudo.byteLength,
      caminho: `${SUBDIR}/${params.cotacaoId}/${nome}`,
      enviadoPorUserId: new Types.ObjectId(params.sessao.userId),
      em: new Date(),
    });
  } catch (e) {
    await fs.unlink(destino.arquivo).catch(() => {});
    throw e;
  }
  return { ok: true, arquivoId: String(arquivoId) };
}

/** O arquivo para download, se quem pede pode baixá-lo (AC-15). */
export async function arquivoParaBaixar(
  arquivoId: string,
  sessao: { userId: string; role: string },
): Promise<
  | { ok: true; caminho: string; nomeOriginal: string; mimeType: string }
  | { ok: false; status: number }
> {
  if (!Types.ObjectId.isValid(arquivoId)) return { ok: false, status: 404 };
  const arq = await ArquivoCotacaoModel.findOne({ _id: arquivoId, removidoEm: null }).lean();
  if (!arq) return { ok: false, status: 404 };
  const cot = await CotacaoMaterialModel.findById(arq.cotacaoId)
    .select('chamadoId situacao emTramite updatedAt notaFiscal')
    .lean();
  if (!cot) return { ok: false, status: 404 };
  const chamado = await ChamadoModel.findById(cot.chamadoId)
    .select('assignedToUserId solicitanteId')
    .lean();
  const papeis = await papeisDe(sessao.userId, sessao.role);
  const visao = visaoDe(
    {
      userId: sessao.userId,
      papeis,
      ehTecnicoAtribuido: String(chamado?.assignedToUserId ?? '') === sessao.userId,
      ehSolicitante: String(chamado?.solicitanteId ?? '') === sessao.userId,
    },
    {
      situacao: cot.situacao as SituacaoCotacao,
      emTramite: cot.emTramite,
      updatedAt: cot.updatedAt,
      notaFiscal: cot.notaFiscal ?? null,
    },
  );
  if (!visao || !podeBaixar(visao, arq.tipo as TipoArquivoCotacao)) {
    return { ok: false, status: 403 };
  }
  const caminho = caminhoDoArquivoCotacao(arq.caminho);
  if (!caminho) return { ok: false, status: 404 };
  return { ok: true, caminho, nomeOriginal: arq.nomeOriginal, mimeType: arq.mimeType };
}
