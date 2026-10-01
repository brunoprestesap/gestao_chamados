import 'server-only';

import { Types } from 'mongoose';

import { escapeRegex } from '@/lib/regex';
import { AtivoModel } from '@/models/Ativo';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { LocalizacaoModel } from '@/models/Localizacao';
import type { AtivoStatus, StatusCadastro } from '@/shared/ativos/ativo.constants';
import type { FiltrosListaAtivos } from '@/shared/ativos/ativo.schemas';

import { normalizarCodigo } from './codigo';
import { idsDaSubarvore } from './localizacao';

export const ITENS_POR_PAGINA = 50;

const ORDEM_CODIGO = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

export type LinhaAtivo = {
  id: string;
  codigo: string;
  descricao: string;
  categoriaNome: string;
  caminho: string | null;
  status: AtivoStatus;
  statusCadastro: StatusCadastro;
};

export type PaginaAtivos = {
  itens: LinhaAtivo[];
  total: number;
  pagina: number;
  totalPaginas: number;
};

/**
 * Lista de `/ativos` (spec 0011, AC-10), para os quatro perfis. Busca por
 * prefixo do código ou trecho da descrição; o filtro de local é um prédio
 * (com tudo abaixo dele) ou "sem local". Ordem por código, 50 por página.
 */
export async function listarAtivos(f: FiltrosListaAtivos): Promise<PaginaAtivos> {
  const filtro: Record<string, unknown> = {};

  if (f.q) {
    const codigo = escapeRegex(normalizarCodigo(f.q));
    filtro.$or = [
      { codigo: { $regex: `^${codigo}` } },
      { descricao: { $regex: escapeRegex(f.q), $options: 'i' } },
    ];
  }
  if (f.local === 'sem') {
    filtro.localizacaoId = null;
  } else if (f.local) {
    filtro.localizacaoId = { $in: await idsDaSubarvore(f.local) };
  }
  if (f.categoria) filtro.categoriaId = new Types.ObjectId(f.categoria);
  if (f.status) filtro.status = f.status;
  if (f.cadastro) filtro.statusCadastro = f.cadastro;

  // Ordem numérica (9003 antes de 10698, MNT- depois dos tombamentos) feita
  // aqui, sobre só `_id` e `codigo`: com `collation` na consulta o Mongo deixa
  // de usar os índices do filtro e o prefixo do `codigo`. São centenas de ativos.
  const chaves = await AtivoModel.find(filtro)
    .select('codigo')
    .lean<{ _id: Types.ObjectId; codigo: string }[]>();
  chaves.sort((a, b) => ORDEM_CODIGO.compare(a.codigo, b.codigo));

  const total = chaves.length;
  const totalPaginas = Math.max(1, Math.ceil(total / ITENS_POR_PAGINA));
  const pagina = Math.min(f.pagina, totalPaginas);
  const idsDaPagina = chaves
    .slice((pagina - 1) * ITENS_POR_PAGINA, pagina * ITENS_POR_PAGINA)
    .map((c) => c._id);

  const posicao = new Map(idsDaPagina.map((id, i) => [String(id), i]));
  const docs = (
    await AtivoModel.find({ _id: { $in: idsDaPagina } })
      .select('codigo descricao categoriaId localizacaoId status statusCadastro')
      .lean<
        {
          _id: Types.ObjectId;
          codigo: string;
          descricao: string;
          categoriaId: Types.ObjectId;
          localizacaoId?: Types.ObjectId | null;
          status: AtivoStatus;
          statusCadastro: StatusCadastro;
        }[]
      >()
  ).sort((a, b) => posicao.get(String(a._id))! - posicao.get(String(b._id))!);

  const categoriaIds = [...new Set(docs.map((d) => String(d.categoriaId)))];
  const localIds = [
    ...new Set(
      docs
        .map((d) => d.localizacaoId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const [categorias, locais] = await Promise.all([
    CategoriaAtivoModel.find({ _id: { $in: categoriaIds } })
      .select('nome')
      .lean(),
    localIds.length
      ? LocalizacaoModel.find({ _id: { $in: localIds } })
          .select('caminho')
          .lean()
      : Promise.resolve([]),
  ]);
  const nomeCategoria = new Map(categorias.map((c) => [String(c._id), c.nome]));
  const caminhoLocal = new Map(locais.map((l) => [String(l._id), l.caminho]));

  return {
    itens: docs.map((d) => ({
      id: String(d._id),
      codigo: d.codigo,
      descricao: d.descricao,
      categoriaNome: nomeCategoria.get(String(d.categoriaId)) ?? '—',
      caminho: d.localizacaoId ? (caminhoLocal.get(String(d.localizacaoId)) ?? null) : null,
      status: d.status,
      statusCadastro: d.statusCadastro,
    })),
    total,
    pagina,
    totalPaginas,
  };
}

/** Prédios ativos, para o filtro de local. */
export async function listarPredios(): Promise<{ id: string; nome: string }[]> {
  const docs = await LocalizacaoModel.find({ tipo: 'predio', isActive: true })
    .select('nome')
    .lean();
  return docs
    .map((d) => ({ id: String(d._id), nome: d.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
}
