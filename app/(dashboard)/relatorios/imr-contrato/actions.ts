'use server';

import { Types } from 'mongoose';
import { revalidatePath } from 'next/cache';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { papelNoImr } from '@/lib/imr-contrato/acesso';
import { fecharMesImr, reabrirMesImr } from '@/lib/imr-contrato/fechamento';
import { montarPreviaImr } from '@/lib/imr-contrato/leitura';
import { ImrMarcacaoModel } from '@/models/ImrMarcacao';
import {
  MENSAGENS_FECHAMENTO as F,
  MENSAGENS_MARCACAO as M,
  mesmoNumero,
} from '@/shared/imr-contrato/imr-contrato.constants';
import {
  BuscarChamadoDaBaseSchema,
  FecharMesImrSchema,
  type MarcarImrInput,
  MarcarImrSchema,
  ReabrirMesImrSchema,
} from '@/shared/imr-contrato/imr-contrato.schemas';
import type { LinhaI3, LinhaI4 } from '@/shared/imr-contrato/imr-contrato.types';

/**
 * Marcações, fechamento e reabertura do fiscal e do gestor no IMR do contrato
 * (spec 0023, AC-7 a AC-11). O servidor confere papel, mês, base e estado
 * atual; esconder o botão é só conforto. Nunca lança.
 */

type Resultado<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const ERRO_GENERICO = 'Não foi possível concluir agora. Tente de novo.';
const CAMINHO = '/relatorios/imr-contrato';

/** Por que o tipo pedido não cabe no estado atual do alvo; null quando cabe. */
function incoerencia(tipo: MarcarImrInput['tipo'], linha: LinhaI3 | LinhaI4): string | null {
  switch (tipo) {
    case 'desconsiderar':
      if (!linha.atraso) return M.semAtraso;
      return linha.desconsideracao ? M.jaDesconsiderada : null;
    case 'desfazer_desconsiderar':
      return linha.desconsideracao ? null : M.semDesconsideracao;
    case 'nao_atendimento':
      return linha.naoAtendimento ? M.jaNaoAtendimento : null;
    case 'desfazer_nao_atendimento':
      return linha.naoAtendimento ? null : M.semNaoAtendimento;
  }
}

async function sessaoComPapel(semPapel: string = M.semPapel) {
  const sessao = await verifySession();
  if (!sessao) return { erro: 'Sessão expirada. Entre de novo.' } as const;
  await dbConnect();
  const papel = await papelNoImr(sessao.userId, sessao.role);
  if (!papel) return { erro: semPapel } as const;
  return { sessao, papel } as const;
}

export async function marcarImrAction(input: unknown): Promise<Resultado> {
  try {
    const parsed = MarcarImrSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const d = parsed.data;
    const acesso = await sessaoComPapel();
    if ('erro' in acesso) return { ok: false, error: acesso.erro ?? M.semPapel };

    const previa = await montarPreviaImr({ contratoId: d.contratoId, competencia: d.competencia });
    if (!previa.ok) return { ok: false, error: M.mesIndisponivel };
    if (previa.estado.fechado) return { ok: false, error: F.mesFechado };

    const linha = (d.indicador === 3 ? previa.baseI3 : previa.baseI4).get(d.alvoId);
    if (!linha) return { ok: false, error: d.indicador === 3 ? M.foraDaBase3 : M.foraDaBase4 };
    const recusa = incoerencia(d.tipo, linha);
    if (recusa) return { ok: false, error: recusa };

    await ImrMarcacaoModel.create({
      contratoId: new Types.ObjectId(d.contratoId),
      competencia: d.competencia,
      indicador: d.indicador,
      alvoTipo: d.alvoTipo,
      alvoId: new Types.ObjectId(d.alvoId),
      tipo: d.tipo,
      motivo: d.motivo,
      porUserId: new Types.ObjectId(acesso.sessao.userId),
      papel: acesso.papel,
      em: new Date(),
    });
    revalidatePath(CAMINHO);
    return { ok: true };
  } catch (e) {
    console.error('[imr-contrato] marcar:', e);
    return { ok: false, error: ERRO_GENERICO };
  }
}

export type ChamadoDaBase = {
  chamadoId: string;
  ticketNumber: string;
  descricao: string;
  solicitanteNome: string;
  /** ISO, para atravessar a fronteira do cliente. */
  prazo: string;
  naoAtendimentoVigente: boolean;
};

/** AC-8: acha o chamado da base do indicador 3 do mês pelo número. */
export async function buscarChamadoDaBaseAction(
  input: unknown,
): Promise<Resultado<{ chamado: ChamadoDaBase }>> {
  try {
    const parsed = BuscarChamadoDaBaseSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const d = parsed.data;
    const acesso = await sessaoComPapel();
    if ('erro' in acesso) return { ok: false, error: acesso.erro ?? M.semPapel };

    const previa = await montarPreviaImr({ contratoId: d.contratoId, competencia: d.competencia });
    if (!previa.ok) return { ok: false, error: M.mesIndisponivel };
    if (previa.estado.fechado) return { ok: false, error: F.mesFechado };

    const linha = [...previa.baseI3.values()].find((l) => mesmoNumero(l.ticketNumber, d.numero));
    if (!linha)
      return {
        ok: false,
        error: `O chamado ${d.numero} não está na base do indicador 3 deste mês.`,
      };
    return {
      ok: true,
      chamado: {
        chamadoId: linha.chamadoId,
        ticketNumber: linha.ticketNumber,
        descricao: linha.descricao,
        solicitanteNome: linha.solicitanteNome,
        prazo: linha.prazo.toISOString(),
        naoAtendimentoVigente: Boolean(linha.naoAtendimento),
      },
    };
  } catch (e) {
    console.error('[imr-contrato] buscar chamado:', e);
    return { ok: false, error: ERRO_GENERICO };
  }
}

/** AC-10: fecha o mês com os pontos dos indicadores 1 e 2. */
export async function fecharMesImrAction(input: unknown): Promise<Resultado<{ versao: number }>> {
  try {
    const parsed = FecharMesImrSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const acesso = await sessaoComPapel(F.semPapel);
    if ('erro' in acesso) return { ok: false, error: acesso.erro ?? F.semPapel };

    const r = await fecharMesImr(parsed.data, {
      userId: acesso.sessao.userId,
      papel: acesso.papel,
    });
    if (r.ok) revalidatePath(CAMINHO);
    return r;
  } catch (e) {
    console.error('[imr-contrato] fechar:', e);
    return { ok: false, error: ERRO_GENERICO };
  }
}

/** AC-11: reabre o mês fechado com motivo. */
export async function reabrirMesImrAction(input: unknown): Promise<Resultado> {
  try {
    const parsed = ReabrirMesImrSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }
    const acesso = await sessaoComPapel(F.semPapel);
    if ('erro' in acesso) return { ok: false, error: acesso.erro ?? F.semPapel };

    const r = await reabrirMesImr(parsed.data, {
      userId: acesso.sessao.userId,
      papel: acesso.papel,
    });
    if (r.ok) revalidatePath(CAMINHO);
    return r;
  } catch (e) {
    console.error('[imr-contrato] reabrir:', e);
    return { ok: false, error: ERRO_GENERICO };
  }
}
