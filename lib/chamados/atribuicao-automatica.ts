import 'server-only';

import { Types } from 'mongoose';

import { registrarDecisao } from '@/lib/conversas/decisoes';
import { lerConfig } from '@/lib/ia-confianca/config';
import { evaluateResponseBreach } from '@/lib/sla-utils';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { UserModel } from '@/models/user.model';
import {
  ATRIBUICAO_TENTATIVAS_MAX,
  type AtribuicaoMotivo,
  type AtribuicaoResultado,
  rotuloDoTecnico,
} from '@/shared/chamados/atribuicao-automatica.constants';
import { CHAMADO_STATUS_CARGA_TECNICO } from '@/shared/chamados/chamado.constants';
import { ATRIBUIDO_POR_SISTEMA } from '@/shared/socket';

import {
  type CandidatoAtribuicao,
  elegiveis,
  montarMotivoTecnico,
  ordenarCandidatos,
} from './atribuicao-criterio';
import { notificarAtribuicao } from './notificar-atribuicao';

/**
 * A atribuição automática ao técnico (spec 0008), chamada uma única vez por
 * `confirmarAbertura`, quando o chamado nasce `validado` pela IA.
 *
 * Escolhe por regra o técnico ativo com a especialidade do serviço, de menor
 * carga e com espaço abaixo do limite, e grava a atribuição com a mesma
 * condição atômica da atribuição manual. Sem transação (o Mongo de produção é
 * standalone), a carga é conferida de novo depois de gravar e a atribuição é
 * desfeita se a conferência reprovar. Nada externo sai antes de a conferência
 * passar.
 *
 * Nunca lança e nunca impede a abertura: qualquer falha vira `sem_tecnico` com
 * `erro`, ou `nao_tentada` quando nem se sabe se a chave estava ligada.
 * Nenhuma entrada dele vem do navegador, então o módulo nunca é Server Action.
 *
 * Chamado órfão (o caso conhecido sem transação: atribuído, mas sem histórico
 * nem aviso, quando uma exceção pega a atribuição gravada e o desfazer também
 * falha). O log `[atribuicao]` com `estado: 'orfao'` o aponta, e esta consulta
 * (mongosh) o acha depois:
 *
 *   db.chamados.aggregate([
 *     { $match: { 'atribuicaoAutomatica.resultado': 'atribuido' } },
 *     { $lookup: {
 *         from: 'chamadohistories',
 *         let: { id: '$_id' },
 *         pipeline: [{ $match: { $expr: { $and: [
 *           { $eq: ['$chamadoId', '$$id'] },
 *           { $eq: ['$action', 'atribuicao_tecnico'] },
 *           { $eq: ['$actorType', 'sistema'] },
 *         ] } } }],
 *         as: 'historico' } },
 *     { $match: { historico: { $size: 0 } } },
 *     { $project: { ticket_number: 1, status: 1, assignedToUserId: 1 } },
 *   ])
 */

const NAO_TENTADA: AtribuicaoResultado = { resultado: 'nao_tentada' };

export type TentarAtribuicaoParams = {
  chamadoId: string;
  solicitanteId: string;
  /** `servico.subtypeId`, o mesmo gravado em `Chamado.subtypeId`. */
  subtypeId: string;
  titulo: string;
  ticketNumber: string;
  /**
   * Só para teste: chamado depois de gravar a atribuição e antes de recontar a
   * carga, para provocar a corrida de forma determinística. Nunca é passado em
   * produção.
   *
   * @internal
   */
  aposGravar?: (contexto: { candidatoId: string; tentativa: number }) => Promise<void> | void;
};

/** O que o passo sabe de si mesmo enquanto roda, para o tratamento de falha e para o log. */
type Contexto = {
  tentados: number;
  /** Candidato cuja atribuição já está gravada e ainda não foi confirmada nem desfeita. */
  gravadoPara: CandidatoAtribuicao | null;
  confirmada: boolean;
  erro: string | null;
};

/** Um chamado ainda sem técnico, como a atribuição manual o exige. */
function semTecnico(chamadoId: Types.ObjectId) {
  return {
    _id: chamadoId,
    status: 'validado',
    $or: [{ assignedToUserId: { $exists: false } }, { assignedToUserId: null }],
  };
}

/** O que a atribuição automática grava e o desfazer apaga, no mesmo lugar. */
const CAMPOS_DA_ATRIBUICAO = {
  assignedToUserId: '',
  assignedAt: '',
  'sla.responseStartedAt': '',
  'sla.responseBreachedAt': '',
} as const;

