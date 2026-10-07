'use server';

import { Types } from 'mongoose';
import { revalidatePath } from 'next/cache';

import { gravarHistoricoOuDesfazer } from '@/lib/ativos/auditoria';
import { vincularAtivoAoChamado } from '@/lib/ativos/vinculo';
import { notificarAtribuicao } from '@/lib/chamados/notificar-atribuicao';
import { notificarCorrecaoAoTecnico } from '@/lib/chamados/notificar-correcao';
import {
  aplicarVeredito,
  camposPendentesDeConfirmacao,
  confirmarDecisao,
  resolverDecisao,
} from '@/lib/conversas/decisoes';
import { canManage, isAdmin, requireManager, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { sendNotificationEmail } from '@/lib/email/send-notification-email';
import { logRevisaoIa } from '@/lib/gestao/log-revisao-ia';
import { emitToRoom } from '@/lib/realtime-emit';
import { montarSnapshotCorrecao, montarSnapshotSla } from '@/lib/sla-snapshot';
import { evaluateResponseBreach } from '@/lib/sla-utils';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { NotificationModel } from '@/models/Notification';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { ServiceTypeModel } from '@/models/ServiceType';
import { SlaEscalationModel } from '@/models/SlaEscalation';
import { UserModel } from '@/models/user.model';
import { ERRO_SEM_PERMISSAO } from '@/shared/ativos/ativo.constants';
import {
  type VincularAtivoChamadoInput,
  VincularAtivoChamadoSchema,
} from '@/shared/ativos/ativo.schemas';
import {
  type AssignTicketInput,
  AssignTicketSchema,
  type ReassignTicketInput,
  ReassignTicketSchema,
  type UpdateTicketCatalogInput,
  UpdateTicketCatalogSchema,
} from '@/shared/chamados/assignment.schemas';
import {
  direcaoDaPrioridade,
  FINAL_PRIORITY_LABELS,
  toAttendanceNature,
} from '@/shared/chamados/chamado.constants';
import {
  type ClassificarChamadoInput,
  ClassificarChamadoSchema,
  type CorrigirServicoInput,
  CorrigirServicoSchema,
  type UpdateTicketPriorityInput,
  UpdateTicketPrioritySchema,
} from '@/shared/chamados/chamado.schemas';
import {
  erroForaDaJanela,
  filtroJanelaAberta,
  MSG_ENCERRADO_DEFINITIVO,
} from '@/shared/chamados/janela-avaliacao';
import { type RejectTicketInput, RejectTicketSchema } from '@/shared/chamados/rejection.schemas';
import {
  type ReopenTicketInput,
  ReopenTicketSchema,
} from '@/shared/chamados/reopen-ticket.schemas';
import { tipoServicoDoNomeDoTipo } from '@/shared/chamados/tipo-servico';
import { DECISAO_CAMPO_LABELS, type DecisaoCampo } from '@/shared/conversas/conversa.constants';
import {
  type ConfirmarDecisoesIaInput,
  confirmarDecisoesIaSchema,
} from '@/shared/conversas/conversa.schemas';

export type ClassificarResult = { ok: true } | { ok: false; error: string };
export type UpdateTicketPriorityResult = { ok: true } | { ok: false; error: string };
export type CorrigirServicoResult = { ok: true } | { ok: false; error: string };
export type UpdateTicketCatalogResult = { ok: true } | { ok: false; error: string };
export type RejectTicketResult = { ok: true } | { ok: false; error: string };
export type ReopenTicketResult = { ok: true } | { ok: false; error: string };
export type AssignTicketResult =
  | { ok: true; technicianId: string; technicianName: string; strategy: 'MANUAL' | 'FALLBACK' }
  | { ok: false; error: string };
export type ReassignTicketResult =
  | { ok: true; technicianId: string; technicianName: string }
  | { ok: false; error: string };

/**
 * Status considerados "ativos" para cálculo de carga do técnico
 */
const ACTIVE_STATUSES = ['validado', 'em atendimento'] as const;

export async function classificarChamadoAction(
  raw: ClassificarChamadoInput,
): Promise<ClassificarResult> {
  try {
    const session = await requireManager();
    const parsed = ClassificarChamadoSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.naturezaAtendimento?.[0] ??
        first.finalPriority?.[0] ??
        first.chamadoId?.[0] ??
        'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const {
      chamadoId,
      naturezaAtendimento,
      finalPriority,
      classificationNotes,
      subtypeId,
      catalogServiceId,
    } = parsed.data;
    await dbConnect();

    const doc = await ChamadoModel.findById(chamadoId);
    if (!doc) return { ok: false, error: 'Chamado não encontrado.' };
    if (doc.status !== 'aberto') {
      return { ok: false, error: 'Somente chamados com status "aberto" podem ser classificados.' };
    }

    const now = new Date();
    const userId = new Types.ObjectId(session.userId);

    const snapshot = await montarSnapshotSla(finalPriority, now);
    if (!snapshot.ok) {
      return { ok: false, error: snapshot.motivo };
    }
    const { snapshot: sla } = snapshot;

    const attendanceNature = toAttendanceNature(naturezaAtendimento);

    // Atualiza serviço catalogado
    const catalogUpdates: Record<string, unknown> = {
      subtypeId: new Types.ObjectId(subtypeId),
      catalogServiceId: new Types.ObjectId(catalogServiceId),
    };

    await ChamadoModel.updateOne(
      { _id: chamadoId },
      {
        $set: {
          status: 'validado',
          naturezaAtendimento,
          attendanceNature,
          finalPriority,
          classificationNotes: classificationNotes ?? '',
          classifiedByUserId: userId,
          classifiedAt: now,
          'sla.priority': sla.priority,
          'sla.responseTargetMinutes': sla.responseTargetMinutes,
          'sla.resolutionTargetMinutes': sla.resolutionTargetMinutes,
          'sla.businessHoursOnly': sla.businessHoursOnly,
          'sla.responseDueAt': sla.responseDueAt,
          'sla.resolutionDueAt': sla.resolutionDueAt,
          'sla.computedAt': sla.computedAt,
          'sla.configVersion': sla.configVersion,
          ...catalogUpdates,
        },
      },
    );

    const obsParts = [
      `Natureza aprovada: ${naturezaAtendimento}, Prioridade: ${finalPriority}`,
      'Status alterado para Validado.',
    ];
    if (catalogUpdates.catalogServiceId)
      obsParts.push('Serviço catalogado definido na classificação.');
    if (classificationNotes) obsParts.push(`Observações: ${classificationNotes}`);
    const observacoes = obsParts.join(' ');
    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId,
      action: 'classificacao',
      statusAnterior: 'aberto',
      statusNovo: 'validado',
      observacoes,
    });

    // Aviso ao vivo para o solicitante, se estiver com a conversa aberta (spec 0005, AC-1).
    const classifiedByUser = await UserModel.findById(session.userId).select('name').lean();
    await emitToRoom(`user:${String(doc.solicitanteId)}`, 'ticket:classified', {
      ticketId: String(doc._id),
      ticketNumber: doc.ticket_number,
      title: doc.titulo,
      classifiedBy: { id: session.userId, name: classifiedByUser?.name ?? undefined },
      finalPriority,
      at: now.toISOString(),
    });

    // A triagem é o veredito da gestão sobre o que a IA propôs (spec 0002).
    // Chamado de formulário não tem decisão e o gancho sai em silêncio.
    await aplicarVeredito({
      viewer: { userId: session.userId, role: session.role },
      chamadoId,
      vereditos: [
        { campo: 'servico', valor: { catalogServiceId, subtypeId } },
        { campo: 'prioridade', valor: { prioridade: finalPriority } },
      ],
      motivo: classificationNotes,
    });

    revalidatePath('/gestao');
    revalidatePath(`/meus-chamados/${chamadoId}`);

    return { ok: true };
  } catch (e) {
    console.error('classificarChamadoAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao classificar chamado. Tente novamente.',
    };
  }
}

