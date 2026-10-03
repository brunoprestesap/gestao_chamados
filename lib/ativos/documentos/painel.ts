import 'server-only';

import { Types } from 'mongoose';

import { AtivoModel } from '@/models/Ativo';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { DocumentoAtivoModel } from '@/models/DocumentoAtivo';
import type { FiltroSituacao, SituacaoCalculada } from '@/shared/ativos/documento.constants';
import type { FiltroPainelDocumentos } from '@/shared/ativos/documento.schemas';

import { mapaDeLocais, type NoAncestral, predioDaCadeia, subirArvore } from '../localizacao';
import { type DocumentoDaTela, type DocumentoLean, mapaDeNomesDeTipo, paraTela } from './ficha';
import { hojeEmBelem } from './situacao';

/** Painel `/ativos/documentos` (spec 0013, AC-9). O parque é de centenas: cruza em memória. */

export const TAMANHO_PAGINA_DOCUMENTOS = 50;

export type AlvoDoDocumento =
  | { tipo: 'ativo'; id: string; codigo: string; descricao: string }
  | { tipo: 'local'; id: string; caminho: string };

export type LinhaDocumentoPainel = DocumentoDaTela & {
  alvo: AlvoDoDocumento;
  predioNome: string | null;
};

export type LinhaFaltando = {
  ativoId: string;
  codigo: string;
  descricao: string;
  caminho: string | null;
  predioNome: string | null;
  tipo: string;
  tipoNome: string;
};

export type Pagina<T> = { itens: T[]; total: number; pagina: number; paginas: number };

function paginar<T>(lista: T[], pagina: number): Pagina<T> {
  const paginas = Math.max(1, Math.ceil(lista.length / TAMANHO_PAGINA_DOCUMENTOS));
  const atual = Math.min(Math.max(1, pagina), paginas);
  const inicio = (atual - 1) * TAMANHO_PAGINA_DOCUMENTOS;
  return {
    itens: lista.slice(inicio, inicio + TAMANHO_PAGINA_DOCUMENTOS),
    total: lista.length,
    pagina: atual,
    paginas,
  };
}

/** Situação calculada cabe no filtro do painel? "Vence em até N" inclui hoje. */
export function casaFiltroSituacao(s: SituacaoCalculada, filtro: FiltroSituacao): boolean {
  switch (filtro) {
    case 'vencido':
      return s.tipo === 'vencido';
    case 'sem_validade':
      return s.tipo === 'sem_validade';
    case 'em_dia':
      return s.tipo === 'em_dia';
    case 'ate_30':
    case 'ate_60':
    case 'ate_90': {
      const limite = Number(filtro.slice(4));
      if (s.tipo === 'vence_hoje') return true;
      return s.tipo === 'vence_em' && s.dias <= limite;
    }
  }
}

type AtivoLean = {
  _id: Types.ObjectId;
  codigo: string;
  descricao: string;
  categoriaId: Types.ObjectId;
  localizacaoId?: Types.ObjectId | null;
  status: string;
};

function predioIdDe(locais: ReadonlyMap<string, NoAncestral>, localId?: Types.ObjectId | null) {
  const p = predioDaCadeia(subirArvore(locais, localId));
  return p ? { id: String(p._id), nome: p.nome } : null;
}

/** Ordena pelo `codigo` em ordem natural (MNT-2 antes de MNT-10). */
const porCodigo = (a: string, b: string) =>
  a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });

export async function listarDocumentosPainel(
  filtro: FiltroPainelDocumentos,
  hoje: string = hojeEmBelem(),
): Promise<Pagina<LinhaDocumentoPainel>> {
  const [nomes, locais, docs] = await Promise.all([
    mapaDeNomesDeTipo(),
    mapaDeLocais(),
    DocumentoAtivoModel.find({
      situacao: 'vigente',
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
    })
      .select(
        'tipo ativoId localizacaoId numero emitidoPor emitidoEm validadeAte arquivo.originalName',
      )
      .lean<DocumentoLean[]>(),
  ]);

  const ativoIds = [...new Set(docs.filter((d) => d.ativoId).map((d) => String(d.ativoId)))];
  const ativos = ativoIds.length
    ? await AtivoModel.find({ _id: { $in: ativoIds } })
        .select('codigo descricao localizacaoId status')
        .lean<AtivoLean[]>()
    : [];
  const ativoPorId = new Map(ativos.map((a) => [String(a._id), a]));

  const linhas: { linha: LinhaDocumentoPainel; ordem: number }[] = [];
  for (const d of docs) {
    let alvo: AlvoDoDocumento;
    let predio: { id: string; nome: string } | null;
    if (d.ativoId) {
      const a = ativoPorId.get(String(d.ativoId));
      // Ativo baixado está fora do painel (contrato da spec 0013).
      if (!a || a.status === 'baixado') continue;
      alvo = { tipo: 'ativo', id: String(a._id), codigo: a.codigo, descricao: a.descricao };
      predio = predioIdDe(locais, a.localizacaoId);
    } else {
      const l = locais.get(String(d.localizacaoId));
      if (!l) continue;
      alvo = { tipo: 'local', id: String(l._id), caminho: l.caminho };
      predio = predioIdDe(locais, l._id);
    }
    if (filtro.predio && predio?.id !== filtro.predio) continue;

    const tela = paraTela(d, nomes, hoje);
    if (filtro.situacao && !casaFiltroSituacao(tela.situacao, filtro.situacao)) continue;
    linhas.push({
      linha: { ...tela, alvo, predioNome: predio?.nome ?? null },
      ordem: d.validadeAte ? d.validadeAte.getTime() : Number.POSITIVE_INFINITY,
    });
  }

  // Pela validade, sem validade por último; empate pelo tipo.
  linhas.sort(
    (a, b) => a.ordem - b.ordem || a.linha.tipoNome.localeCompare(b.linha.tipoNome, 'pt-BR'),
  );
  return paginar(
    linhas.map((l) => l.linha),
    filtro.pagina,
  );
}