/** O filtro do desfazer: só desfaz o que este passo gravou e ninguém mexeu (AC-8). */
function filtroDeDesfazer(chamadoId: Types.ObjectId, tecnicoId: string) {
  return {
    _id: chamadoId,
    assignedToUserId: new Types.ObjectId(tecnicoId),
    status: 'em atendimento',
    'atribuicaoAutomatica.resultado': 'atribuido',
  };
}

function marcaSemTecnico(motivo: AtribuicaoMotivo, em: Date) {
  return { resultado: 'sem_tecnico', motivo, tecnicoId: null, em };
}

function nomeDoErro(err: unknown): string {
  return err instanceof Error ? err.name : 'desconhecido';
}

/** Uma linha por execução que chegou a ler a chave ligada (AC-17). Nenhum texto de relato entra. */
function registrar(
  chamadoId: string,
  resultado: AtribuicaoResultado,
  ctx: Contexto,
  inicio: number,
): void {
  console.warn(
    '[atribuicao]',
    JSON.stringify({
      chamadoId,
      resultado: resultado.resultado,
      motivo: resultado.resultado === 'sem_tecnico' ? resultado.motivo : null,
      tecnicoId: resultado.resultado === 'atribuido' ? resultado.tecnicoId : null,
      candidatos: ctx.tentados,
      duracaoMs: Date.now() - inicio,
      ...(ctx.erro ? { erro: ctx.erro } : {}),
    }),
  );
}

export async function tentarAtribuicaoAutomatica(
  params: TentarAtribuicaoParams,
): Promise<AtribuicaoResultado> {
  const inicio = Date.now();

  // (1) A chave. Falha ao ler, ou chave desligada, encerra sem gravar nada e
  // sem linha de log: ainda não se sabe se o passo devia rodar (AC-4, AC-5).
  let ligada: boolean;
  try {
    const config = await lerConfig();
    ligada = config.autonomiaAtiva && config.atribuicaoAutomaticaAtiva;
  } catch (err) {
    console.error(
      '[atribuicao:erro]',
      JSON.stringify({
        chamadoId: params.chamadoId,
        etapa: 'configuracao',
        erro: nomeDoErro(err),
      }),
    );
    return NAO_TENTADA;
  }
  if (!ligada) return NAO_TENTADA;

  // Um único instante para o passo todo: atribuição, resposta e prazo (AC-14).
  const agora = new Date();
  const ctx: Contexto = { tentados: 0, gravadoPara: null, confirmada: false, erro: null };
  let resultado: AtribuicaoResultado;

  try {
    resultado = await executar(params, agora, ctx);
  } catch (err) {
    ctx.erro = nomeDoErro(err);
    resultado =
      ctx.confirmada && ctx.gravadoPara
        ? atribuido(ctx.gravadoPara)
        : await marcarErro(params, agora, ctx);
  }

  registrar(params.chamadoId, resultado, ctx, inicio);
  return resultado;
}

function atribuido(candidato: CandidatoAtribuicao): AtribuicaoResultado {
  return { resultado: 'atribuido', tecnicoId: candidato.id, tecnicoNome: candidato.nome };
}

