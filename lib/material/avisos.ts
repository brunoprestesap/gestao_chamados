import 'server-only';

import { Types } from 'mongoose';

import { enviarEmailCotacao } from '@/lib/email/aviso-cotacao';
import { emitToRoom } from '@/lib/realtime-emit';
import { ChamadoModel } from '@/models/Chamado';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { NotificationModel } from '@/models/Notification';
import { UserModel } from '@/models/user.model';
import {
  PRAZO_PESQUISA_URGENCIA_DIAS,
  type SituacaoCotacao,
} from '@/shared/material/material.constants';
import {
  tituloAvisoCotacao,
  tituloAvisoNotaFiscal,
  tituloAvisoPesquisaAtrasada,
  tituloAvisoPesquisaCompleta,
} from '@/shared/material/mensagens';
import type { MaterialCotacaoSituacaoPayload } from '@/shared/socket';

import { aprovadoresQueCobrem, designadosVigentes } from './papeis';

/**
 * Avisos da cotação de material (spec 0019, AC-16): quem age na etapa
 * seguinte recebe `Notification`, e-mail e Socket.IO. Nenhum canal leva
 * valor. Fire and forget: nunca lança.
 */

/** Para onde o aviso leva: a fila (`cotacoes`) ou a tela do técnico (`chamado`). */
type Destino = 'cotacoes' | 'chamado';

export function urlDoAviso(destino: Destino, cotacaoId: string, chamadoId: string): string {
  return destino === 'chamado' ? `/chamados-atribuidos/${chamadoId}` : `/cotacoes/${cotacaoId}`;
}

async function destinatarios(
  situacao: SituacaoCotacao,
  cot: {
    chamadoId: Types.ObjectId;
    montadoPorUserId: Types.ObjectId | null;
    valorTotalCentavos: number;
  },
): Promise<{ userId: string; destino: Destino }[]> {
  const fila = (ids: string[]) => ids.map((userId) => ({ userId, destino: 'cotacoes' as const }));
  switch (situacao) {
    case 'rascunho':
      return fila((await designadosVigentes('responsavel_tecnico')).map((d) => d.userId));
    case 'enviada':
      return fila((await designadosVigentes('fiscal')).map((d) => d.userId));
    case 'em_aprovacao':
      return fila((await aprovadoresQueCobrem(cot.valorTotalCentavos)).map((d) => d.userId));
    case 'executada':
      return fila((await designadosVigentes('gestor')).map((d) => d.userId));
    case 'atestada':
      return cot.montadoPorUserId ? fila([String(cot.montadoPorUserId)]) : [];
    case 'devolvida':
    case 'reprovada':
    case 'autorizada':
    case 'cancelada': {
      const out: { userId: string; destino: Destino }[] = [];
      if (cot.montadoPorUserId) {
        out.push({ userId: String(cot.montadoPorUserId), destino: 'cotacoes' });
      }
      const chamado = await ChamadoModel.findById(cot.chamadoId).select('assignedToUserId').lean();
      if (chamado?.assignedToUserId) {
        out.push({ userId: String(chamado.assignedToUserId), destino: 'chamado' });
      }
      return out;
    }
    default:
      return [];
  }
}

export async function avisarSituacao(
  cotacaoId: string,
  situacao: SituacaoCotacao,
  autorUserId: string | null,
): Promise<void> {
  try {
    const cot = await CotacaoMaterialModel.findById(cotacaoId)
      .select('numero chamadoId montadoPorUserId valorTotalCentavos urgencia')
      .lean();
    if (!cot) return;
    const lista = await destinatarios(situacao, {
      ...cot,
      montadoPorUserId: cot.montadoPorUserId ?? null,
    });
    // Fatia 4: a urgência pedida e ainda não recusada tem título próprio (AC-35).
    const urgente = !!cot.urgencia?.pedida && cot.urgencia.decisao !== 'recusada';
    await entregar(
      cot,
      situacao,
      lista,
      autorUserId,
      tituloAvisoCotacao(cot.numero, situacao, urgente),
    );
  } catch (e) {
    console.error('[material] aviso de cotação falhou:', e);
  }
}

/**
 * A pesquisa da urgência completou (AC-35): avisa os gestores vigentes, sem
 * valor, como a nota fiscal. A situação não muda, por isso o aviso é próprio.
 */
export async function avisarPesquisaCompleta(
  cotacaoId: string,
  autorUserId: string | null,
): Promise<void> {
  try {
    const cot = await CotacaoMaterialModel.findById(cotacaoId)
      .select('numero chamadoId situacao')
      .lean();
    if (!cot) return;
    const lista = (await designadosVigentes('gestor')).map((d) => ({
      userId: d.userId,
      destino: 'cotacoes' as const,
    }));
    await entregar(
      cot,
      cot.situacao as SituacaoCotacao,
      lista,
      autorUserId,
      tituloAvisoPesquisaCompleta(cot.numero),
      { aviso: 'pesquisa_completa' },
    );
  } catch (e) {
    console.error('[material] aviso de pesquisa completa falhou:', e);
  }
}

