import 'server-only';

import { Types } from 'mongoose';

import { interesseAtivo } from '@/lib/chamados/interessados';
import type { Viewer } from '@/lib/conversas';
import { AtivoModel } from '@/models/Ativo';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import {
  CHAMADO_STATUS_LABELS,
  type ChamadoStatus,
  SERVICO_A_DEFINIR,
} from '@/shared/chamados/chamado.constants';

import type { AcompanhamentoLido, MarcoAcompanhamento } from '../_types';

/**
 * A vista de quem acompanha um chamado de outra pessoa (spec 0017, AC-14).
 * Leitura própria, separada da linha do tempo do chamado: só número, serviço,
 * local, equipamento, status, abertura, desde quando acompanha e os marcos de
 * mudança de status. Sem interesse ativo, responde `nao_encontrada`, o mesmo
 * de um chamado que não existe.
 */

/** Teto de marcos lidos: um chamado raramente muda de status tantas vezes. */
const MARCOS_MAX = 50;

type ChamadoLido = {
  ticket_number: string;
  status: ChamadoStatus;
  createdAt: Date;
  localExato?: string | null;
  catalogServiceId?: Types.ObjectId | null;
  ativoId?: Types.ObjectId | null;
};

export async function lerAcompanhamento(
  viewer: Viewer,
  chamadoId: string,
): Promise<{ ok: true; acompanhamento: AcompanhamentoLido } | { ok: false }> {
  if (!Types.ObjectId.isValid(chamadoId)) return { ok: false };

  const interesse = await interesseAtivo(chamadoId, viewer.userId);
  if (!interesse) return { ok: false };

  const chamado = await ChamadoModel.findById(new Types.ObjectId(chamadoId))
    .select('ticket_number status createdAt localExato catalogServiceId ativoId')
    .lean<ChamadoLido | null>();
  if (!chamado) return { ok: false };

  const [servico, ativo, historico] = await Promise.all([
    chamado.catalogServiceId
      ? ServiceCatalogModel.findById(chamado.catalogServiceId)
          .select('name')
          .lean<{ name: string } | null>()
      : null,
    chamado.ativoId
      ? AtivoModel.findById(chamado.ativoId).select('codigo').lean<{ codigo: string } | null>()
      : null,
    // Só a mudança de status e a data: nunca autor nem texto do histórico.
    ChamadoHistoryModel.find({ chamadoId: new Types.ObjectId(chamadoId) })
      .select('statusAnterior statusNovo createdAt')
      .sort({ createdAt: 1 })
      .limit(MARCOS_MAX)
      .lean<
        {
          _id: Types.ObjectId;
          statusAnterior?: string | null;
          statusNovo?: string | null;
          createdAt: Date;
        }[]
      >(),
  ]);

  const marcos: MarcoAcompanhamento[] = historico.flatMap((h) => {
    if (!h.statusNovo || h.statusNovo === h.statusAnterior) return [];
    const rotulo = CHAMADO_STATUS_LABELS[h.statusNovo as ChamadoStatus];
    return rotulo ? [{ id: String(h._id), rotulo, em: h.createdAt.toISOString() }] : [];
  });

  // Acompanhar nunca revela um local que o cartão escondeu (AC-14).
  const local = interesse.localVisivel ? (chamado.localExato ?? '').trim() : '';

  return {
    ok: true,
    acompanhamento: {
      chamadoId,
      ticketNumber: chamado.ticket_number,
      rotuloServico: servico?.name || SERVICO_A_DEFINIR,
      localExato: local || null,
      ativoCodigo: ativo?.codigo ?? null,
      situacao: CHAMADO_STATUS_LABELS[chamado.status] ?? 'Aberto',
      statusChave: chamado.status,
      abertoEm: chamado.createdAt.toISOString(),
      acompanhaDesde: interesse.criadoEm.toISOString(),
      marcos,
    },
  };
}