async function executar(
  params: TentarAtribuicaoParams,
  agora: Date,
  ctx: Contexto,
): Promise<AtribuicaoResultado> {
  const chamadoId = new Types.ObjectId(params.chamadoId);

  // (2) Candidatos, carga e última atribuição.
  const tecnicos = await UserModel.find({
    role: 'Técnico',
    isActive: true,
    specialties: { $in: [new Types.ObjectId(params.subtypeId)] },
    _id: { $ne: new Types.ObjectId(params.solicitanteId) },
  })
    .select('name maxAssignedTickets')
    .lean();

  if (tecnicos.length === 0) return gravarSemTecnico(chamadoId, 'sem_especialidade', agora);

  // Uma agregação só: a carga (só os status de `CHAMADO_STATUS_CARGA_TECNICO`) e
  // a data mais recente de atribuição ou reatribuição, em qualquer status.
  const agregado = await ChamadoModel.aggregate<{
    _id: Types.ObjectId;
    carga: number;
    ultima: Date | null;
  }>([
    { $match: { assignedToUserId: { $in: tecnicos.map((t) => t._id) } } },
    {
      $group: {
        _id: '$assignedToUserId',
        carga: {
          $sum: { $cond: [{ $in: ['$status', [...CHAMADO_STATUS_CARGA_TECNICO]] }, 1, 0] },
        },
        ultima: { $max: { $max: ['$assignedAt', '$reassignedAt'] } },
      },
    },
  ]);
  const porTecnico = new Map(agregado.map((linha) => [String(linha._id), linha]));

  const candidatos: CandidatoAtribuicao[] = tecnicos.map((t) => {
    const linha = porTecnico.get(String(t._id));
    return {
      id: String(t._id),
      nome: t.name ?? '',
      carga: linha?.carga ?? 0,
      limite: t.maxAssignedTickets ?? 5,
      ultimaAtribuicao: linha?.ultima ?? null,
    };
  });
  const aptos = ordenarCandidatos(elegiveis(candidatos));
  if (aptos.length === 0) return gravarSemTecnico(chamadoId, 'sem_vaga', agora);

  const chamado = await ChamadoModel.findById(chamadoId).select('sla.responseDueAt').lean();
  if (!chamado) return NAO_TENTADA;
  const responseBreachedAt = evaluateResponseBreach(
    agora,
    chamado.sla?.responseDueAt ?? null,
    null,
  );

  // (3) Em ordem, até `ATRIBUICAO_TENTATIVAS_MAX`: grava, reconta, e desfaz se passou do limite.
  for (const [indice, candidato] of aptos.slice(0, ATRIBUICAO_TENTATIVAS_MAX).entries()) {
    ctx.tentados = indice + 1;
    const tecnicoId = new Types.ObjectId(candidato.id);

    // Marcado antes de gravar: se a confirmação da escrita se perder (timeout do
    // driver depois de o servidor aplicar), o desfazer condicional ainda acha o
    // que foi gravado. Se a escrita não valeu, ele não casa com nada.
    ctx.gravadoPara = candidato;
    const gravada = await ChamadoModel.findOneAndUpdate(
      semTecnico(chamadoId),
      {
        $set: {
          status: 'em atendimento',
          assignedToUserId: tecnicoId,
          assignedAt: agora,
          'sla.responseStartedAt': agora,
          ...(responseBreachedAt ? { 'sla.responseBreachedAt': responseBreachedAt } : {}),
          atribuicaoAutomatica: {
            resultado: 'atribuido',
            motivo: null,
            tecnicoId,
            em: agora,
          },
        },
      },
      { returnDocument: 'after' },
    );
    // Sem documento: um gestor atribuiu (ou mudou o status) primeiro. Não se sobrescreve nada.
    if (!gravada) {
      ctx.gravadoPara = null;
      return NAO_TENTADA;
    }

    await params.aposGravar?.({ candidatoId: candidato.id, tentativa: indice + 1 });

    // A carga conta o próprio chamado. Passou do limite: outra atribuição
    // chegou no meio e o técnico estouraria (AC-8). A mesma consulta confere que
    // o chamado ainda é este: se um gestor o tomou, a contagem deixa de incluí-lo,
    // passaria no limite e avisaríamos o técnico errado.
    const [conferencia] = await ChamadoModel.aggregate<{ carga: number; meu: number }>([
      {
        $match: {
          assignedToUserId: tecnicoId,
          status: { $in: [...CHAMADO_STATUS_CARGA_TECNICO] },
        },
      },
      {
        $group: {
          _id: null,
          carga: { $sum: 1 },
          meu: { $sum: { $cond: [{ $eq: ['$_id', chamadoId] }, 1, 0] } },
        },
      },
    ]);
    if (!conferencia || conferencia.meu === 0) {
      // Um gestor tomou o chamado no meio. Sai só o marcador que este passo gravou
      // (filtro pelo técnico e pelo resultado), sem tocar no que o gestor gravou:
      // "atribuído pela regra a X" seria falso, pois X nunca foi avisado (AC-7).
      await ChamadoModel.updateOne(
        {
          _id: chamadoId,
          'atribuicaoAutomatica.resultado': 'atribuido',
          'atribuicaoAutomatica.tecnicoId': tecnicoId,
        },
        { $unset: { atribuicaoAutomatica: '' } },
      );
      ctx.gravadoPara = null;
      return NAO_TENTADA;
    }
    if (conferencia.carga <= candidato.limite) {
      ctx.confirmada = true;
      return efeitos(params, candidato, aptos, agora);
    }

    const desfeito = await ChamadoModel.findOneAndUpdate(
      filtroDeDesfazer(chamadoId, candidato.id),
      {
        $set: { status: 'validado' },
        $unset: { ...CAMPOS_DA_ATRIBUICAO, atribuicaoAutomatica: '' },
      },
    );
    // Sem documento: um gestor já mexeu no chamado depois da nossa gravação.
    if (!desfeito) return NAO_TENTADA;
    ctx.gravadoPara = null;
  }

  return gravarSemTecnico(chamadoId, 'sem_vaga', agora);
}

