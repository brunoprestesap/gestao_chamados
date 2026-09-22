import 'server-only';

import { Types } from 'mongoose';

import { dbConnect } from '@/lib/db';
import { UnitModel } from '@/models/unit';
import { UserModel } from '@/models/user.model';
import { DECISAO_ROTULO_MAX } from '@/shared/conversas/conversa.schemas';

/**
 * A unidade de quem está relatando (spec 0004, AC-6). Vem de `User.unitId` e só
 * conta se a unidade está ativa: unidade desativada vale como sem unidade, e
 * aí o cartão pede para escolher. A IA nunca decide a unidade.
 */

export type UnidadeDoPerfil = { unitId: string; nome: string; andar: string };

export type Perfil = { unidade: UnidadeDoPerfil | null };

export const SEM_PERFIL: Perfil = { unidade: null };

export async function lerPerfil(userId: string): Promise<Perfil> {
  if (!Types.ObjectId.isValid(userId)) return SEM_PERFIL;

  await dbConnect();

  const usuario = await UserModel.findById(userId).select('unitId').lean();
  if (!usuario?.unitId) return SEM_PERFIL;

  const unidade = await UnitModel.findOne({ _id: usuario.unitId, isActive: true })
    .select('name floor')
    .lean();
  if (!unidade) return SEM_PERFIL;

  return {
    unidade: {
      unitId: String(unidade._id),
      nome: String(unidade.name).trim().slice(0, DECISAO_ROTULO_MAX),
      andar: String(unidade.floor ?? '')
        .trim()
        .slice(0, DECISAO_ROTULO_MAX),
    },
  };
}