/** Duas tentativas antes de registrar a falha (AC-21) — sem transação, é a rede de segurança possível. */
async function comNovaTentativa(fn: () => Promise<void>, onFalha: (erro: string) => void) {
  try {
    await fn();
  } catch {
    try {
      await fn();
    } catch (err2) {
      onFalha(err2 instanceof Error ? err2.message : String(err2));
    }
  }
}

/**
 * Corrige a prioridade final de um chamado `validado` ou `em atendimento`
 * (spec 0007, AC-11; janela alargada e regra de SLA assimétrica pela spec
 * 0009, AC-7 a AC-10). A checagem e a gravação acontecem numa única operação
 * atômica no banco, cujo filtro repete os valores lidos (status, prioridade
 * atual, técnico atribuído e prazo de resolução): qualquer mudança no meio
 * (uma atribuição, outra correção, o monitor de SLA) faz a operação não
 * casar, e a correção é recusada pedindo para tentar de novo (AC-7). Depois
 * do update, cada passo (`correcao_gestao`, entrada neutra, `resolverDecisao`,
 * limpeza de `SlaEscalation`, a busca do nome do gestor, o aviso ao técnico)
 * tem o seu `try`: a falha de um vira log e nunca desfaz a correção nem
 * impede os seguintes (AC-21). O
 * aviso ao técnico é `ticket:corrected`, sem motivo (AC-14); `ticket:classified`
 * ao solicitante continua como está.
 */
export async function updateTicketPriorityAction(
  raw: UpdateTicketPriorityInput,
): Promise<UpdateTicketPriorityResult> {
  try {
    const session = await requireManager();
    const parsed = UpdateTicketPrioritySchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.finalPriority?.[0] ??
        first.motivo?.[0] ??
        first.chamadoId?.[0] ??
        'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const { chamadoId, finalPriority, motivo } = parsed.data;
    await dbConnect();

    const atual = await ChamadoModel.findById(chamadoId);
    if (!atual) return { ok: false, error: 'Chamado não encontrado.' };
    if (!ACTIVE_STATUSES.includes(atual.status as (typeof ACTIVE_STATUSES)[number])) {
      logRevisaoIa({
        chamadoId,
        campo: 'prioridade',
        operacao: 'corrigir_prioridade',
        resultado: 'recusada',
      });
      return {
        ok: false,
        error: `Correção de prioridade permitida apenas para chamados "Validado" ou "Em atendimento". Status atual: ${atual.status}.`,
      };
    }
    if (!atual.classifiedAt || !atual.finalPriority) {
      return { ok: false, error: 'Chamado ainda não foi classificado.' };
    }
    const direcao = direcaoDaPrioridade(
      atual.finalPriority as UpdateTicketPriorityInput['finalPriority'],
      finalPriority,
    );
    if (!direcao) {
      return { ok: false, error: 'A prioridade informada já é a atual.' };
    }

    const assignedToUserId = atual.assignedToUserId ?? null;
    if (direcao === 'desce' && assignedToUserId && !isAdmin(session.role)) {
      logRevisaoIa({
        chamadoId,
        campo: 'prioridade',
        operacao: 'corrigir_prioridade',
        direcao,
        resultado: 'recusada',
      });
      return {
        ok: false,
        error: 'Só o Admin pode baixar a prioridade de um chamado que já tem técnico atribuído.',
      };
    }

    const resolutionDueAtAtual = atual.sla?.resolutionDueAt ?? null;
    const resultadoSnapshot = await montarSnapshotCorrecao({
      novaPrioridade: finalPriority,
      direcao,
      now: new Date(),
      classifiedAt: atual.classifiedAt,
      comTecnico: Boolean(assignedToUserId),
      atual: {
        resolutionDueAt: resolutionDueAtAtual,
        responseDueAt: atual.sla?.responseDueAt ?? null,
        responseStartedAt: atual.sla?.responseStartedAt ?? null,
        resolutionTargetMinutes: atual.sla?.resolutionTargetMinutes ?? null,
      },
    });
    if (!resultadoSnapshot.ok) return { ok: false, error: resultadoSnapshot.motivo };
    const { sla: patch, escalacoesApagar } = resultadoSnapshot;

    const userId = new Types.ObjectId(session.userId);
    const setFields: Record<string, unknown> = {
      finalPriority,
      'sla.priority': patch.priority,
      'sla.resolutionDueAt': patch.resolutionDueAt,
      'sla.responseDueAt': patch.responseDueAt,
    };
    if (patch.resolutionBreachedAt !== undefined) {
      setFields['sla.resolutionBreachedAt'] = patch.resolutionBreachedAt;
    }
    if (patch.responseBreachedAt !== undefined) {
      setFields['sla.responseBreachedAt'] = patch.responseBreachedAt;
    }
    if (patch.resolutionTargetMinutes !== undefined) {
      setFields['sla.resolutionTargetMinutes'] = patch.resolutionTargetMinutes;
      setFields['sla.responseTargetMinutes'] = patch.responseTargetMinutes;
      setFields['sla.businessHoursOnly'] = patch.businessHoursOnly;
      setFields['sla.configVersion'] = patch.configVersion;
    }

    // Passo 1 (único que decide se a correção vale): o filtro repete tudo o
    // que foi lido — status, prioridade, técnico e o prazo de resolução — sem
    // pré-condição solta. Qualquer um mudando no meio, a operação não casa.
    const doc = await ChamadoModel.findOneAndUpdate(
      {
        _id: chamadoId,
        status: { $in: ACTIVE_STATUSES },
        finalPriority: atual.finalPriority,
        assignedToUserId,
        'sla.resolutionDueAt': resolutionDueAtAtual,
      },
      { $set: setFields },
      { returnDocument: 'after' },
    );

    if (!doc) {
      logRevisaoIa({
        chamadoId,
        campo: 'prioridade',
        operacao: 'corrigir_prioridade',
        direcao,
        resultado: 'recusada',
      });
      return {
        ok: false,
        error:
          'Os dados do chamado mudaram desde a última leitura. Atualize a página e tente de novo.',
      };
    }

    let resultadoLog: Parameters<typeof logRevisaoIa>[0]['resultado'] = 'ok';
    const registrarFalha = (passo: string, erro: string) => {
      if (resultadoLog === 'ok') resultadoLog = `parcial:${passo}`;
      console.error(
        '[gestao]',
        JSON.stringify({ chamadoId, acao: 'corrigir_prioridade', passo, erro }),
      );
    };

    // Passo 2: entrada só da gestão, com o motivo (AC-13).
    try {
      await ChamadoHistoryModel.create({
        chamadoId: doc._id,
        userId,
        action: 'correcao_gestao',
        observacoes: `${DECISAO_CAMPO_LABELS.prioridade}: ${FINAL_PRIORITY_LABELS[atual.finalPriority as keyof typeof FINAL_PRIORITY_LABELS]} → ${FINAL_PRIORITY_LABELS[finalPriority]}. Motivo: ${motivo}`,
      });
    } catch (err) {
      registrarFalha('correcao_gestao', err instanceof Error ? err.message : String(err));
    }

    // Passo 3: entrada neutra, visível a todos, sem motivo nem valor antigo.
    try {
      await ChamadoHistoryModel.create({
        chamadoId: doc._id,
        userId,
        action: 'classificacao',
        observacoes: `Prioridade alterada para ${FINAL_PRIORITY_LABELS[finalPriority]} pela gestão.`,
      });
    } catch (err) {
      registrarFalha('entrada_neutra', err instanceof Error ? err.message : String(err));
    }

    // Passo 4: corrige a DecisaoIa de prioridade, quando existir. Chamado do
    // formulário, ou sem decisão de prioridade, não tem — `nao_encontrada` é
    // normal, não uma falha do passo.
    try {
      const decisao = await resolverDecisao({
        viewer: { userId: session.userId, role: session.role },
        chamadoId,
        campo: 'prioridade',
        valor: { prioridade: finalPriority },
        origem: 'gestao',
        motivo,
      });
      if (!decisao.ok && decisao.reason !== 'nao_encontrada') {
        registrarFalha('decisao', decisao.reason);
      }
    } catch (err) {
      registrarFalha('decisao', err instanceof Error ? err.message : String(err));
    }

    // Passo 5: limpeza das SlaEscalation que a nova regra tornou obsoletas.
    if (escalacoesApagar.length > 0) {
      await comNovaTentativa(
        () =>
          SlaEscalationModel.deleteMany({
            chamadoId: doc._id,
            type: { $in: escalacoesApagar },
          }).then(() => undefined),
        (erro) => registrarFalha('escalacoes', erro),
      );
    }

    // O nome do gestor serve ao aviso (passo 6) e ao `ticket:classified` mais
    // abaixo; a busca é seu próprio passo, isolado como os demais (AC-21).
    let gestorNome: string | undefined;
    try {
      const gestorUser = await UserModel.findById(session.userId).select('name').lean();
      gestorNome = gestorUser?.name ?? undefined;
    } catch (err) {
      registrarFalha('gestor', err instanceof Error ? err.message : String(err));
    }

    // Passo 6: avisa o técnico atribuído, sem motivo (AC-14). Sem técnico, não
    // há ninguém para avisar de uma correção de prioridade.
    if (doc.assignedToUserId) {
      try {
        await notificarCorrecaoAoTecnico({
          chamadoId: String(doc._id),
          ticketNumber: doc.ticket_number,
          titulo: doc.titulo,
          tecnicoId: String(doc.assignedToUserId),
          campo: 'prioridade',
          finalPriority,
          correctedBy: { id: session.userId, name: gestorNome },
          at: new Date(),
        });
      } catch (err) {
        registrarFalha('aviso', err instanceof Error ? err.message : String(err));
      }
    }

    logRevisaoIa({
      chamadoId,
      campo: 'prioridade',
      operacao: 'corrigir_prioridade',
      direcao,
      resultado: resultadoLog,
    });

    // `ticket:classified` ao solicitante, como sempre (fire-and-forget).
    await emitToRoom(`user:${String(doc.solicitanteId)}`, 'ticket:classified', {
      ticketId: String(doc._id),
      ticketNumber: doc.ticket_number,
      title: doc.titulo,
      classifiedBy: { id: session.userId, name: gestorNome },
      finalPriority,
      at: new Date().toISOString(),
    });

    revalidatePath('/gestao');
    revalidatePath(`/meus-chamados/${chamadoId}`);

    return { ok: true };
  } catch (e) {
    // O detalhe fica no log; a tela recebe só a frase fixa, nunca a mensagem
    // interna do Mongo ou do Mongoose.
    console.error('updateTicketPriorityAction:', e);
    return { ok: false, error: 'Erro ao corrigir prioridade. Tente novamente.' };
  }
}

