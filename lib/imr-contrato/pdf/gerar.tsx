import 'server-only';

import { createHash } from 'node:crypto';

import { renderToBuffer } from '@react-pdf/renderer';
import { Types } from 'mongoose';

import { soltarTrava, tentarPegarTrava } from '@/lib/contratos/pdf/trava';
import { nomeDoUsuario } from '@/lib/contratos/usuario';
import { dbConnect } from '@/lib/db';
import { papeisDe } from '@/lib/material/papeis';
import { ImrFechamentoPdfEmissaoModel } from '@/models/ImrFechamentoPdfEmissao';
import { formatarDataHoraBelem } from '@/shared/contratos/formato';
import {
  MENSAGENS_PDF_IMR as M,
  type PapelEmissaoImr,
} from '@/shared/imr-contrato/imr-contrato.constants';

import { lerEstadoDoMes, lerFechamento } from '../estado';
import { reincidenciaDaFoto } from '../fechamento.regras';
import { ImrFechamentoPdf } from './ImrFechamentoPdf';

export type ResultadoPdfImr =
  | { ok: true; bytes: Buffer; nomeArquivo: string; emissaoId: string; sha256: string }
  | { ok: false; status: 403 | 409 | 429 | 500; error: string };

/** Nome do arquivo: tudo que não for letra, dígito ou hífen no número vira `-`. */
export function nomeDoArquivoPdfImr(numero: string, competencia: string, versao: number): string {
  return `imr-contrato-${numero.replace(/[^A-Za-z0-9-]/g, '-')}-${competencia}-v${versao}.pdf`;
}

/**
 * O papel gravado na emissão (AC-13, AC-14): `fiscal` ou `gestor` pela
 * designação vigente, `admin` para o perfil Admin sem elas; null sem acesso.
 * As designações só valem no perfil Admin, então quem não é Admin fica de fora.
 */
async function papelDaEmissao(userId: string, role: string): Promise<PapelEmissaoImr | null> {
  const papeis = await papeisDe(userId, role);
  if (papeis.role !== 'Admin') return null;
  if (papeis.tem('fiscal')) return 'fiscal';
  if (papeis.tem('gestor')) return 'gestor';
  return 'admin';
}

/**
 * Gera o PDF do fechamento vigente do mês (spec 0023, AC-13). Lê só a foto
 * gravada, sem recalcular; mês aberto (sem fechamento, ou com a maior versão
 * reaberta) responde 409. Cria o código da emissão, monta o PDF, calcula o
 * SHA-256 dos bytes e grava a emissão antes de devolver o arquivo. Divide a
 * trava de um PDF por vez com o relatório por contrato e a cotação de
 * material. Nunca lança.
 */
export async function gerarPdfImr(params: {
  contratoId: string;
  competencia: string;
  sessao: { userId: string; role: string };
  agora?: Date;
}): Promise<ResultadoPdfImr> {
  const { contratoId, competencia, sessao } = params;
  try {
    await dbConnect();
    const papel = await papelDaEmissao(sessao.userId, sessao.role);
    if (!papel) return { ok: false, status: 403, error: M.semAcesso };
    const estado = await lerEstadoDoMes(contratoId, competencia);
    if (!estado.fechado) return { ok: false, status: 409, error: M.mesAberto };
    const foto = await lerFechamento(contratoId, competencia, estado.maiorVersao);
    if (!foto) return { ok: false, status: 409, error: M.mesAberto };

    if (!tentarPegarTrava()) return { ok: false, status: 429, error: M.ocupado };
    try {
      const agora = params.agora ?? new Date();
      const geradoPorNome = await nomeDoUsuario(sessao.userId);
      const emissaoId = new Types.ObjectId();
      const bytes = await renderToBuffer(
        <ImrFechamentoPdf
          foto={foto}
          reincidencia={reincidenciaDaFoto(foto)}
          emissaoId={String(emissaoId)}
          geradoEm={formatarDataHoraBelem(agora.toISOString())}
          geradoPorNome={geradoPorNome}
        />,
      );
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      await ImrFechamentoPdfEmissaoModel.create({
        _id: emissaoId,
        fechamentoId: new Types.ObjectId(foto.id),
        sha256,
        porUserId: new Types.ObjectId(sessao.userId),
        papel,
        em: agora,
      });
      return {
        ok: true,
        bytes,
        nomeArquivo: nomeDoArquivoPdfImr(foto.contratoNumero, competencia, foto.versao),
        emissaoId: String(emissaoId),
        sha256,
      };
    } finally {
      soltarTrava();
    }
  } catch (e) {
    // Só o contrato, o mês e a mensagem: a foto tem nome de solicitante (LGPD).
    console.error('[imr-contrato] falha ao gerar o PDF do fechamento', {
      contratoId,
      competencia,
      erro: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, status: 500, error: M.falhou };
  }
}
