import 'server-only';

import { Types } from 'mongoose';

import { corrigirDecisaoDoAtivo } from '@/lib/conversas';
import { AtivoModel } from '@/models/Ativo';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { STATUS_SEM_VINCULO_ATIVO } from '@/shared/ativos/ativo.constants';
import type { ChamadoStatus } from '@/shared/chamados/chamado.constants';

import { gravarHistoricoOuDesfazer } from './auditoria';
import { falha, type Resultado } from './erros';
import { buscarAtivoVinculavel } from './seletor';

/**
 * Vincula, troca ou remove o ativo de um chamado ainda aberto. Cada mudança
 * grava `ChamadoHistory` `vinculo_ativo` com os códigos anterior e novo;
 * vincular o mesmo ativo de novo não faz nada. Quando o chamado tem decisão
 * `ativo` (chat, spec 0014), a troca vira correção dela, sem desfazer o
 * vínculo se essa atualização falhar.
 */
export async function vincularAtivoAoChamado(
  chamadoId: string,
  ativoId: string | null,
  autorId: string,
): Promise<Resultado<{ mudou: boolean }>> {
  if (!Types.ObjectId.isValid(chamadoId)) return falha('Chamado não encontrado.');
  const chamado = await ChamadoModel.findById(chamadoId)
    .select('status ativoId')
    .lean<{ _id: Types.ObjectId; status: ChamadoStatus; ativoId?: Types.ObjectId | null }>();
  if (!chamado) return falha('Chamado não encontrado.');
  if (STATUS_SEM_VINCULO_ATIVO.includes(chamado.status)) {
    return falha('Chamado encerrado, cancelado ou recusado não muda de equipamento.');
  }

  const atualId = chamado.ativoId ? String(chamado.ativoId) : null;
  if (atualId === ativoId) return { ok: true, mudou: false };

  const novo = ativoId ? await buscarAtivoVinculavel(ativoId) : null;
  if (ativoId && !novo) return falha('Equipamento inválido para este chamado.');

  // O filtro repete as condições: outra mudança no meio do caminho não é sobrescrita.
  const r = await ChamadoModel.updateOne(
    {
      _id: chamado._id,
      status: { $nin: [...STATUS_SEM_VINCULO_ATIVO] },
      ativoId: chamado.ativoId ?? null,
    },
    { $set: { ativoId: novo?._id ?? null } },
  );
  if (r.modifiedCount === 0) return falha('O chamado mudou enquanto você editava. Recarregue.');

  const anterior = atualId
    ? await AtivoModel.findById(atualId).select('codigo').lean<{ codigo: string }>()
    : null;
  await gravarHistoricoOuDesfazer(
    () =>
      ChamadoHistoryModel.create({
        chamadoId: chamado._id,
        userId: new Types.ObjectId(autorId),
        action: 'vinculo_ativo',
        statusAnterior: chamado.status,
        statusNovo: chamado.status,
        observacoes: `Equipamento: ${anterior?.codigo ?? 'nenhum'} → ${novo?.codigo ?? 'nenhum'}`,
      }),
    // Só desfaz se ninguém mexeu de novo nesse meio tempo.
    () =>
      ChamadoModel.updateOne(
        { _id: chamado._id, ativoId: novo?._id ?? null },
        { $set: { ativoId: chamado.ativoId ?? null } },
      ),
  );
  await corrigirDecisaoDoAtivo({
    chamadoId,
    ativoId: novo ? String(novo._id) : null,
    codigo: novo?.codigo ?? null,
    userId: autorId,
  });
  return { ok: true, mudou: true };
}