/**
 * Corrige o serviço catalogado de um chamado `validado` ou `em atendimento`
 * que já tem serviço (spec 0009, AC-11): troca `catalogServiceId`, `subtypeId`
 * e `tipoServico` — nunca prioridade nem SLA. O técnico atual fica quando tem
 * a especialidade do serviço novo; quando não tem, exige `novoTecnicoId` (só
 * em `em atendimento`) e troca o técnico na mesma gravação. A checagem e a
 * gravação são uma única operação atômica, cujo filtro repete o serviço e o
 * técnico lidos (AC-21); os passos seguintes (`correcao_gestao`, entrada
 * neutra, `resolverDecisao`, a troca de técnico, o aviso) cada um com seu
 * `try`, nunca desfazendo a correção. Trocou o técnico: avisa só o novo, pelo
 * mesmo caminho de `reassignTicketAction` (`notificarAtribuicao`, sem avisar o
 * solicitante, AC-15). Manteve, e há técnico: `ticket:corrected` (AC-14).
 */
export async function corrigirServicoAction(
  raw: CorrigirServicoInput,
): Promise<CorrigirServicoResult> {
  try {
    const session = await requireManager();
    const parsed = CorrigirServicoSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.catalogServiceId?.[0] ??
        first.motivo?.[0] ??
        first.chamadoId?.[0] ??
        'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const { chamadoId, catalogServiceId, novoTecnicoId, motivo } = parsed.data;
    await dbConnect();

    const atual = await ChamadoModel.findById(chamadoId);
    if (!atual) return { ok: false, error: 'Chamado não encontrado.' };
    if (!ACTIVE_STATUSES.includes(atual.status as (typeof ACTIVE_STATUSES)[number])) {
      logRevisaoIa({
        chamadoId,
        campo: 'servico',
        operacao: 'corrigir_servico',
        resultado: 'recusada',
      });
      return {
        ok: false,
        error: `Correção de serviço permitida apenas para chamados "Validado" ou "Em atendimento". Status atual: ${atual.status}.`,
      };
    }
    if (!atual.catalogServiceId) {
      return {
        ok: false,
        error: 'Chamado ainda não tem serviço catalogado. Classifique o chamado primeiro.',
      };
    }
    if (String(atual.catalogServiceId) === catalogServiceId) {
      return { ok: false, error: 'O serviço informado já é o atual.' };
    }

    const currentAssignedId = atual.assignedToUserId ? String(atual.assignedToUserId) : null;
    if (novoTecnicoId && !currentAssignedId) {
      return {
        ok: false,
        error: 'Só é possível escolher um novo técnico em chamados em atendimento.',
      };
    }

    const novoServico = await ServiceCatalogModel.findById(catalogServiceId)
      .select('name subtypeId typeId')
      .lean();
    if (!novoServico) return { ok: false, error: 'Serviço do catálogo não encontrado.' };
    if (!novoServico.subtypeId) {
      return { ok: false, error: 'Serviço do catálogo não possui subtipo definido.' };
    }
    const novoSubtypeId = String(novoServico.subtypeId);

    const novoServiceType = novoServico.typeId
      ? await ServiceTypeModel.findById(novoServico.typeId).select('name').lean()
      : null;
    const tipoServico = novoServiceType ? tipoServicoDoNomeDoTipo(novoServiceType.name) : null;
    if (!tipoServico) {
      logRevisaoIa({
        chamadoId,
        campo: 'servico',
        operacao: 'corrigir_servico',
        resultado: 'recusada',
      });
      return {
        ok: false,
        error: 'Não foi possível determinar o tipo do serviço novo. Contate o suporte.',
      };
    }

    // O técnico atual fica se tiver a especialidade; sem ela, precisa de um novo.
    let tecnicoFinalId: Types.ObjectId | null = atual.assignedToUserId ?? null;
    let tecnicoTrocou = false;
    let novoTecnicoNome: string | null = null;
    let tecnicoAnteriorNome: string | null = null;

    if (currentAssignedId) {
      const tecnicoAtual = await UserModel.findById(currentAssignedId)
        .select('name specialties')
        .lean();
      const tecnicoAtualTemEspecialidade = Boolean(
        tecnicoAtual?.specialties?.some((s) => String(s) === novoSubtypeId),
      );

      if (!tecnicoAtualTemEspecialidade) {
        if (!novoTecnicoId) {
          return {
            ok: false,
            error:
              'O técnico atual não tem a especialidade deste serviço. Escolha um novo técnico.',
          };
        }
        if (novoTecnicoId === currentAssignedId) {
          return { ok: false, error: 'Escolha um técnico diferente do atual.' };
        }
        const candidato = await UserModel.findById(novoTecnicoId)
          .select('name role isActive specialties maxAssignedTickets')
          .lean();
        if (!candidato || candidato.role !== 'Técnico' || !candidato.isActive) {
          return { ok: false, error: 'Técnico selecionado inválido.' };
        }
        const candidatoTemEspecialidade = candidato.specialties?.some(
          (s) => String(s) === novoSubtypeId,
        );
        if (!candidatoTemEspecialidade) {
          return {
            ok: false,
            error: 'Técnico selecionado não possui a especialidade necessária para este serviço.',
          };
        }
        const carga = await ChamadoModel.countDocuments({
          assignedToUserId: candidato._id,
          status: { $in: ACTIVE_STATUSES },
        });
        const maxAssignedTickets = candidato.maxAssignedTickets ?? 5;
        if (carga >= maxAssignedTickets) {
          return { ok: false, error: 'Técnico selecionado está sobrecarregado.' };
        }

        tecnicoFinalId = candidato._id;
        tecnicoTrocou = true;
        novoTecnicoNome = candidato.name;
        tecnicoAnteriorNome = tecnicoAtual?.name ?? 'Técnico anterior';
      }
    }

    const servicoAnterior = await ServiceCatalogModel.findById(atual.catalogServiceId)
      .select('name')
      .lean();

    const userId = new Types.ObjectId(session.userId);
    const setFields: Record<string, unknown> = {
      catalogServiceId: new Types.ObjectId(catalogServiceId),
      subtypeId: new Types.ObjectId(novoSubtypeId),
      tipoServico,
    };
    if (tecnicoTrocou && tecnicoFinalId) {
      setFields.assignedToUserId = tecnicoFinalId;
      setFields.reassignedAt = new Date();
      setFields.reassignedByUserId = userId;
      setFields.reassignmentNotes = '';
    }

    // Passo 1 (único que decide se a correção vale): o filtro repete o
    // serviço e o técnico lidos — qualquer um mudando no meio, não casa.
    const doc = await ChamadoModel.findOneAndUpdate(
      {
        _id: chamadoId,
        status: { $in: ACTIVE_STATUSES },
        catalogServiceId: atual.catalogServiceId,
        assignedToUserId: atual.assignedToUserId ?? null,
      },
      { $set: setFields },
      { returnDocument: 'after' },
    );

    if (!doc) {
      logRevisaoIa({
        chamadoId,
        campo: 'servico',
        operacao: 'corrigir_servico',
        resultado: 'recusada',
      });
      return {
        ok: false,
        error:
          'Os dados do chamado mudaram desde a última leitura. Atualize a página e tente de novo.',
      };
    }

    let resultadoLog: Parameters<typeof logRevisaoIa>[0]['resultado'] = 'ok';
    const registrarFalha = (passo: string, erro: string) => {
      if (resultadoLog === 'ok') resultadoLog = `parcial:${passo}`;
      console.error(
        '[gestao]',
        JSON.stringify({ chamadoId, acao: 'corrigir_servico', passo, erro }),
      );
    };

    // Passo 2: entrada só da gestão, com o motivo (AC-13).
    try {
      await ChamadoHistoryModel.create({
        chamadoId: doc._id,
        userId,
        action: 'correcao_gestao',
        observacoes: `${DECISAO_CAMPO_LABELS.servico}: ${servicoAnterior?.name ?? 'serviço anterior'} → ${novoServico.name}. Motivo: ${motivo || 'não informado'}`,
      });
    } catch (err) {
      registrarFalha('correcao_gestao', err instanceof Error ? err.message : String(err));
    }

    // Passo 3: entrada neutra, visível a todos, sem motivo nem valor antigo.
    try {
      await ChamadoHistoryModel.create({
        chamadoId: doc._id,
        userId,
        action: 'classificacao',
        observacoes: `Serviço alterado para ${novoServico.name} pela gestão.`,
      });
    } catch (err) {
      registrarFalha('entrada_neutra', err instanceof Error ? err.message : String(err));
    }

    // Passo 4: corrige a DecisaoIa de serviço, quando existir.
    try {
      const decisao = await resolverDecisao({
        viewer: { userId: session.userId, role: session.role },
        chamadoId,
        campo: 'servico',
        valor: { catalogServiceId, subtypeId: novoSubtypeId, tipoServico },
        origem: 'gestao',
        motivo: motivo || undefined,
      });
      if (!decisao.ok && decisao.reason !== 'nao_encontrada') {
        registrarFalha('decisao', decisao.reason);
      }
    } catch (err) {
      registrarFalha('decisao', err instanceof Error ? err.message : String(err));
    }

    // Passo 5: troca de técnico, quando aplicável — história própria (sem
    // "Observações", AC-13) e o veredito do campo técnico.
    if (tecnicoTrocou && tecnicoFinalId) {
      try {
        await ChamadoHistoryModel.create({
          chamadoId: doc._id,
          userId,
          action: 'reatribuicao_tecnico',
          statusAnterior: doc.status,
          statusNovo: doc.status,
          observacoes: `Reatribuído de ${tecnicoAnteriorNome} para ${novoTecnicoNome} (correção de serviço).`,
        });
      } catch (err) {
        registrarFalha('reatribuicao_historico', err instanceof Error ? err.message : String(err));
      }
      try {
        await aplicarVeredito({
          viewer: { userId: session.userId, role: session.role },
          chamadoId,
          vereditos: [{ campo: 'tecnico', valor: { tecnicoId: String(tecnicoFinalId) } }],
          motivo: motivo || undefined,
        });
      } catch (err) {
        registrarFalha('reatribuicao_veredito', err instanceof Error ? err.message : String(err));
      }
    }

    // Passo 6: avisa o técnico, sem motivo. Trocou: o técnico novo, pelo
    // mesmo caminho da reatribuição (AC-15), sem avisar o solicitante. Não
    // trocou e há técnico: `ticket:corrected` (AC-14).
    try {
      const gestorUser = await UserModel.findById(session.userId).select('name').lean();
      if (tecnicoTrocou && tecnicoFinalId) {
        await notificarAtribuicao({
          chamadoId: String(doc._id),
          ticketNumber: doc.ticket_number,
          titulo: doc.titulo,
          solicitanteId: String(doc.solicitanteId),
          tecnico: { id: String(tecnicoFinalId), name: novoTecnicoNome ?? 'Técnico' },
          assignedBy: { id: session.userId, name: gestorUser?.name ?? undefined },
          at: new Date(),
          avisarSolicitante: false,
        });
      } else if (doc.assignedToUserId) {
        await notificarCorrecaoAoTecnico({
          chamadoId: String(doc._id),
          ticketNumber: doc.ticket_number,
          titulo: doc.titulo,
          tecnicoId: String(doc.assignedToUserId),
          campo: 'servico',
          correctedBy: { id: session.userId, name: gestorUser?.name ?? undefined },
          at: new Date(),
        });
      }
    } catch (err) {
      registrarFalha('aviso', err instanceof Error ? err.message : String(err));
    }

    logRevisaoIa({
      chamadoId,
      campo: 'servico',
      operacao: 'corrigir_servico',
      resultado: resultadoLog,
    });

    revalidatePath('/gestao');
    revalidatePath(`/meus-chamados/${chamadoId}`);

    return { ok: true };
  } catch (e) {
    console.error('corrigirServicoAction:', e);
    return { ok: false, error: 'Erro ao corrigir serviço. Tente novamente.' };
  }
}