/**
 * Cada par (ativo não baixado, tipo ativo exigido pela categoria) sem `vigente`
 * desse tipo no ativo nem em nenhum local acima dele. Vencido conta como existente.
 * Ativo sem local não herda e só aparece com o filtro de prédio vazio.
 */
export async function listarFaltando(
  filtro: Pick<FiltroPainelDocumentos, 'tipo' | 'predio' | 'pagina'>,
): Promise<Pagina<LinhaFaltando>> {
  const nomes = await mapaDeNomesDeTipo();
  const categorias = await CategoriaAtivoModel.find({ 'exigeDocumento.0': { $exists: true } })
    .select('exigeDocumento')
    .lean<{ _id: Types.ObjectId; exigeDocumento: string[] }[]>();

  const exigidosPorCategoria = new Map<string, string[]>();
  for (const c of categorias) {
    const ativosDoTipo = [...new Set(c.exigeDocumento)].filter(
      (chave) => nomes.get(chave)?.isActive && (!filtro.tipo || chave === filtro.tipo),
    );
    if (ativosDoTipo.length) exigidosPorCategoria.set(String(c._id), ativosDoTipo);
  }
  if (exigidosPorCategoria.size === 0) return paginar([], filtro.pagina);

  const tiposExigidos = [...new Set([...exigidosPorCategoria.values()].flat())];
  const [ativos, locais, vigentes] = await Promise.all([
    AtivoModel.find({
      categoriaId: { $in: [...exigidosPorCategoria.keys()].map((id) => new Types.ObjectId(id)) },
      status: { $ne: 'baixado' },
    })
      .select('codigo descricao categoriaId localizacaoId status')
      .lean<AtivoLean[]>(),
    mapaDeLocais(),
    DocumentoAtivoModel.find({ situacao: 'vigente', tipo: { $in: tiposExigidos } })
      .select('tipo ativoId localizacaoId')
      .lean<
        { tipo: string; ativoId?: Types.ObjectId | null; localizacaoId?: Types.ObjectId | null }[]
      >(),
  ]);

  // Chave "alvo|tipo" de quem tem vigente.
  const cobertos = new Set(
    vigentes.map((d) => `${String(d.ativoId ?? d.localizacaoId)}|${d.tipo}`),
  );

  const linhas: { linha: LinhaFaltando; ordemPredio: string }[] = [];
  for (const a of ativos) {
    const cadeia = subirArvore(locais, a.localizacaoId);
    const predio = predioDaCadeia(cadeia);
    if (filtro.predio && (!predio || String(predio._id) !== filtro.predio)) continue;
    for (const tipo of exigidosPorCategoria.get(String(a.categoriaId)) ?? []) {
      const tem =
        cobertos.has(`${String(a._id)}|${tipo}`) ||
        cadeia.some((n) => cobertos.has(`${String(n._id)}|${tipo}`));
      if (tem) continue;
      linhas.push({
        linha: {
          ativoId: String(a._id),
          codigo: a.codigo,
          descricao: a.descricao,
          caminho: cadeia[0]?.caminho ?? null,
          predioNome: predio?.nome ?? null,
          tipo,
          tipoNome: nomes.get(tipo)!.nome,
        },
        // Sem prédio vai para o fim.
        ordemPredio: predio?.caminho ?? '￿',
      });
    }
  }

  linhas.sort(
    (x, y) =>
      x.ordemPredio.localeCompare(y.ordemPredio, 'pt-BR', { numeric: true }) ||
      porCodigo(x.linha.codigo, y.linha.codigo) ||
      x.linha.tipoNome.localeCompare(y.linha.tipoNome, 'pt-BR'),
  );
  return paginar(
    linhas.map((l) => l.linha),
    filtro.pagina,
  );
}

/** Prédios ativos, para o filtro do painel. */
export function prediosDoMapa(locais: ReadonlyMap<string, NoAncestral>) {
  return [...locais.values()]
    .filter((l) => l.tipo === 'predio' && l.isActive)
    .map((l) => ({ id: String(l._id), nome: l.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
