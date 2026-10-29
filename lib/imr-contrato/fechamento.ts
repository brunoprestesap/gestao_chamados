import 'server-only';

import { Types } from 'mongoose';

import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import { ehChaveDuplicada } from '@/lib/ativos/erros';
import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { lerMaterialConfig } from '@/lib/material/config';
import { ImrFechamentoModel } from '@/models/ImrFechamento';
import { ImrReaberturaModel } from '@/models/ImrReabertura';
import { UserModel } from '@/models/user.model';
import { mesAnterior } from '@/shared/contratos/janela';
import {
  MENSAGENS_FECHAMENTO as F,
  MENSAGENS_MARCACAO as M,
  type PapelImr,
} from '@/shared/imr-contrato/imr-contrato.constants';
import type { FecharMesImrInput } from '@/shared/imr-contrato/imr-contrato.schemas';

import { lerEstadoDoMes, lerPontosVigentes } from './estado';
import { avaliarReincidencia, mesTerminou, somaEFaixa } from './fechamento.regras';
import { montarPreviaImr } from './leitura';

/**
 * Fechamento e reabertura do mês do IMR do contrato (spec 0023, AC-10, AC-11,
 * AC-15, AC-18). Quem chama já conferiu a sessão e o papel e fez `dbConnect`.
 * Nunca lança para a action: erro de negócio volta como `{ ok: false }`.
 */

type Resultado<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

type Autor = { userId: string; papel: PapelImr };

/**
 * Grava a versão seguinte com a mesma apuração da prévia (AC-15). A versão é
 * a maior + 1; dois fechamentos ao mesmo tempo batem no índice único, e o
 * segundo recebe a mensagem do AC-18. Com `pontosVistos`, recusa se o I3 ou o
 * I4 da apuração não forem os que a pessoa viu na tela.
 */
export async function fecharMesImr(
  d: Omit<FecharMesImrInput, 'pontosVistos'> & Partial<Pick<FecharMesImrInput, 'pontosVistos'>>,
  autor: Autor,
  agora: Date = new Date(),
): Promise<Resultado<{ versao: number }>> {
  if (!mesTerminou(d.competencia, hojeEmBelem(agora)))
    return { ok: false, error: F.mesNaoTerminou };

  const previa = await montarPreviaImr({
    contratoId: d.contratoId,
    competencia: d.competencia,
    agora,
  });
  if (!previa.ok) return { ok: false, error: M.mesIndisponivel };
  if (previa.estado.fechado) return { ok: false, error: F.jaFechado };

  const { contrato, apuracao } = previa;
  if (
    d.pontosVistos &&
    (d.pontosVistos.i3 !== apuracao.i3.pontos || d.pontosVistos.i4 !== apuracao.i4.pontos)
  ) {
    return { ok: false, error: F.previaMudou };
  }
  const [anterior, cfg, material, autorDoc] = await Promise.all([
    lerPontosVigentes(d.contratoId, mesAnterior(d.competencia)),
    getBusinessCalendarConfig(),
    lerMaterialConfig(),
    UserModel.findById(autor.userId).select('name').lean<{ name: string }>(),
  ]);

  const pontos = {
    i1: d.i1Pontos,
    i2: d.i2Pontos,
    i3: apuracao.i3.pontos,
    i4: apuracao.i4.pontos,
  };
  const { total, faixa } = somaEFaixa(pontos);
  const reincidencia = avaliarReincidencia({
    competencia: d.competencia,
    vigenciaInicio: contrato.vigenciaInicio,
    atual: pontos,
    anterior,
  });
  const versao = previa.estado.maiorVersao + 1;
  // O instante do fechamento é o da gravação, depois das leituras: uma
  // marcação feita enquanto a prévia era lida fica antes dele e continua
  // valendo depois de uma reabertura. Nunca antes do `agora` da apuração.
  const fechadoEm = new Date(Math.max(agora.getTime(), Date.now()));

  try {
    await ImrFechamentoModel.create({
      contratoId: new Types.ObjectId(d.contratoId),
      competencia: d.competencia,
      versao,
      i1: { pontos: d.i1Pontos, observacao: d.i1Observacao },
      i2: { pontos: d.i2Pontos, observacao: d.i2Observacao },
      i3: apuracao.i3,
      i4: apuracao.i4,
      marcacoesForaDaBase: apuracao.marcacoesForaDaBase,
      total,
      faixa,
      reincidenciaZero: reincidencia.avaliada ? reincidencia.zerados : [],
      reincidenciaAvaliada: reincidencia.avaliada,
      parametros: {
        prazoFornecimentoDiasUteis: material.prazoFornecimentoDiasUteis,
        expediente: {
          dias: cfg.weekdays,
          inicio: cfg.workdayStart,
          fim: cfg.workdayEnd,
          fuso: cfg.timezone,
        },
        feriados: apuracao.feriadosUsados,
        tiposServico: contrato.tiposServico,
        vigencia: { inicio: contrato.vigenciaInicio, fim: contrato.vigenciaFim },
      },
      contratoNumero: contrato.numero,
      fechadoPorUserId: new Types.ObjectId(autor.userId),
      fechadoPorNome: autorDoc?.name ?? 'Usuário removido',
      papel: autor.papel,
      fechadoEm,
    });
  } catch (e) {
    if (ehChaveDuplicada(e)) return { ok: false, error: F.corridaFechamento };
    throw e;
  }
  return { ok: true, versao };
}

/**
 * Reabre a versão vigente com motivo (AC-11). O índice único por versão
 * reaberta faz duas reaberturas ao mesmo tempo gravarem uma só (AC-18).
 */
export async function reabrirMesImr(
  d: { contratoId: string; competencia: string; motivo: string },
  autor: Autor,
  agora: Date = new Date(),
): Promise<Resultado> {
  const estado = await lerEstadoDoMes(d.contratoId, d.competencia);
  if (!estado.fechado) return { ok: false, error: F.naoFechado };
  try {
    await ImrReaberturaModel.create({
      contratoId: new Types.ObjectId(d.contratoId),
      competencia: d.competencia,
      versaoReaberta: estado.maiorVersao,
      motivo: d.motivo,
      porUserId: new Types.ObjectId(autor.userId),
      papel: autor.papel,
      em: agora,
    });
  } catch (e) {
    if (ehChaveDuplicada(e)) return { ok: false, error: F.corridaReabertura };
    throw e;
  }
  return { ok: true };
}
