import 'server-only';

import { createHash } from 'node:crypto';

import { renderToBuffer } from '@react-pdf/renderer';
import { Types } from 'mongoose';

import { soltarTrava, tentarPegarTrava } from '@/lib/contratos/pdf/trava';
import { nomeDoUsuario } from '@/lib/contratos/usuario';
import { lerDetalhe, type Sessao } from '@/lib/material/leitura';
import { papeisDe } from '@/lib/material/papeis';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { CotacaoMaterialPdfEmissaoModel } from '@/models/CotacaoMaterialPdfEmissao';
import { formatarDataHoraBelem } from '@/shared/contratos/formato';

import { CotacaoMaterialPdf } from './CotacaoMaterialPdf';

export const ERRO_PDF_OCUPADO = 'Outro PDF está sendo gerado. Tente em alguns segundos.';
export const ERRO_PDF_FALHOU = 'Não foi possível gerar o PDF. Tente de novo.';
export const ERRO_PDF_SEM_ACESSO =
  'O PDF da cotação é de quem tem designação de fiscal, gestor ou aprovador.';
export const ERRO_PDF_RASCUNHO = 'O PDF só existe depois que a cotação é enviada.';
export const ERRO_COTACAO_INEXISTENTE = 'Cotação não encontrada.';

export type ResultadoPdfCotacao =
  | { ok: true; bytes: Buffer; nomeArquivo: string; emissaoId: string; sha256: string }
  | { ok: false; status: 403 | 404 | 409 | 429 | 500; error: string };

/** Nome do arquivo: tudo que não for letra, dígito ou hífen no número vira `-`. */
export function nomeDoArquivoPdfCotacao(numero: string): string {
  return `cotacao-${numero.replace(/[^A-Za-z0-9-]/g, '-')}.pdf`;
}

/**
 * Gera o PDF da cotação (spec 0019, AC-23): lê o detalhe pela mesma visão da
 * tela (só o lado TRF1), cria o código da emissão, monta o PDF, calcula o
 * SHA-256 dos bytes e grava a emissão antes de devolver o arquivo. Uma
 * geração por vez no processo, com a mesma trava do relatório por contrato.
 * Nunca lança.
 */
export async function gerarPdfCotacao(params: {
  cotacaoId: string;
  sessao: Sessao;
  agora?: Date;
}): Promise<ResultadoPdfCotacao> {
  const { cotacaoId, sessao } = params;
  try {
    const cot = Types.ObjectId.isValid(cotacaoId)
      ? await CotacaoMaterialModel.findById(cotacaoId).select('situacao').lean()
      : null;
    if (!cot) return { ok: false, status: 404, error: ERRO_COTACAO_INEXISTENTE };
    // O PDF é documento oficial com emissão gravada: só quem tem papel do lado
    // TRF1. O Admin sem designação lê a cotação, mas não emite (AC-23).
    const papeis = await papeisDe(sessao.userId, sessao.role);
    if (!papeis.ladoTrf1) return { ok: false, status: 403, error: ERRO_PDF_SEM_ACESSO };
    if (cot.situacao === 'rascunho') return { ok: false, status: 409, error: ERRO_PDF_RASCUNHO };
    const detalhe = await lerDetalhe(cotacaoId, sessao);
    if (!detalhe || detalhe.cotacao.visao !== 'trf1') {
      return { ok: false, status: 403, error: ERRO_PDF_SEM_ACESSO };
    }
    if (!tentarPegarTrava()) return { ok: false, status: 429, error: ERRO_PDF_OCUPADO };
    try {
      const agora = params.agora ?? new Date();
      const geradoPorNome = await nomeDoUsuario(sessao.userId);
      const emissaoId = new Types.ObjectId();
      const bytes = await renderToBuffer(
        <CotacaoMaterialPdf
          detalhe={detalhe}
          emissaoId={String(emissaoId)}
          geradoEm={formatarDataHoraBelem(agora.toISOString())}
          geradoPorNome={geradoPorNome}
        />,
      );
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await CotacaoMaterialPdfEmissaoModel.create({
        _id: emissaoId,
        cotacaoId: new Types.ObjectId(cotacaoId),
        sha256,
        porUserId: new Types.ObjectId(sessao.userId),
        em: agora,
      });
      return {
        ok: true,
        bytes,
        nomeArquivo: nomeDoArquivoPdfCotacao(detalhe.cotacao.numero),
        emissaoId: String(emissaoId),
        sha256,
      };
    } finally {
      soltarTrava();
    }
  } catch (e) {
    // Só a cotação e a mensagem: nada de valores nem nomes.
    console.error('[material] falha ao gerar o PDF da cotação', {
      cotacaoId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, status: 500, error: ERRO_PDF_FALHOU };
  }
}