/**
 * Atualiza subtypeId e catalogServiceId de um chamado validado que não os possui.
 * Permite desbloquear a atribuição de chamados legados.
 */
export async function updateTicketCatalogAction(
  raw: UpdateTicketCatalogInput,
): Promise<UpdateTicketCatalogResult> {
  try {
    const session = await requireManager();
    const parsed = UpdateTicketCatalogSchema.safeParse(raw);
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      return { ok: false, error: first ?? 'Dados inválidos. Verifique os campos.' };
    }

    const { ticketId, subtypeId, catalogServiceId } = parsed.data;
    await dbConnect();

    const doc = await ChamadoModel.findById(ticketId);
    if (!doc) return { ok: false, error: 'Chamado não encontrado.' };

    if (doc.status !== 'validado') {
      return { ok: false, error: 'Somente chamados com status "validado" podem ser atualizados.' };
    }

    if (doc.catalogServiceId) {
      return { ok: false, error: 'Chamado já possui serviço catalogado.' };
    }

    // O filtro repete as condições: outra gestão no meio do caminho não é sobrescrita.
    const r = await ChamadoModel.updateOne(
      { _id: ticketId, status: 'validado', catalogServiceId: null },
      {
        $set: {
          subtypeId: new Types.ObjectId(subtypeId),
          catalogServiceId: new Types.ObjectId(catalogServiceId),
        },
      },
    );
    if (r.modifiedCount === 0) {
      return { ok: false, error: 'O chamado mudou enquanto você editava. Recarregue.' };
    }

    // Sem histórico, a mudança é desfeita: nenhuma alteração fica sem registro.
    await gravarHistoricoOuDesfazer(
      () =>
        ChamadoHistoryModel.create({
          chamadoId: ticketId,
          userId: new Types.ObjectId(session.userId),
          action: 'catalogo_atualizado',
          observacoes: 'Serviço catalogado definido para permitir atribuição.',
        }),
      () =>
        ChamadoModel.updateOne(
          { _id: ticketId, catalogServiceId: new Types.ObjectId(catalogServiceId) },
          doc.subtypeId
            ? { $set: { subtypeId: doc.subtypeId }, $unset: { catalogServiceId: '' } }
            : { $unset: { subtypeId: '', catalogServiceId: '' } },
        ),
    );

    revalidatePath('/gestao');
    return { ok: true };
  } catch (e) {
    console.error('updateTicketCatalogAction:', e);
    return { ok: false, error: 'Erro ao atualizar catálogo. Tente novamente.' };
  }
}