/**
 * Rodada diária: a urgência aceita cuja pesquisa continua incompleta mais de
 * `PRAZO_PESQUISA_URGENCIA_DIAS` dias corridos depois da autorização avisa os
 * gestores vigentes, sem valor e uma vez por autorização (o `alterar` e a
 * nova autorização recomeçam a conta). Sem gestor vigente, tenta no dia seguinte.
 */
export async function avisarPesquisasAtrasadas(agora = new Date()): Promise<{ avisadas: number }> {
  const limite = new Date(agora.getTime() - PRAZO_PESQUISA_URGENCIA_DIAS * 86_400_000);
  const atrasadas = await CotacaoMaterialModel.find({
    situacao: { $in: ['autorizada', 'executada'] },
    'urgencia.decisao': 'aceita',
    'urgencia.pesquisaCompletaEm': null,
    autorizadoEm: { $lte: limite },
  })
    .select('numero chamadoId situacao autorizadoEm')
    .lean();
  if (atrasadas.length === 0) return { avisadas: 0 };
  const gestores = (await designadosVigentes('gestor')).map((d) => ({
    userId: d.userId,
    destino: 'cotacoes' as const,
  }));
  if (gestores.length === 0) return { avisadas: 0 };
  let avisadas = 0;
  for (const cot of atrasadas) {
    const jaAvisada = await NotificationModel.exists({
      type: 'material:cotacao',
      'data.cotacaoId': String(cot._id),
      'data.aviso': 'pesquisa_atrasada',
      createdAt: { $gte: cot.autorizadoEm },
    });
    if (jaAvisada) continue;
    try {
      await entregar(
        cot,
        cot.situacao as SituacaoCotacao,
        gestores,
        null,
        tituloAvisoPesquisaAtrasada(cot.numero, PRAZO_PESQUISA_URGENCIA_DIAS),
        { aviso: 'pesquisa_atrasada' },
      );
      avisadas++;
    } catch (e) {
      console.error('[material] aviso de pesquisa atrasada falhou:', e);
    }
  }
  return { avisadas };
}

/**
 * A nota fiscal chegou (AC-22): avisa os gestores vigentes, sem valor. A
 * situação não muda (continua `atestada`), por isso o aviso é próprio.
 */
export async function avisarNotaFiscal(
  cotacaoId: string,
  autorUserId: string | null,
): Promise<void> {
  try {
    const cot = await CotacaoMaterialModel.findById(cotacaoId).select('numero chamadoId').lean();
    if (!cot) return;
    const lista = (await designadosVigentes('gestor')).map((d) => ({
      userId: d.userId,
      destino: 'cotacoes' as const,
    }));
    await entregar(cot, 'atestada', lista, autorUserId, tituloAvisoNotaFiscal(cot.numero), {
      aviso: 'nota_fiscal',
    });
  } catch (e) {
    console.error('[material] aviso de nota fiscal falhou:', e);
  }
}

/** Grava a `Notification`, manda o e-mail e o evento Socket.IO para cada pessoa, uma vez. */
async function entregar(
  cot: { _id: Types.ObjectId; numero: string; chamadoId: Types.ObjectId },
  situacao: SituacaoCotacao,
  destinos: { userId: string; destino: Destino }[],
  autorUserId: string | null,
  titulo: string,
  marca: Pick<MaterialCotacaoSituacaoPayload, 'aviso'> = {},
): Promise<void> {
  const cotacaoId = String(cot._id);
  const lista = destinos.filter((d) => d.userId !== autorUserId);
  // Uma pessoa, um aviso: o técnico que também é responsável técnico vai à fila.
  const porUsuario = new Map<string, Destino>();
  for (const d of lista) if (!porUsuario.has(d.userId)) porUsuario.set(d.userId, d.destino);
  if (porUsuario.size === 0) return;

  const chamadoId = String(cot.chamadoId);
  const at = new Date().toISOString();
  const data: MaterialCotacaoSituacaoPayload = {
    cotacaoId,
    numero: cot.numero,
    chamadoId,
    situacao,
    at,
    ...marca,
  };

  await NotificationModel.insertMany(
    [...porUsuario.entries()].map(([userId, destino]) => ({
      userId: new Types.ObjectId(userId),
      type: 'material:cotacao',
      title: titulo,
      body: '',
      data: { ...data, destino },
      readAt: null,
    })),
  );
  const usuarios = await UserModel.find({
    _id: { $in: [...porUsuario.keys()].map((id) => new Types.ObjectId(id)) },
  })
    .select('name email')
    .lean();
  for (const u of usuarios) {
    const destino = porUsuario.get(String(u._id))!;
    enviarEmailCotacao(
      { email: u.email as string | undefined, name: u.name as string | undefined },
      titulo,
      urlDoAviso(destino, cotacaoId, chamadoId),
    ).catch(() => {});
    void emitToRoom(`user:${String(u._id)}`, 'material:cotacao_situacao', data);
  }
}
