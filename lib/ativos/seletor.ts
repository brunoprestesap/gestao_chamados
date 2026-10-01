import 'server-only';

import { type QueryFilter, Types } from 'mongoose';

import { escapeRegex } from '@/lib/regex';
import { type Ativo, AtivoModel } from '@/models/Ativo';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { LocalizacaoModel } from '@/models/Localizacao';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
import { ServiceTypeModel } from '@/models/ServiceType';
import { TIERS_VINCULAVEIS } from '@/shared/ativos/ativo.constants';
import type { ItemSeletorAtivo } from '@/shared/ativos/seletor.types';
import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';
import { buildTypeIdByTipo, tipoServicoDoNomeDoTipo } from '@/shared/chamados/tipo-servico';

import { normalizarCodigo } from './codigo';

/** Só Tier A ou B e não `baixado` entram no seletor e no vínculo (AC-14). */
export const FILTRO_VINCULAVEL: QueryFilter<Ativo> = {
  tierManutencao: { $in: [...TIERS_VINCULAVEIS] },
  status: { $ne: 'baixado' },
};

type AtivoParaItem = {
  _id: Types.ObjectId;
  codigo: string;
  descricao: string;
  categoriaId: Types.ObjectId;
  localizacaoId?: Types.ObjectId | null;
};

const PROJECAO_ITEM = { codigo: 1, descricao: 1, categoriaId: 1, localizacaoId: 1 } as const;

/**
 * Monta os itens do seletor, com o `tipoServico` e o `subtypeId` sugeridos
 * calculados no servidor: categoria → subtipo → tipo → opção fixa. O
 * `subtypeId` só sai quando o subtipo pertence ao tipo que o formulário vai
 * usar para aquela opção (`buildTypeIdByTipo` na mesma ordem da lista do
 * formulário); senão, só o tipo é sugerido.
 */
export async function montarItensSeletor(ativos: AtivoParaItem[]): Promise<ItemSeletorAtivo[]> {
  if (ativos.length === 0) return [];

  const categoriaIds = [...new Set(ativos.map((a) => String(a.categoriaId)))];
  const localIds = [
    ...new Set(
      ativos
        .map((a) => a.localizacaoId)
        .filter(Boolean)
        .map(String),
    ),
  ];

  const [categorias, locais] = await Promise.all([
    CategoriaAtivoModel.find({ _id: { $in: categoriaIds } })
      .select('nome serviceSubTypeId')
      .lean(),
    localIds.length
      ? LocalizacaoModel.find({ _id: { $in: localIds } })
          .select('caminho')
          .lean()
      : Promise.resolve([]),
  ]);

  const subtipoIds = [
    ...new Set(
      categorias
        .map((c) => c.serviceSubTypeId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const [subtipos, tipos] = subtipoIds.length
    ? await Promise.all([
        ServiceSubTypeModel.find({ _id: { $in: subtipoIds } })
          .select('typeId')
          .lean(),
        ServiceTypeModel.find().sort({ name: 1 }).select('name').lean(),
      ])
    : [[], []];

  const tipoIdPorOpcao = buildTypeIdByTipo(
    tipos.map((t) => ({ id: String(t._id), name: String(t.name) })),
  );
  const nomeTipoPorId = new Map(tipos.map((t) => [String(t._id), String(t.name)]));
  const tipoDoSubtipo = new Map(subtipos.map((s) => [String(s._id), String(s.typeId)]));

  const sugestaoPorCategoria = new Map<
    string,
    { nome: string; tipoServico?: ItemSeletorAtivo['tipoServico']; subtypeId?: string }
  >();
  for (const c of categorias) {
    const subtypeId = c.serviceSubTypeId ? String(c.serviceSubTypeId) : null;
    const typeId = subtypeId ? tipoDoSubtipo.get(subtypeId) : undefined;
    const tipoServico = typeId ? tipoServicoDoNomeDoTipo(nomeTipoPorId.get(typeId) ?? '') : null;
    const valida = tipoServico && TIPO_SERVICO_OPTIONS.includes(tipoServico);
    sugestaoPorCategoria.set(String(c._id), {
      nome: c.nome,
      ...(valida && { tipoServico }),
      ...(valida && subtypeId && tipoIdPorOpcao.get(tipoServico) === typeId && { subtypeId }),
    });
  }
  const caminhoPorLocal = new Map(locais.map((l) => [String(l._id), l.caminho]));

  return ativos.map((a) => {
    const sugestao = sugestaoPorCategoria.get(String(a.categoriaId));
    const caminho = a.localizacaoId ? caminhoPorLocal.get(String(a.localizacaoId)) : undefined;
    return {
      id: String(a._id),
      codigo: a.codigo,
      descricao: a.descricao,
      ...(caminho && { caminho }),
      categoriaNome: sugestao?.nome ?? '',
      ...(sugestao?.tipoServico && { tipoServico: sugestao.tipoServico }),
      ...(sugestao?.subtypeId && { subtypeId: sugestao.subtypeId }),
    };
  });
}

/** Busca do seletor: prefixo do código (usa o índice único) ou trecho da descrição. */
export async function buscarAtivosSeletor(q: string, limite: number): Promise<ItemSeletorAtivo[]> {
  const codigo = escapeRegex(normalizarCodigo(q));
  const trecho = new RegExp(escapeRegex(q.trim()), 'i');
  const ativos = await AtivoModel.find({
    ...FILTRO_VINCULAVEL,
    $or: [{ codigo: { $regex: `^${codigo}` } }, { descricao: trecho }],
  })
    .select(PROJECAO_ITEM)
    .sort({ codigo: 1 })
    .limit(limite)
    .lean<AtivoParaItem[]>();
  return montarItensSeletor(ativos);
}

/** O ativo, se ainda passa nas regras do seletor; senão `null`. */
export async function buscarAtivoVinculavel(id: string): Promise<AtivoParaItem | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  return AtivoModel.findOne({ _id: id, ...FILTRO_VINCULAVEL })
    .select(PROJECAO_ITEM)
    .lean<AtivoParaItem>();
}

export async function itemSeletorPorId(id: string): Promise<ItemSeletorAtivo | null> {
  const ativo = await buscarAtivoVinculavel(id);
  if (!ativo) return null;
  const [item] = await montarItensSeletor([ativo]);
  return item ?? null;
}