/**
 * Reabre um chamado (Admin ou Preposto) concluído, só dentro do prazo para
 * avaliar (spec 0010, AC-4). O chamado volta para "em atendimento" mantendo o
 * técnico atribuído, e o prazo é limpo. O `encerrado` é definitivo: nunca reabre.
 */
export async function reopenTicketAction(raw: ReopenTicketInput): Promise<ReopenTicketResult> {
  try {
    const session = await requireManager();

    const parsed = ReopenTicketSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.reason?.[0] ?? first.ticketId?.[0] ?? 'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const { ticketId, reason } = parsed.data;
    await dbConnect();

    const now = new Date();
    const userId = new Types.ObjectId(session.userId);

    // Update atômico: só transita com a janela aberta (concluído e prazo não vencido).
    const previous = await ChamadoModel.findOneAndUpdate(
      { _id: ticketId, ...filtroJanelaAberta(now) },
      {
        $set: {
          status: 'em atendimento',
          concludedAt: null,
          closedAt: null,
          closedByUserId: null,
          closureNotes: '',
          'sla.resolvedAt': null,
          prazoAvaliacaoAte: null,
        },
      },
      { new: false },
    );

    if (!previous) {
      const existing = await ChamadoModel.findById(ticketId).lean();
      if (!existing) return { ok: false, error: 'Chamado não encontrado.' };
      const foraDaJanela = erroForaDaJanela(
        existing.status,
        existing.prazoAvaliacaoAte,
        now,
        MSG_ENCERRADO_DEFINITIVO,
      );
      if (foraDaJanela) return { ok: false, error: foraDaJanela };
      return {
        ok: false,
        error: `Reabertura permitida apenas para chamados Concluídos, dentro do prazo para avaliar. Status atual: ${existing.status}.`,
      };
    }

    const fromStatus = 'concluído' as const;

    // Histórico (auditoria)
    await ChamadoHistoryModel.create({
      chamadoId: previous._id,
      userId,
      action: 'reabertura',
      statusAnterior: fromStatus,
      statusNovo: 'em atendimento',
      observacoes: `Reaberto por ${session.role}. Motivo: ${reason.length > 200 ? reason.slice(0, 200) + '…' : reason}`,
    });

    // Notificações (fire-and-forget)
    const actor = await UserModel.findById(session.userId).select('name').lean();
    const payload = {
      ticketId: String(previous._id),
      ticketNumber: previous.ticket_number ?? undefined,
      title: previous.titulo ?? undefined,
      reopenedBy: { id: session.userId, name: actor?.name ?? undefined },
      fromStatus,
      reason,
      at: now.toISOString(),
    };
    const notifyTitle = previous.ticket_number
      ? `Chamado #${previous.ticket_number} reaberto`
      : 'Chamado reaberto';
    const notifyBody = reason.length > 200 ? reason.slice(0, 200) + '…' : reason;

    const recipients: string[] = [];
    if (previous.assignedToUserId) recipients.push(String(previous.assignedToUserId));
    if (previous.solicitanteId) recipients.push(String(previous.solicitanteId));
    const unique = [...new Set(recipients)];

    await Promise.allSettled([
      ...unique.map((rid) => emitToRoom(`user:${rid}`, 'ticket:reopened', payload)),
      emitToRoom('managers', 'ticket:reopened', payload),
    ]);

    if (unique.length > 0) {
      await Promise.allSettled(
        unique.map((rid) =>
          NotificationModel.create({
            userId: new Types.ObjectId(rid),
            type: 'ticket:reopened',
            title: notifyTitle,
            body: notifyBody,
            data: payload,
            readAt: null,
          }),
        ),
      );
      for (const rid of unique) {
        sendNotificationEmail(rid, 'ticket:reopened', payload).catch(() => {});
      }
    }

    revalidatePath('/gestao');
    revalidatePath(`/meus-chamados/${ticketId}`);
    revalidatePath('/chamados-atribuidos');

    return { ok: true };
  } catch (e) {
    console.error('reopenTicketAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao reabrir chamado. Tente novamente.',
    };
  }
}

/**
 * Busca técnicos elegíveis para um chamado e retorna o melhor candidato (menor carga).
 */
