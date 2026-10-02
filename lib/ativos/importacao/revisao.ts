import 'server-only';

import { Types } from 'mongoose';

import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { ImportacaoPatrimonialModel } from '@/models/ImportacaoPatrimonial';
import { UserModel } from '@/models/user.model';
import type { TierManutencao } from '@/shared/ativos/ativo.constants';
import type { GrupoImportacao, ImportacaoStatus } from '@/shared/ativos/importacao.constants';

import { CAMPOS_PATRIMONIAIS, rotuloCampoPatrimonial } from '../patrimonial';
import type { CampoAlterado } from './diferenca';
import { contarVistosPeloSicam, ehMuitosSumidos } from './pendente';

/**
 * A importação montada para a tela `/ativos/importar/[id]` (spec 0012, AC-22
 * e AC-25): a revisão quando `pendente`, o resultado quando fechada. Os
 * valores de antes e depois saem já formatados em texto.
 */

export type ItemRevisao =
  | {
      grupo: 'novo';
      codigo: string;
      descricao: string;
      tier: TierManutencao | null;
      categoriaSugerida: string | null;
      /** A categoria sugerida, quando existe e está ativa. */
      categoriaSugeridaId: string | null;
      bloqueio: string | null;
    }
  | {
      grupo: 'alterado';
      codigo: string;
      descricao: string;
      retornou: boolean;
      campos: { campo: string; rotulo: string; antes: string | null; depois: string | null }[];
    }
  | { grupo: 'sumido'; codigo: string; descricao: string; local: string };

export type ItemResultado = {
  grupo: GrupoImportacao;
  codigo: string;
  aplicado: boolean;
  motivoPulo: string | null;
};

type PorGrupo = { novos: number; alterados: number; sumidos: number };

export type ImportacaoTela = {
  id: string;
  arquivoNome: string;
  status: ImportacaoStatus;
  autorNome: string;
  criadaEm: string;
  fechadaEm: string | null;
  fechadaPorNome: string | null;
  contagens: {
    linhasLidas: number;
    linhasReparadas: number;
    linhasAceitas: number;
    linhasDuplicadas: number;
    valoresIlegiveis: number;
    continuamAusentes: number;
    novos: number;
    alterados: number;
    sumidos: number;
    aplicados: PorGrupo;
    pulados: PorGrupo;
  };
  /** Só na pendente. */
  revisao: {
    itens: ItemRevisao[];
    categorias: { id: string; nome: string; chave: string }[];
    muitosSumidos: boolean;
    /** Itens já resolvidos numa aplicação que caiu no meio. */
    jaResolvidos: ItemResultado[];
  } | null;
  /** Só na fechada. */
  resultado: ItemResultado[] | null;
};

const TIPO = new Map<string, string>(CAMPOS_PATRIMONIAIS.map((c) => [c.campo, c.tipo]));
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valor patrimonial em texto: data pelo dia em UTC (está ao meio dia), número em reais. */
export function formatarValorPatrimonial(campo: string, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const tipo = TIPO.get(campo);
  if (tipo === 'data') {
    const d = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(d.getTime())) return String(v);
    const [a, m, dia] = d.toISOString().slice(0, 10).split('-');
    return `${dia}/${m}/${a}`;
  }
  if (tipo === 'numero' && typeof v === 'number') return moeda.format(v);
  return String(v);
}

type ItemLean = {
  grupo: GrupoImportacao;
  codigo: string;
  retornou?: boolean;
  tier?: TierManutencao;
  categoriaSugerida?: string;
  bloqueio?: string;
  aplicado?: boolean;
  motivoPulo?: string;
  descricao?: string;
  local?: string;
  camposAlterados?: CampoAlterado[];
};

type ImportacaoLean = {
  _id: Types.ObjectId;
  arquivoNome: string;
  status: ImportacaoStatus;
  autorId: Types.ObjectId;
  createdAt: Date;
  aplicadaPor?: Types.ObjectId | null;
  aplicadaEm?: Date | null;
  descartadaPor?: Types.ObjectId | null;
  descartadaEm?: Date | null;
  linhasLidas: number;
  linhasReparadas: number;
  linhasAceitas: number;
  linhasDuplicadas: number;
  valoresIlegiveis: number;
  continuamAusentes: number;
  contagens: PorGrupo & { aplicados?: PorGrupo; pulados?: PorGrupo };
  itens: ItemLean[];
};

const ZERO: PorGrupo = { novos: 0, alterados: 0, sumidos: 0 };

