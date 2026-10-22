import 'server-only';

import { Types } from 'mongoose';
import { cache } from 'react';

import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import { DesignacaoMaterialModel } from '@/models/DesignacaoMaterial';
import { FaixaCompetenciaModel } from '@/models/FaixaCompetencia';
import { UserModel } from '@/models/user.model';
import {
  PAPEIS_TRF1,
  type PapelDesignacao,
  PERFIS_POR_PAPEL,
} from '@/shared/material/material.constants';

/**
 * Competência no fluxo de material (spec 0019): vem da `DesignacaoMaterial`
 * vigente, nunca do perfil. Os 4 perfis não mudam; o Admin sem designação
 * só lê. O perfil ainda limita o papel no uso (AC-19): quem deixou de ser
 * Admin perde fiscal, gestor e aprovador sem o Admin revogar nada, e o perfil
 * vem do banco, não do token da sessão, que pode ter dias.
 */

export type DesignacaoVigente = {
  id: string;
  papel: PapelDesignacao;
  faixaId: string | null;
  limiteCentavos: number | null;
};

export type Papeis = {
  userId: string;
  role: string;
  designacoes: DesignacaoVigente[];
  tem: (p: PapelDesignacao) => boolean;
  /** Designação `fiscal`, `gestor` ou `aprovador` vigente. */
  ladoTrf1: boolean;
  /** Admin sem designação: lê o lado TRF1, sem ações. */
  leitorAdmin: boolean;
  contratada: boolean;
};

/** Filtro de vigência no dia `hoje` (`YYYY-MM-DD`, Belém). */
export function filtroVigente(hoje: string) {
  return {
    revogadaEm: null,
    vigenciaInicio: { $lte: hoje },
    $or: [{ vigenciaFim: null }, { vigenciaFim: { $gte: hoje } }],
  };
}

/** O papel cabe no perfil (AC-19). */
function perfilAceita(papel: PapelDesignacao, role: unknown): boolean {
  return PERFIS_POR_PAPEL[papel].includes(String(role));
}

async function carregarPapeis(userId: string, roleDaSessao: string): Promise<Papeis> {
  const hoje = hojeEmBelem();
  const [user, todas] = await Promise.all([
    UserModel.findById(userId).select('role isActive').lean(),
    DesignacaoMaterialModel.find({
      userId: new Types.ObjectId(userId),
      ...filtroVigente(hoje),
    })
      .select('papel faixaId')
      .lean(),
  ]);
  const role = (user?.role as string | undefined) ?? roleDaSessao;
  const docs =
    user && user.isActive !== false
      ? todas.filter((d) => perfilAceita(d.papel as PapelDesignacao, role))
      : [];
  const faixaIds = docs.map((d) => d.faixaId).filter((f): f is Types.ObjectId => !!f);
  const faixas = faixaIds.length
    ? await FaixaCompetenciaModel.find({ _id: { $in: faixaIds }, ativa: true })
        .select('limiteCentavos')
        .lean()
    : [];
  const limite = new Map(faixas.map((f) => [String(f._id), f.limiteCentavos]));
  const designacoes: DesignacaoVigente[] = docs.map((d) => ({
    id: String(d._id),
    papel: d.papel as PapelDesignacao,
    faixaId: d.faixaId ? String(d.faixaId) : null,
    // Faixa desativada não dá competência.
    limiteCentavos: d.faixaId ? (limite.get(String(d.faixaId)) ?? null) : null,
  }));
  const tem = (p: PapelDesignacao) => designacoes.some((d) => d.papel === p);
  const ladoTrf1 = PAPEIS_TRF1.some(tem);
  return {
    userId,
    role,
    designacoes,
    tem,
    ladoTrf1,
    leitorAdmin: role === 'Admin' && !ladoTrf1,
    contratada: tem('responsavel_tecnico'),
  };
}

/** Memorizado por request, como o `verifySession`. */
export const papeisDe = cache(carregarPapeis);

/** O maior limite entre as designações de aprovador vigentes do usuário. */
export function limiteDoAprovador(papeis: Papeis): {
  limiteCentavos: number;
  faixaId: string;
} | null {
  let melhor: { limiteCentavos: number; faixaId: string } | null = null;
  for (const d of papeis.designacoes) {
    if (d.papel !== 'aprovador' || d.limiteCentavos == null || !d.faixaId) continue;
    if (!melhor || d.limiteCentavos > melhor.limiteCentavos) {
      melhor = { limiteCentavos: d.limiteCentavos, faixaId: d.faixaId };
    }
  }
  return melhor;
}

export type Designado = {
  userId: string;
  nome: string;
  limiteCentavos: number | null;
  /** O nome da faixa do limite (spec 0021); `null` sem faixa. */
  faixaNome: string | null;
};

/** Quem tem designação vigente para o papel hoje (avisos, "encaminhe a"). */
export async function designadosVigentes(papel: PapelDesignacao): Promise<Designado[]> {
  const docs = await DesignacaoMaterialModel.find({ papel, ...filtroVigente(hojeEmBelem()) })
    .select('userId faixaId')
    .lean();
  if (docs.length === 0) return [];
  const faixaIds = docs.map((d) => d.faixaId).filter((f): f is Types.ObjectId => !!f);
  const [usuarios, faixas] = await Promise.all([
    UserModel.find({
      _id: { $in: docs.map((d) => d.userId) },
      isActive: true,
      role: { $in: [...PERFIS_POR_PAPEL[papel]] },
    })
      .select('name')
      .lean(),
    faixaIds.length
      ? FaixaCompetenciaModel.find({ _id: { $in: faixaIds }, ativa: true })
          .select('limiteCentavos nome')
          .lean()
      : Promise.resolve([]),
  ]);
  const nome = new Map(usuarios.map((u) => [String(u._id), u.name as string]));
  const faixaPorId = new Map(faixas.map((f) => [String(f._id), f]));
  const porUsuario = new Map<string, Designado>();
  for (const d of docs) {
    const id = String(d.userId);
    if (!nome.has(id)) continue;
    const faixa = d.faixaId ? faixaPorId.get(String(d.faixaId)) : undefined;
    const lim = faixa?.limiteCentavos ?? null;
    const atual = porUsuario.get(id);
    if (!atual || (lim ?? -1) > (atual.limiteCentavos ?? -1)) {
      porUsuario.set(id, {
        userId: id,
        nome: nome.get(id)!,
        limiteCentavos: lim,
        faixaNome: faixa?.nome ?? null,
      });
    }
  }
  return [...porUsuario.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Aprovadores vigentes cuja faixa cobre o valor (AC-7, CA-10). */
export async function aprovadoresQueCobrem(valorCentavos: number): Promise<Designado[]> {
  const todos = await designadosVigentes('aprovador');
  return todos.filter((d) => d.limiteCentavos != null && d.limiteCentavos >= valorCentavos);
}