async function findBestTechnician(
  subtypeId: Types.ObjectId,
  excludeId?: Types.ObjectId,
): Promise<{ technician: { _id: Types.ObjectId; name: string } } | null> {
  // Busca técnicos ativos com a especialidade (subtipo)
  const tecnicos = await UserModel.find({
    role: 'Técnico',
    isActive: true,
    specialties: { $in: [subtypeId] },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).lean();

  if (tecnicos.length === 0) {
    return null;
  }

  // Conta carga atual por técnico
  const cargaPorTecnico = await ChamadoModel.aggregate([
    {
      $match: {
        assignedToUserId: { $in: tecnicos.map((t) => t._id) },
        status: { $in: [...ACTIVE_STATUSES] },
      },
    },
    {
      $group: {
        _id: '$assignedToUserId',
        count: { $sum: 1 },
      },
    },
  ]);

  const cargaMap = new Map<string, number>();
  cargaPorTecnico.forEach((item) => {
    cargaMap.set(String(item._id), item.count);
  });

  // Encontra técnico com menor carga que não está sobrecarregado
  let best: { tecnico: (typeof tecnicos)[0]; load: number } | null = null;

  for (const tecnico of tecnicos) {
    const tecnicoId = String(tecnico._id);
    const currentLoad = cargaMap.get(tecnicoId) ?? 0;
    const maxAssignedTickets = tecnico.maxAssignedTickets ?? 5;

    if (currentLoad < maxAssignedTickets) {
      if (!best || currentLoad < best.load) {
        best = { tecnico: tecnico, load: currentLoad };
      }
    }
  }

  if (!best) {
    return null;
  }

  return {
    technician: {
      _id: best.tecnico._id as Types.ObjectId,
      name: best.tecnico.name,
    },
  };
}

/**
 * Atribui um chamado a um técnico.
 * Se preferredTechnicianId for informado, tenta atribuir a ele (se elegível).
 * Caso contrário ou se ele estiver sobrecarregado, faz fallback automático.
 */
export async function assignTicketAction(raw: AssignTicketInput): Promise<AssignTicketResult> {
  try {
    const session = await requireManager();
    const parsed = AssignTicketSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg = first.ticketId?.[0] ?? 'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const { ticketId, preferredTechnicianId } = parsed.data;
    await dbConnect();

    // Busca o chamado
    const chamado = await ChamadoModel.findById(ticketId);
    if (!chamado) {
      return { ok: false, error: 'Chamado não encontrado.' };
    }

    // Valida status (Validado ou Em validação para compatibilidade)
    if (chamado.status !== 'validado') {
      return {
        ok: false,
        error: 'Somente chamados com status "Validado" podem ser atribuídos.',
      };
    }

    // Valida se já está atribuído
    if (chamado.assignedToUserId) {
      return { ok: false, error: 'Chamado já está atribuído a um técnico.' };
    }

    // Valida se tem catalogServiceId
    if (!chamado.catalogServiceId) {
      return {
        ok: false,
        error: 'Chamado não possui serviço catalogado. Classifique o chamado primeiro.',
      };
    }

    // Especialidades são subtipos; obtém o subtypeId do serviço catalogado
    const service = await ServiceCatalogModel.findById(chamado.catalogServiceId)
      .select('subtypeId')
      .lean();
    if (!service?.subtypeId) {
      return {
        ok: false,
        error: 'Serviço catalogado do chamado não possui subtipo definido.',
      };
    }
    // Normaliza para ObjectId (especialidades do técnico = array de subtypeId)
    const subtypeId = new Types.ObjectId(String(service.subtypeId));

    const assignedByUserId = new Types.ObjectId(session.userId);
    const now = new Date();
    let selectedTechnician: { _id: Types.ObjectId; name: string };
    let strategy: 'MANUAL' | 'FALLBACK' = 'MANUAL';

    // Se há técnico preferido, valida ele
    if (preferredTechnicianId) {
      const preferredId = new Types.ObjectId(preferredTechnicianId);
      const tecnico = await UserModel.findById(preferredId).lean();

      if (!tecnico) {
        return { ok: false, error: 'Técnico preferido não encontrado.' };
      }

      if (tecnico.role !== 'Técnico' || !tecnico.isActive) {
        return { ok: false, error: 'Usuário selecionado não é um técnico ativo.' };
      }

      // Verifica se o técnico tem a especialidade (subtipo) exigida pelo serviço catalogado do chamado
      const hasSpecialty =
        tecnico.specialties &&
        Array.isArray(tecnico.specialties) &&
        tecnico.specialties.some((s) => String(s) === String(subtypeId));

      if (!hasSpecialty) {
        return {
          ok: false,
          error: 'Técnico selecionado não possui a especialidade necessária para este chamado.',
        };
      }

      // Verifica carga
      // NOTA (corrida conhecida): esta contagem e o findOneAndUpdate de atribuição
      // (abaixo) não são atômicos entre si. Duas atribuições concorrentes de tickets
      // diferentes ao mesmo técnico com carga = max-1 podem ambas passar e estourar o
      // limite em 1. A correção limpa exige transação (replica set — o Mongo de
      // produção é standalone hoje) ou um contador denormalizado no User. Mantido
      // como dívida técnica documentada; impacto: raro overflow de 1 ticket.
      const currentLoad = await ChamadoModel.countDocuments({
        assignedToUserId: preferredId,
        status: { $in: [...ACTIVE_STATUSES] },
      });

      const maxAssignedTickets = tecnico.maxAssignedTickets ?? 5;

      if (currentLoad >= maxAssignedTickets) {
        // Técnico sobrecarregado - faz fallback
        const fallback = await findBestTechnician(subtypeId, preferredId);
        if (!fallback) {
          return {
            ok: false,
            error:
              'Técnico selecionado está sobrecarregado e não há outros técnicos disponíveis para esta especialidade no momento.',
          };
        }
        selectedTechnician = fallback.technician;
        strategy = 'FALLBACK';
      } else {
        selectedTechnician = {
          _id: preferredId,
          name: tecnico.name,
        };
      }
    } else {
      // Sem preferência - busca automaticamente
      const best = await findBestTechnician(subtypeId);
      if (!best) {
        return {
          ok: false,
          error: 'Nenhum técnico disponível para esta especialidade no momento.',
        };
      }
      selectedTechnician = best.technician;
      strategy = 'FALLBACK';
    }

    const responseStartedAt = now;
    const responseBreachedAt = evaluateResponseBreach(
      now,
      chamado.sla?.responseDueAt ?? null,
      chamado.sla?.responseStartedAt ?? null,
    );

    const updatePayload: Record<string, unknown> = {
      status: 'em atendimento',
      assignedToUserId: selectedTechnician._id,
      assignedAt: now,
      assignedByUserId,
      'sla.responseStartedAt': responseStartedAt,
    };
    if (responseBreachedAt) {
      updatePayload['sla.responseBreachedAt'] = responseBreachedAt;
    }

    const updateResult = await ChamadoModel.findOneAndUpdate(
      {
        _id: ticketId,
        status: 'validado',
        $or: [{ assignedToUserId: { $exists: false } }, { assignedToUserId: null }],
      },
      { $set: updatePayload },
      { new: true },
    );

    if (!updateResult) {
      return {
        ok: false,
        error:
          'Não foi possível atribuir o chamado. Ele pode ter sido atribuído por outro usuário ou o status mudou.',
      };
    }

    // Registra no histórico (status passa para Em atendimento)
    await ChamadoHistoryModel.create({
      chamadoId: chamado._id,
      userId: assignedByUserId,
      action: 'atribuicao_tecnico',
      statusAnterior: chamado.status,
      statusNovo: 'em atendimento',
      observacoes: `Atribuído a ${selectedTechnician.name} (${strategy === 'MANUAL' ? 'Manual' : 'Fallback automático'}). Status alterado para Em atendimento. Especialidade: ${String(subtypeId)}`,
    });

    // Notificação persistida + evento realtime para o técnico (após sucesso no Mongo)
    const assignedByUser = await UserModel.findById(assignedByUserId).select('name').lean();
    const technicianIdStr = String(selectedTechnician._id);
    await notificarAtribuicao({
      chamadoId: String(ticketId),
      ticketNumber: updateResult.ticket_number,
      titulo: updateResult.titulo,
      solicitanteId: String(updateResult.solicitanteId),
      tecnico: { id: technicianIdStr, name: selectedTechnician.name },
      assignedBy: { id: String(assignedByUserId), name: assignedByUser?.name ?? undefined },
      at: now,
    });

    // Veredito da gestão sobre o técnico que a IA sugeriu (spec 0002).
    await aplicarVeredito({
      viewer: { userId: session.userId, role: session.role },
      chamadoId: ticketId,
      vereditos: [{ campo: 'tecnico', valor: { tecnicoId: technicianIdStr } }],
    });

    revalidatePath('/gestao');
    revalidatePath(`/meus-chamados/${ticketId}`);

    return {
      ok: true,
      technicianId: technicianIdStr,
      technicianName: selectedTechnician.name,
      strategy,
    };
  } catch (e) {
    console.error('assignTicketAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao atribuir chamado. Tente novamente.',
    };
  }
}

/**
 * Reatribui um chamado (status "em atendimento") para outro técnico elegível.
 * Apenas Admin/Preposto. Mantém status "em atendimento". O filtro atômico
 * repete `catalogServiceId`, `assignedToUserId` e `sla.responseStartedAt`
 * lidos (spec 0009, AC-15): duas reatribuições concorrentes nunca passam as
 * duas, e o técnico perdedor nunca é avisado por engano. Os passos depois do
 * update (nome do técnico anterior, `correcao_gestao`, o histórico
 * `reatribuicao_tecnico`, o aviso) cada um com seu `try` (AC-21): uma falha
 * vira log e nunca desfaz a reatribuição já gravada. Grava `correcao_gestao`
 * com o motivo e avisa só o técnico novo por `notificarAtribuicao`
 * (`avisarSolicitante: false`). O texto visível de `reatribuicao_tecnico` não
 * leva mais "Observações" (o motivo já está em `correcao_gestao`).
 */
export async function reassignTicketAction(
  raw: ReassignTicketInput,
): Promise<ReassignTicketResult> {
  try {
    const session = await requireManager();
    const parsed = ReassignTicketSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.ticketId?.[0] ??
        first.preferredTechnicianId?.[0] ??
        first.notes?.[0] ??
        'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const { ticketId, preferredTechnicianId, notes } = parsed.data;
    await dbConnect();

    const chamado = await ChamadoModel.findById(ticketId).lean();
    if (!chamado) {
      return { ok: false, error: 'Chamado não encontrado.' };
    }

    if (chamado.status !== 'em atendimento') {
      logRevisaoIa({
        chamadoId: ticketId,
        campo: 'tecnico',
        operacao: 'reatribuir',
        resultado: 'recusada',
      });
      return {
        ok: false,
        error: 'Somente chamados com status "Em atendimento" podem ser reatribuídos.',
      };
    }

    if (!chamado.catalogServiceId) {
      return { ok: false, error: 'Chamado não possui serviço catalogado.' };
    }

    const currentAssignedId = chamado.assignedToUserId ? String(chamado.assignedToUserId) : null;
    if (!currentAssignedId) {
      return { ok: false, error: 'Chamado não está atribuído a um técnico.' };
    }

    if (preferredTechnicianId === currentAssignedId) {
      return { ok: false, error: 'Selecione outro técnico para reatribuir.' };
    }

    const newTechId = new Types.ObjectId(preferredTechnicianId);
    const newTech = await UserModel.findById(newTechId).lean();
    if (!newTech) {
      return { ok: false, error: 'Técnico selecionado não encontrado.' };
    }

    if (newTech.role !== 'Técnico' || !newTech.isActive) {
      return { ok: false, error: 'Usuário selecionado não é um técnico ativo.' };
    }

    // Especialidades são subtipos; obtém o subtypeId do serviço do chamado
    const service = await ServiceCatalogModel.findById(chamado.catalogServiceId)
      .select('subtypeId')
      .lean();
    if (!service?.subtypeId) {
      return { ok: false, error: 'Serviço catalogado do chamado não possui subtipo definido.' };
    }
    // Normaliza para ObjectId (especialidades do técnico = array de subtypeId)
    const subtypeId = new Types.ObjectId(String(service.subtypeId));

    const hasSpecialty =
      newTech.specialties &&
      Array.isArray(newTech.specialties) &&
      newTech.specialties.some((s) => String(s) === String(subtypeId));
    if (!hasSpecialty) {
      return {
        ok: false,
        error: 'Técnico selecionado não possui a especialidade necessária para este chamado.',
      };
    }

    const currentLoad = await ChamadoModel.countDocuments({
      assignedToUserId: newTechId,
      status: { $in: [...ACTIVE_STATUSES] },
    });
    const maxAssignedTickets = newTech.maxAssignedTickets ?? 5;
    if (currentLoad >= maxAssignedTickets) {
      return {
        ok: false,
        error: 'Técnico selecionado está sobrecarregado. Escolha outro técnico.',
      };
    }

    const now = new Date();
    const reassignedByUserId = new Types.ObjectId(session.userId);

    const slaUpdate: Record<string, unknown> = {};
    if (!chamado.sla?.responseStartedAt) {
      slaUpdate['sla.responseStartedAt'] = now;
      const responseBreachedAt = evaluateResponseBreach(
        now,
        chamado.sla?.responseDueAt ?? null,
        null,
      );
      if (responseBreachedAt) slaUpdate['sla.responseBreachedAt'] = responseBreachedAt;
    }

    const updatePayload: Record<string, unknown> = {
      assignedToUserId: newTechId,
      reassignedAt: now,
      reassignedByUserId,
      reassignmentNotes: (notes ?? '').trim() || '',
      ...slaUpdate,
    };

    // Passo 1 (único que decide se a reatribuição vale): o filtro repete
    // status, serviço, técnico atual e o início de resposta lidos (spec 0009,
    // AC-15) — o mesmo `assignedToUserId` que decide o payload acima, e
    // `responseStartedAt` porque `slaUpdate` só o grava quando ainda é nulo.
    const updated = await ChamadoModel.findOneAndUpdate(
      {
        _id: ticketId,
        status: 'em atendimento',
        catalogServiceId: chamado.catalogServiceId,
        assignedToUserId: chamado.assignedToUserId,
        'sla.responseStartedAt': chamado.sla?.responseStartedAt ?? null,
      },
      { $set: updatePayload },
      { new: true },
    );

    if (!updated) {
      logRevisaoIa({
        chamadoId: ticketId,
        campo: 'tecnico',
        operacao: 'reatribuir',
        resultado: 'recusada',
      });
      return {
        ok: false,
        error: 'Não foi possível reatribuir. O chamado pode ter mudado de status.',
      };
    }

    let resultadoLog: Parameters<typeof logRevisaoIa>[0]['resultado'] = 'ok';
    const registrarFalha = (passo: string, erro: string) => {
      if (resultadoLog === 'ok') resultadoLog = `parcial:${passo}`;
      console.error(
        '[gestao]',
        JSON.stringify({ chamadoId: ticketId, acao: 'reatribuir', passo, erro }),
      );
    };

    // Passo 2: nome do técnico anterior, para o texto dos passos seguintes.
    // Isolado como os demais (AC-21): falhar aqui não desfaz a reatribuição
    // já gravada no passo 1.
    let previousName = 'Técnico anterior';
    try {
      const previousTech = await UserModel.findById(currentAssignedId).select('name').lean();
      previousName = previousTech?.name ?? 'Técnico anterior';
    } catch (err) {
      registrarFalha('tecnico_anterior', err instanceof Error ? err.message : String(err));
    }

    // Passo 3: entrada só da gestão, com o motivo (AC-13).
    try {
      await ChamadoHistoryModel.create({
        chamadoId: updated._id,
        userId: reassignedByUserId,
        action: 'correcao_gestao',
        observacoes: `${DECISAO_CAMPO_LABELS.tecnico}: ${previousName} → ${newTech.name}. Motivo: ${notes}`,
      });
    } catch (err) {
      registrarFalha('correcao_gestao', err instanceof Error ? err.message : String(err));
    }

    // Passo 4: história visível a todos, sem "Observações" — o motivo já vive
    // em `correcao_gestao` (AC-13).
    try {
      await ChamadoHistoryModel.create({
        chamadoId: updated._id,
        userId: reassignedByUserId,
        action: 'reatribuicao_tecnico',
        statusAnterior: 'em atendimento',
        statusNovo: 'em atendimento',
        observacoes: `Reatribuído de ${previousName} para ${newTech.name}. Reatribuído por sessão (Admin/Preposto).`,
      });
    } catch (err) {
      registrarFalha('reatribuicao_historico', err instanceof Error ? err.message : String(err));
    }

    // Passo 5 (existente, intacto): trocar de técnico é uma correção da
    // decisão da IA (spec 0002).
    await aplicarVeredito({
      viewer: { userId: session.userId, role: session.role },
      chamadoId: ticketId,
      vereditos: [{ campo: 'tecnico', valor: { tecnicoId: String(newTech._id) } }],
      motivo: notes,
    });

    // Passo 6: avisa o técnico novo, sem avisar o solicitante (AC-15). Falha
    // vira log e não desfaz a reatribuição.
    try {
      const gestorUser = await UserModel.findById(session.userId).select('name').lean();
      await notificarAtribuicao({
        chamadoId: String(updated._id),
        ticketNumber: updated.ticket_number,
        titulo: updated.titulo,
        solicitanteId: String(updated.solicitanteId),
        tecnico: { id: String(newTech._id), name: newTech.name },
        assignedBy: { id: session.userId, name: gestorUser?.name ?? undefined },
        at: now,
        avisarSolicitante: false,
      });
    } catch (err) {
      registrarFalha('aviso', err instanceof Error ? err.message : String(err));
    }

    logRevisaoIa({
      chamadoId: ticketId,
      campo: 'tecnico',
      operacao: 'reatribuir',
      resultado: resultadoLog,
    });

    revalidatePath('/gestao');
    revalidatePath(`/meus-chamados/${ticketId}`);

    return {
      ok: true,
      technicianId: String(newTech._id),
      technicianName: newTech.name,
    };
  } catch (e) {
    console.error('reassignTicketAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao reatribuir chamado. Tente novamente.',
    };
  }
}

/**
 * Recusa um chamado na triagem (Admin ou Preposto). Pré-condição: status "aberto".
 * Exige justificativa obrigatória (min 10 chars) e aceita orientação opcional.
 */
export async function rejectTicketAction(raw: RejectTicketInput): Promise<RejectTicketResult> {
  try {
    const session = await requireManager();
    const parsed = RejectTicketSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.rejectionReason?.[0] ??
        first.chamadoId?.[0] ??
        'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const { chamadoId, rejectionReason, rejectionGuidance } = parsed.data;
    await dbConnect();

    const doc = await ChamadoModel.findById(chamadoId);
    if (!doc) return { ok: false, error: 'Chamado não encontrado.' };
    if (doc.status !== 'aberto') {
      return { ok: false, error: 'Somente chamados com status "aberto" podem ser recusados.' };
    }

    const now = new Date();
    const userId = new Types.ObjectId(session.userId);

    await ChamadoModel.updateOne(
      { _id: chamadoId },
      {
        $set: {
          status: 'recusado',
          rejectedAt: now,
          rejectedByUserId: userId,
          rejectionReason,
          rejectionGuidance: rejectionGuidance ?? '',
        },
      },
    );

    const obsParts = [`Justificativa: ${rejectionReason}`];
    if (rejectionGuidance) obsParts.push(`Orientação: ${rejectionGuidance}`);
    const observacoes = obsParts.join(' | ');

    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId,
      action: 'recusa',
      statusAnterior: 'aberto',
      statusNovo: 'recusado',
      observacoes,
    });

    const solicitanteId = doc.solicitanteId.toString();
    const rejectedByUser = await UserModel.findById(session.userId).select('name').lean();

    await NotificationModel.create({
      userId: doc.solicitanteId,
      type: 'ticket:rejected',
      title: 'Chamado recusado',
      body: `O chamado ${doc.ticket_number} foi recusado. Motivo: ${rejectionReason}`,
      data: { ticketId: chamadoId, ticketNumber: doc.ticket_number },
    }).catch(() => {});
    sendNotificationEmail(solicitanteId, 'ticket:rejected', {
      ticketId: chamadoId,
      ticketNumber: doc.ticket_number,
      title: doc.titulo,
    }).catch(() => {});

    await emitToRoom(`user:${solicitanteId}`, 'ticket:rejected', {
      ticketId: chamadoId,
      ticketNumber: doc.ticket_number,
      title: doc.titulo,
      rejectedBy: { id: session.userId, name: rejectedByUser?.name ?? undefined },
      rejectionReason,
      rejectionGuidance: rejectionGuidance || undefined,
      at: now.toISOString(),
    });

    revalidatePath('/gestao');
    revalidatePath(`/meus-chamados/${chamadoId}`);

    return { ok: true };
  } catch (e) {
    console.error('rejectTicketAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao recusar chamado. Tente novamente.',
    };
  }
}

