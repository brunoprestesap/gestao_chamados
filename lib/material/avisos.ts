import 'server-only';

import { Types } from 'mongoose';

import { enviarEmailCotacao } from '@/lib/email/aviso-cotacao';
import { emitToRoom } from '@/lib/realtime-emit';
import { ChamadoModel } from '@/models/Chamado';
import { CotacaoMaterialModel } from '@/models/CotacaoMaterial';
import { NotificationModel } from '@/models/Notification';
import { UserModel } from '@/models/user.model';
import type { SituacaoCotacao } from '@/shared/material/material.constants';
import { tituloAvisoCotacao } from '@/shared/material/mensagens';

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
      .select('numero chamadoId montadoPorUserId valorTotalCentavos')
      .lean();
    if (!cot) return;
    const lista = (
      await destinatarios(situacao, { ...cot, montadoPorUserId: cot.montadoPorUserId ?? null })
    ).filter((d) => d.userId !== autorUserId);
    // Uma pessoa, um aviso: o técnico que também é responsável técnico vai à fila.
    const porUsuario = new Map<string, Destino>();
    for (const d of lista) if (!porUsuario.has(d.userId)) porUsuario.set(d.userId, d.destino);
    if (porUsuario.size === 0) return;

    const titulo = tituloAvisoCotacao(cot.numero, situacao);
    const chamadoId = String(cot.chamadoId);
    const at = new Date().toISOString();
    const data = { cotacaoId, numero: cot.numero, chamadoId, situacao, at };

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
  } catch (e) {
    console.error('[material] aviso de cotação falhou:', e);
  }
}
