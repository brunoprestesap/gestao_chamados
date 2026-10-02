import 'server-only';

import { Types } from 'mongoose';

import { listarLocaisAtivos } from '@/lib/ativos/localizacao';
import { AtivoModel } from '@/models/Ativo';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { ConferenciaVistoriaModel } from '@/models/ConferenciaVistoria';
import { UserModel } from '@/models/user.model';
import type { PacoteVistoria } from '@/shared/vistoria/vistoria.schemas';

import type { CampanhaResumo } from './campanha';
import { FILTRO_VISTORIAVEL } from './filtro';

/**
 * O pacote que o celular guarda para trabalhar sem sinal (spec 0012, AC-3).
 * Nunca leva `camposPatrimoniais` (LGPD): do SICAM, só o booleano
 * `ausenteNoSicam`. O nome de quem já conferiu vai, como na ficha.
 */

type AtivoLean = {
  _id: Types.ObjectId;
  codigo: string;
  descricao: string;
  categoriaId: Types.ObjectId;
  tierManutencao: string;
  localizacaoId?: Types.ObjectId | null;
  fabricante?: string | null;
  modelo?: string | null;
  numeroSerie?: string | null;
  camposPatrimoniais?: { ausenteNoSicamDesde?: Date | null } | null;
};

export async function montarPacote(campanha: CampanhaResumo): Promise<PacoteVistoria> {
  const [ativos, locais, categorias, conferencias] = await Promise.all([
    AtivoModel.find(FILTRO_VISTORIAVEL)
      .select(
        'codigo descricao categoriaId tierManutencao localizacaoId fabricante modelo numeroSerie camposPatrimoniais.ausenteNoSicamDesde',
      )
      .lean<AtivoLean[]>(),
    listarLocaisAtivos(),
    CategoriaAtivoModel.find({ isActive: true })
      .select('nome')
      .sort({ nome: 1 })
      .lean<{ _id: Types.ObjectId; nome: string }[]>(),
    ConferenciaVistoriaModel.find({ campanhaId: campanha.id })
      .select('ativoId autorId conferidoEm')
      .lean<{ ativoId: Types.ObjectId; autorId: Types.ObjectId; conferidoEm: Date }[]>(),
  ]);

  const autorIds = [...new Set(conferencias.map((c) => String(c.autorId)))];
  const autores = autorIds.length
    ? await UserModel.find({ _id: { $in: autorIds } })
        .select('name')
        .lean<{ _id: Types.ObjectId; name: string }[]>()
    : [];
  const nomePorId = new Map(autores.map((u) => [String(u._id), u.name]));

  return {
    campanha: {
      id: campanha.id,
      nome: campanha.nome,
      status: campanha.status,
      abertaEm: campanha.abertaEm.toISOString(),
    },
    geradoEm: new Date().toISOString(),
    ativos: ativos.map((a) => ({
      id: String(a._id),
      codigo: a.codigo,
      descricao: a.descricao,
      categoriaId: String(a.categoriaId),
      tierManutencao: a.tierManutencao,
      localizacaoId: a.localizacaoId ? String(a.localizacaoId) : null,
      fabricante: a.fabricante ?? null,
      modelo: a.modelo ?? null,
      numeroSerie: a.numeroSerie ?? null,
      ausenteNoSicam: !!a.camposPatrimoniais?.ausenteNoSicamDesde,
    })),
    locais: locais.map((l) => ({
      id: l.id,
      nome: l.nome,
      tipo: l.tipo,
      parentId: l.parentId,
      caminho: l.caminho,
    })),
    categorias: categorias.map((c) => ({ id: String(c._id), nome: c.nome })),
    conferidos: conferencias.map((c) => ({
      ativoId: String(c.ativoId),
      autorNome: nomePorId.get(String(c.autorId)) ?? 'Usuário removido',
      conferidoEm: c.conferidoEm.toISOString(),
    })),
  };
}