export type ConfirmarDecisoesIaResultadoCampo = {
  campo: DecisaoCampo;
  ok: boolean;
  error?: string;
};
export type ConfirmarDecisoesIaResult =
  | { ok: true; resultados: ConfirmarDecisoesIaResultadoCampo[] }
  | { ok: false; error: string };

/**
 * Confirma que a decisão da IA continua valendo — uma decisão, ou todas as
 * pendentes do chamado quando `campos` fica de fora (spec 0009, AC-5). Campo
 * pedido que não está pendente é ignorado, sem erro.
 */
export async function confirmarDecisoesIaAction(
  raw: ConfirmarDecisoesIaInput,
): Promise<ConfirmarDecisoesIaResult> {
  try {
    const session = await requireManager();
    const parsed = confirmarDecisoesIaSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Dados inválidos. Verifique os campos.' };
    }

    const { chamadoId, campos } = parsed.data;
    await dbConnect();

    const camposPendentes = await camposPendentesDeConfirmacao(chamadoId, campos);
    if (camposPendentes.length === 0) {
      logRevisaoIa({ chamadoId, campo: null, operacao: 'confirmar', resultado: 'recusada' });
      return { ok: false, error: 'Não há decisão pendente de confirmação para este chamado.' };
    }

    const resultados: ConfirmarDecisoesIaResultadoCampo[] = [];
    for (const campo of camposPendentes) {
      const resultado = await confirmarDecisao({
        viewer: { userId: session.userId, role: session.role },
        chamadoId,
        campo,
      });
      logRevisaoIa({
        chamadoId,
        campo,
        operacao: 'confirmar',
        resultado: resultado.ok ? 'ok' : 'recusada',
      });
      resultados.push(
        resultado.ok ? { campo, ok: true } : { campo, ok: false, error: resultado.reason },
      );
    }

    revalidatePath('/gestao');

    return { ok: true, resultados };
  } catch (e) {
    console.error('confirmarDecisoesIaAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao confirmar decisão. Tente novamente.',
    };
  }
}

/**
 * Vincula, troca ou remove o equipamento de um chamado ainda aberto (spec
 * 0011, AC-16). `verifySession()` em vez de `requireManager()`: o `redirect()`
 * lançado dentro do `try` viraria erro genérico, e o perfil sem permissão
 * precisa receber `ok: false` (AC-17).
 */
export async function vincularAtivoChamadoAction(
  raw: VincularAtivoChamadoInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await verifySession();
  if (!session || !canManage(session.role)) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = VincularAtivoChamadoSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  try {
    await dbConnect();
    const r = await vincularAtivoAoChamado(
      parsed.data.chamadoId,
      parsed.data.ativoId,
      session.userId,
    );
    if (!r.ok) return r;
    if (r.mudou) {
      revalidatePath('/gestao');
      revalidatePath(`/meus-chamados/${parsed.data.chamadoId}`);
      revalidatePath('/ativos', 'layout');
    }
    return { ok: true };
  } catch (e) {
    console.error('vincularAtivoChamadoAction:', e);
    return { ok: false, error: 'Não foi possível mudar o equipamento agora. Tente de novo.' };
  }
}