/** Registra `sem_tecnico` sem sobrescrever um chamado que um gestor já tomou. */
async function gravarSemTecnico(
  chamadoId: Types.ObjectId,
  motivo: AtribuicaoMotivo,
  em: Date,
): Promise<AtribuicaoResultado> {
  const marcado = await ChamadoModel.findOneAndUpdate(semTecnico(chamadoId), {
    $set: { atribuicaoAutomatica: marcaSemTecnico(motivo, em) },
  });
  return marcado ? { resultado: 'sem_tecnico', motivo } : NAO_TENTADA;
}

/**
 * A falha inesperada. Antes de gravar a atribuição, marca `sem_tecnico` com
 * `erro`. Depois de gravada, faz uma única tentativa condicional de desfazer que
 * já grava o `erro`; se ela também falhar, o chamado fica órfão (atribuído sem
 * conferência) e o log `estado: 'orfao'` é o que o acha (AC-4).
 */
async function marcarErro(
  params: TentarAtribuicaoParams,
  agora: Date,
  ctx: Contexto,
): Promise<AtribuicaoResultado> {
  const falhou: AtribuicaoResultado = { resultado: 'sem_tecnico', motivo: 'erro' };
  const gravado = ctx.gravadoPara;
  try {
    const chamadoId = new Types.ObjectId(params.chamadoId);
    let marcado = gravado
      ? await ChamadoModel.findOneAndUpdate(filtroDeDesfazer(chamadoId, gravado.id), {
          $set: { status: 'validado', atribuicaoAutomatica: marcaSemTecnico('erro', agora) },
          $unset: CAMPOS_DA_ATRIBUICAO,
        })
      : null;
    // O desfazer não achou nada (ou não havia o que desfazer): a escrita pode nunca
    // ter valido, e o chamado segue `validado` e sem técnico. Marca o erro pelo
    // filtro da atribuição, que só casa nesse estado.
    marcado ??= await ChamadoModel.findOneAndUpdate(semTecnico(chamadoId), {
      $set: { atribuicaoAutomatica: marcaSemTecnico('erro', agora) },
    });
    // Sem documento nos dois: um gestor tomou o chamado no meio. Não há o que marcar.
    return marcado ? falhou : NAO_TENTADA;
  } catch (err) {
    if (gravado) {
      console.error(
        '[atribuicao]',
        JSON.stringify({
          chamadoId: params.chamadoId,
          estado: 'orfao',
          tecnicoId: gravado.id,
          erro: nomeDoErro(err),
        }),
      );
    }
    return falhou;
  }
}

/**
 * Depois de a conferência passar (AC-8): histórico, decisão e avisos. Cada
 * efeito tem o seu `try`: a falha de um não desfaz a atribuição nem impede os
 * outros. Um chamado que ficou atribuído sem histórico é achado pela consulta
 * do `## Follow-up` da spec.
 */
async function efeitos(
  params: TentarAtribuicaoParams,
  candidato: CandidatoAtribuicao,
  aptos: CandidatoAtribuicao[],
  agora: Date,
): Promise<AtribuicaoResultado> {
  const falhaDeEfeito = (efeito: string, erro: string) =>
    console.error('[atribuicao]', JSON.stringify({ chamadoId: params.chamadoId, efeito, erro }));

  try {
    await ChamadoHistoryModel.create({
      chamadoId: new Types.ObjectId(params.chamadoId),
      userId: null,
      actorType: 'sistema',
      action: 'atribuicao_tecnico',
      statusAnterior: 'validado',
      statusNovo: 'em atendimento',
      // Sem id, motivo nem carga: a linha do tempo mostra isto ao solicitante.
      observacoes: `Atribuído automaticamente a ${rotuloDoTecnico(candidato.nome)}`,
    });
  } catch (err) {
    falhaDeEfeito('historico', nomeDoErro(err));
  }

  try {
    const decisao = await registrarDecisao({
      chamadoId: params.chamadoId,
      campo: 'tecnico',
      decididoPor: 'regra',
      efeito: 'aplicado',
      valor: { tecnicoId: candidato.id },
      confianca: null,
      motivo: montarMotivoTecnico(candidato, aptos),
    });
    if (!decisao.ok) falhaDeEfeito('decisao', decisao.reason);
  } catch (err) {
    falhaDeEfeito('decisao', nomeDoErro(err));
  }

  try {
    await notificarAtribuicao({
      chamadoId: params.chamadoId,
      ticketNumber: params.ticketNumber,
      titulo: params.titulo,
      solicitanteId: params.solicitanteId,
      tecnico: { id: candidato.id, name: candidato.nome },
      assignedBy: { ...ATRIBUIDO_POR_SISTEMA },
      at: agora,
    });
  } catch (err) {
    falhaDeEfeito('aviso', nomeDoErro(err));
  }

  return atribuido(candidato);
}
