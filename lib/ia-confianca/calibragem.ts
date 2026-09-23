import 'server-only';

import { ABERTURA_TASK, PROMPT_VERSION } from '@/lib/assistente/prompt';
import { dbConnect } from '@/lib/db';
import { DecisaoIaModel } from '@/models/DecisaoIa';
import type { DecisaoSituacao } from '@/shared/conversas/conversa.constants';
import {
  IA_CONFIANCA_CAMPOS,
  type IaConfiancaCampo,
} from '@/shared/ia-confianca/ia-confianca.schemas';

/**
 * Medição de acurácia da IA contra o veredito que a classificação já grava
 * sozinha (spec 0006, `aplicarVeredito`/`derivarSituacao`). Sempre calculada
 * na hora, nunca lida de um retrato gravado (Key invariant do spec).
 */

/** Cortes de confiança acumulados, de 1.00 a 0.50. Lista literal fixa: nunca gerar por soma de ponto flutuante. */
export const CORTES_CONFIANCA: readonly number[] = [
  1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5,
];

/** Acurácia mínima que um corte precisa atingir pra virar sugestão automática. Constante de código, não editável pelo Admin. */
export const META_ACURACIA = 0.9;

type Amostra = { confianca: number; situacao: DecisaoSituacao };

export type LinhaCorte = {
  corte: number;
  total: number;
  /** `null` quando `total` é zero; a tela mostra um traço nesse caso. */
  percentualAcerto: number | null;
};

export type RelatorioCampo = {
  campo: IaConfiancaCampo;
  totalElegivel: number;
  amostraMinima: number;
  amostraSuficiente: boolean;
  /** Vazio quando a amostra é insuficiente (AC-3). */
  cortes: LinhaCorte[];
  /** Menor corte que bate acurácia e amostra mínima; `null` se nenhum bate (AC-4). */
  sugestao: number | null;
};

export type RelatorioCalibragem = Record<IaConfiancaCampo, RelatorioCampo>;

async function medirAmostra(campo: IaConfiancaCampo): Promise<Amostra[]> {
  await dbConnect();

  const docs = await DecisaoIaModel.find({
    campo,
    decididoPor: 'ia',
    efeito: 'sugestao',
    task: ABERTURA_TASK,
    promptVersion: PROMPT_VERSION,
    confianca: { $ne: null },
    revisadaEm: { $ne: null },
  })
    .select('confianca situacao')
    .lean();

  return docs
    .filter((doc): doc is typeof doc & { confianca: number } => typeof doc.confianca === 'number')
    .map((doc) => ({ confianca: doc.confianca, situacao: doc.situacao }));
}

function construirCortes(amostra: Amostra[]): LinhaCorte[] {
  return CORTES_CONFIANCA.map((corte) => {
    const acima = amostra.filter((item) => item.confianca >= corte);
    const total = acima.length;
    if (total === 0) return { corte, total, percentualAcerto: null };

    const acertos = acima.filter((item) => item.situacao === 'confirmada').length;
    return { corte, total, percentualAcerto: acertos / total };
  });
}

/** O menor corte cuja contagem própria e acurácia acumulada batem as duas condições (AC-4). */
function sugerirCorte(cortes: LinhaCorte[], amostraMinima: number): number | null {
  const elegiveis = cortes.filter(
    (linha) =>
      linha.percentualAcerto !== null &&
      linha.percentualAcerto >= META_ACURACIA &&
      linha.total >= amostraMinima,
  );
  if (elegiveis.length === 0) return null;
  return Math.min(...elegiveis.map((linha) => linha.corte));
}

async function medirCampo(campo: IaConfiancaCampo, amostraMinima: number): Promise<RelatorioCampo> {
  const amostra = await medirAmostra(campo);
  const totalElegivel = amostra.length;
  const amostraSuficiente = totalElegivel >= amostraMinima;
  const cortes = amostraSuficiente ? construirCortes(amostra) : [];
  const sugestao = amostraSuficiente ? sugerirCorte(cortes, amostraMinima) : null;

  return { campo, totalElegivel, amostraMinima, amostraSuficiente, cortes, sugestao };
}

/** Monta o relatório dos dois campos medidos por esta fatia (`servico`, `prioridade`). */
export async function medirCalibragem(amostraMinimaPorCampo: {
  servico: number;
  prioridade: number;
}): Promise<RelatorioCalibragem> {
  const entradas = await Promise.all(
    IA_CONFIANCA_CAMPOS.map(
      async (campo) => [campo, await medirCampo(campo, amostraMinimaPorCampo[campo])] as const,
    ),
  );

  return Object.fromEntries(entradas) as RelatorioCalibragem;
}
