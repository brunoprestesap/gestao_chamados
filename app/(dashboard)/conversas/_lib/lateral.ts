import 'server-only';

import { Types } from 'mongoose';

import { listarRascunhos, type Viewer } from '@/lib/conversas';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import {
  CHAMADO_STATUS_ATIVOS_TECNICO,
  CHAMADO_STATUS_LABELS,
  CHAMADO_STATUS_NAO_FINALIZADOS,
  type ChamadoStatus,
} from '@/shared/chamados/chamado.constants';

import { RASCUNHO_APOIO } from '../_constants';
import type { CursorLateral, ItemLateral } from '../_types';

/**
 * A lateral de `/conversas` (spec 0003, AC-2): os rascunhos ativos em cima, os
 * chamados do solicitante embaixo. Tudo montado no servidor, com o endereço de
 * cada linha já calculado, para a primeira pintura sair pronta.
 */

/** Chamados por página. Rascunhos não paginam: o teto deles é 5. */
export const CHAMADOS_POR_PAGINA = 20;

type ChamadoDaLateral = {
  _id: Types.ObjectId;
  ticket_number?: string;
  titulo?: string;
  status?: string;
  updatedAt?: Date;
  conversaId?: Types.ObjectId | null;
  assignedToUserId?: { name?: string } | Types.ObjectId | null;
};

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

function nomeDoTecnico(ref: ChamadoDaLateral['assignedToUserId']): string | null {
  if (!ref || ref instanceof Types.ObjectId) return null;
  const nome = (ref as { name?: string }).name;
  return typeof nome === 'string' && nome.trim() ? nome : null;
}

function rotuloDaSituacao(status: string | undefined): string {
  return CHAMADO_STATUS_LABELS[status as ChamadoStatus] ?? 'Aberto';
}

/**
 * Linha de apoio do chamado: o número e, quando há técnico atendendo, quem
 * está com ele. Sem técnico fica só o número, porque a situação já aparece na
 * marca colorida ao lado e repeti-la só faria o leitor de tela ouvir duas vezes.
 */
function apoioDoChamado(chamado: ChamadoDaLateral): string {
  const numero = chamado.ticket_number ? `#${chamado.ticket_number}` : 'Sem número';
  const tecnico = nomeDoTecnico(chamado.assignedToUserId);

  if (tecnico && chamado.status === 'em atendimento') {
    return `${numero} · ${primeiroNome(tecnico)} está atendendo`;
  }
  return numero;
}

function chamadoParaItem(chamado: ChamadoDaLateral): ItemLateral {
  const chamadoId = String(chamado._id);
  // O endereço é o da conversa quando ela existe, e o do chamado quando não
  // existe (chamado aberto pelo formulário). A rota resolve nessa mesma ordem.
  const alvo = chamado.conversaId ? String(chamado.conversaId) : chamadoId;

  return {
    tipo: 'chamado',
    id: chamadoId,
    href: `/conversas/${alvo}`,
    titulo: chamado.titulo?.trim() || 'Chamado sem título',
    apoio: apoioDoChamado(chamado),
    situacao: rotuloDaSituacao(chamado.status),
    statusChave: chamado.status ?? null,
    em: (chamado.updatedAt ?? new Date()).toISOString(),
    confirmando: false,
  };
}

/**
 * O filtro base por papel (spec 0005, AC-8): o solicitante vê só os próprios
 * chamados, como sempre; o técnico vê os que estão atribuídos a ele e ainda
 * ativos; a gestão vê os que ainda não foram encerrados nem cancelados.
 */
function filtroPorPapel(viewer: Viewer): Record<string, unknown> {
  if (viewer.role === 'Técnico') {
    return {
      assignedToUserId: new Types.ObjectId(viewer.userId),
      status: { $in: CHAMADO_STATUS_ATIVOS_TECNICO },
    };
  }
  if (viewer.role === 'Admin' || viewer.role === 'Preposto') {
    return { status: { $in: CHAMADO_STATUS_NAO_FINALIZADOS } };
  }
  return { solicitanteId: new Types.ObjectId(viewer.userId) };
}

/**
 * Os chamados do papel de quem vê, do mais recente para o mais antigo, com
 * cursor composto de `updatedAt` mais `_id`: data igual nunca repete nem
 * esconde chamado. Usa o índice `{ solicitanteId: 1, updatedAt: -1, _id: -1 }`
 * (solicitante) ou `{ assignedToUserId: 1, updatedAt: -1, _id: -1 }` (técnico).
 */
export async function lerChamadosDaLateral(
  viewer: Viewer,
  antesDe?: CursorLateral | null,
): Promise<{ itens: ItemLateral[]; temMais: boolean }> {
  const filtro: Record<string, unknown> = filtroPorPapel(viewer);

  if (antesDe) {
    const em = new Date(antesDe.em);
    if (!Number.isNaN(em.getTime()) && Types.ObjectId.isValid(antesDe.id)) {
      filtro.$or = [
        { updatedAt: { $lt: em } },
        { updatedAt: em, _id: { $lt: new Types.ObjectId(antesDe.id) } },
      ];
    }
  }

  // Um a mais do que a página: é assim que se sabe se há próxima sem contar tudo.
  const docs = (await ChamadoModel.find(filtro)
    .select('ticket_number titulo status updatedAt conversaId assignedToUserId')
    .populate('assignedToUserId', 'name')
    .sort({ updatedAt: -1, _id: -1 })
    .limit(CHAMADOS_POR_PAGINA + 1)
    .lean()) as unknown as ChamadoDaLateral[];

  const temMais = docs.length > CHAMADOS_POR_PAGINA;
  const pagina = temMais ? docs.slice(0, CHAMADOS_POR_PAGINA) : docs;

  return { itens: pagina.map(chamadoParaItem), temMais };
}

/** Cursor da próxima página: o último chamado exibido. */
export function cursorDe(itens: ItemLateral[]): CursorLateral | null {
  const ultimo = [...itens].reverse().find((item) => item.tipo === 'chamado');
  return ultimo ? { em: ultimo.em, id: ultimo.id } : null;
}

export type Lateral = {
  rascunhos: ItemLateral[];
  chamados: ItemLateral[];
  temMais: boolean;
  cursor: CursorLateral | null;
};

/** A lateral inteira da primeira pintura. Nenhuma falha derruba a tela. */
export async function montarLateral(viewer: Viewer): Promise<Lateral> {
  await dbConnect();

  const [listados, chamados] = await Promise.all([
    listarRascunhos(viewer),
    lerChamadosDaLateral(viewer),
  ]);

  const rascunhos: ItemLateral[] = listados.ok
    ? listados.rascunhos.map((rascunho) => ({
        tipo: 'rascunho' as const,
        id: rascunho.id,
        href: `/conversas/${rascunho.id}`,
        titulo: rascunho.previa.trim() || 'Conversa sem texto',
        apoio: RASCUNHO_APOIO,
        situacao: rascunho.confirmando ? 'Confirmando' : 'Rascunho',
        statusChave: null,
        em: rascunho.ultimaMensagemEm.toISOString(),
        confirmando: rascunho.confirmando,
      }))
    : [];

  return {
    rascunhos,
    chamados: chamados.itens,
    temMais: chamados.temMais,
    cursor: cursorDe(chamados.itens),
  };
}
