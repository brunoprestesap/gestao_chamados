import 'server-only';

import { createHash } from 'node:crypto';

import { renderToBuffer } from '@react-pdf/renderer';
import { Types } from 'mongoose';

import { montarRelatorioContrato } from '@/lib/contratos/relatorio';
import { nomeDoUsuario } from '@/lib/contratos/usuario';
import { RelatorioContratoEmissaoModel } from '@/models/RelatorioContratoEmissao';
import { nomeDoArquivoPdf } from '@/shared/contratos/formato';

import { RelatorioContratoPdf } from './RelatorioContratoPdf';
import { soltarTrava, tentarPegarTrava } from './trava';

export const ERRO_PDF_OCUPADO = 'Outro relatório está sendo gerado. Tente em alguns segundos.';
export const ERRO_MES_FORA = 'Mês fora da vigência do contrato.';
export const ERRO_CONTRATO_INEXISTENTE = 'Contrato não encontrado.';
export const ERRO_PDF_FALHOU = 'Não foi possível gerar o PDF. Tente de novo.';

export type ResultadoPdf =
  | { ok: true; bytes: Buffer; nomeArquivo: string; emissaoId: string; hashSha256: string }
  | { ok: false; status: 404 | 422 | 429 | 500; error: string };

/**
 * Gera o PDF de um contrato e mês (AC-16 a AC-18): recalcula tudo, cria o
 * código da emissão, monta o PDF, calcula o SHA-256 dos bytes e grava a
 * emissão antes de devolver o arquivo. Nunca lança; quem chama já conferiu
 * sessão e perfil.
 */
export async function gerarPdfContrato(params: {
  contratoId: string;
  mes: string;
  userId: string;
  agora?: Date;
}): Promise<ResultadoPdf> {
  if (!tentarPegarTrava()) return { ok: false, status: 429, error: ERRO_PDF_OCUPADO };
  const { contratoId, mes } = params;
  try {
    const agora = params.agora ?? new Date();
    const geradoPorNome = await nomeDoUsuario(params.userId);
    const r = await montarRelatorioContrato({ contratoId, mes, agora, geradoPorNome });
    if (!r.ok) {
      return r.motivo === 'contrato_inexistente'
        ? { ok: false, status: 404, error: ERRO_CONTRATO_INEXISTENTE }
        : { ok: false, status: 422, error: ERRO_MES_FORA };
    }

    const emissaoId = new Types.ObjectId();
    const bytes = await renderToBuffer(
      <RelatorioContratoPdf dados={r.relatorio} emissaoId={String(emissaoId)} />,
    );
    const hashSha256 = createHash('sha256').update(bytes).digest('hex');

    await RelatorioContratoEmissaoModel.create({
      _id: emissaoId,
      contratoId: new Types.ObjectId(contratoId),
      mes,
      geradoPor: new Types.ObjectId(params.userId),
      geradoPorNome,
      geradoEm: agora,
      hashSha256,
    });

    return {
      ok: true,
      bytes,
      nomeArquivo: nomeDoArquivoPdf(r.relatorio.contrato.numero, mes),
      emissaoId: String(emissaoId),
      hashSha256,
    };
  } catch (e) {
    // Só o contrato, o mês e a mensagem (AC-18): nada de números nem nomes.
    console.error('[relatorio-contrato] falha ao gerar o PDF', {
      contratoId,
      mes,
      erro: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, status: 500, error: ERRO_PDF_FALHOU };
  } finally {
    soltarTrava();
  }
}