function resultadoDoItem(i: ItemLean): ItemResultado {
  return {
    grupo: i.grupo,
    codigo: i.codigo,
    aplicado: !!i.aplicado,
    motivoPulo: i.motivoPulo ?? null,
  };
}

export async function carregarImportacao(id: string): Promise<ImportacaoTela | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const imp = await ImportacaoPatrimonialModel.findById(id).lean<ImportacaoLean>();
  if (!imp) return null;

  const fechadaPor = imp.aplicadaPor ?? imp.descartadaPor ?? null;
  const idsUsuarios = [imp.autorId, ...(fechadaPor ? [fechadaPor] : [])].map(String);
  const usuarios = await UserModel.find({ _id: { $in: idsUsuarios } })
    .select('name')
    .lean<{ _id: Types.ObjectId; name?: string }[]>();
  const nome = (uid: unknown) =>
    usuarios.find((u) => String(u._id) === String(uid))?.name || 'Usuário removido';

  const base = {
    id: String(imp._id),
    arquivoNome: imp.arquivoNome,
    status: imp.status,
    autorNome: nome(imp.autorId),
    criadaEm: imp.createdAt.toISOString(),
    fechadaEm: (imp.aplicadaEm ?? imp.descartadaEm)?.toISOString() ?? null,
    fechadaPorNome: fechadaPor ? nome(fechadaPor) : null,
    contagens: {
      linhasLidas: imp.linhasLidas,
      linhasReparadas: imp.linhasReparadas,
      linhasAceitas: imp.linhasAceitas,
      linhasDuplicadas: imp.linhasDuplicadas,
      valoresIlegiveis: imp.valoresIlegiveis,
      continuamAusentes: imp.continuamAusentes,
      novos: imp.contagens?.novos ?? 0,
      alterados: imp.contagens?.alterados ?? 0,
      sumidos: imp.contagens?.sumidos ?? 0,
      aplicados: imp.contagens?.aplicados ?? ZERO,
      pulados: imp.contagens?.pulados ?? ZERO,
    },
  };

  if (imp.status !== 'pendente') {
    return { ...base, revisao: null, resultado: imp.itens.map(resultadoDoItem) };
  }

  const [categorias, vistos] = await Promise.all([
    CategoriaAtivoModel.find({ isActive: true })
      .sort({ nome: 1 })
      .select('nome chave')
      .lean<{ _id: Types.ObjectId; nome: string; chave: string }[]>(),
    contarVistosPeloSicam(),
  ]);
  const idDaChave = new Map(categorias.map((c) => [c.chave, String(c._id)]));

  const abertos = imp.itens.filter((i) => !i.aplicado && !i.motivoPulo);
  const itens: ItemRevisao[] = abertos.map((i) => {
    if (i.grupo === 'novo') {
      const sugeridaId = i.categoriaSugerida ? (idDaChave.get(i.categoriaSugerida) ?? null) : null;
      return {
        grupo: 'novo',
        codigo: i.codigo,
        descricao: i.descricao ?? '',
        tier: i.tier ?? null,
        categoriaSugerida: i.categoriaSugerida ?? null,
        categoriaSugeridaId: sugeridaId,
        // A categoria pode ter sido cadastrada depois do upload: o bloqueio some.
        bloqueio: sugeridaId ? null : (i.bloqueio ?? null),
      };
    }
    if (i.grupo === 'alterado') {
      return {
        grupo: 'alterado',
        codigo: i.codigo,
        descricao: i.descricao ?? '',
        retornou: !!i.retornou,
        campos: (i.camposAlterados ?? []).map((c) => ({
          campo: c.campo,
          rotulo: rotuloCampoPatrimonial(c.campo),
          antes: formatarValorPatrimonial(c.campo, c.antes),
          depois: formatarValorPatrimonial(c.campo, c.depois),
        })),
      };
    }
    return {
      grupo: 'sumido',
      codigo: i.codigo,
      descricao: i.descricao ?? '',
      local: i.local ?? '',
    };
  });

  return {
    ...base,
    revisao: {
      itens,
      categorias: categorias.map((c) => ({ id: String(c._id), nome: c.nome, chave: c.chave })),
      muitosSumidos: ehMuitosSumidos(base.contagens.sumidos, vistos),
      jaResolvidos: imp.itens.filter((i) => i.aplicado || i.motivoPulo).map(resultadoDoItem),
    },
    resultado: null,
  };
}
