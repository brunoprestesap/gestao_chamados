import 'server-only';

import { Types } from 'mongoose';

import { AtivoModel } from '@/models/Ativo';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { DocumentoAtivoModel } from '@/models/DocumentoAtivo';
import { TipoDocumentoModel } from '@/models/TipoDocumento';
import type { SituacaoCalculada } from '@/shared/ativos/documento.constants';

import { ancestraisDe } from '../localizacao';
import {
  formatarDataDocumento,
  hojeEmBelem,
  paraYmd,
  rotuloSituacao,
  situacaoDoDocumento,
} from './situacao';

/** Um documento como a ficha e o painel mostram (spec 0013, AC-8 e AC-9). */
export type DocumentoDaTela = {
  id: string;
  tipo: string;
  tipoNome: string;
  numero: string | null;
  emitidoPor: string | null;
  /** `YYYY-MM-DD`, para os campos de data do diálogo de correção. */
  emitidoEm: string;
  validadeAte: string | null;
  emitidoEmTexto: string;
  validadeAteTexto: string | null;
  situacao: SituacaoCalculada;
  situacaoTexto: string;
  arquivoNome: string;
  href: string;
  /** Preenchido nos documentos herdados de um local acima. */
  localNome?: string;
  substituidoEmTexto?: string | null;
};

export type TipoDocumentoOpcao = { chave: string; nome: string };

export type DocumentosDaFicha = {
  vigentes: DocumentoDaTela[];
  substituidos: DocumentoDaTela[];
  herdados: DocumentoDaTela[];
  /** Tipos exigidos pela categoria (ativos) sem `vigente` no ativo nem nos locais acima. */
  faltando: TipoDocumentoOpcao[];
  /** Tipos ativos, para o diálogo de cadastro. */
  tiposAtivos: TipoDocumentoOpcao[];
  ativoBaixado: boolean;
};

export type DocumentoLean = {
  _id: Types.ObjectId;
  tipo: string;
  ativoId?: Types.ObjectId | null;
  localizacaoId?: Types.ObjectId | null;
  numero?: string | null;
  emitidoPor?: string | null;
  emitidoEm: Date;
  validadeAte?: Date | null;
  substituidoEm?: Date | null;
  arquivo: { originalName: string };
};

export async function mapaDeNomesDeTipo(): Promise<
  Map<string, { nome: string; isActive: boolean }>
> {
  const tipos = await TipoDocumentoModel.find({})
    .select('chave nome isActive')
    .lean<{ chave: string; nome: string; isActive: boolean }[]>();
  return new Map(tipos.map((t) => [t.chave, { nome: t.nome, isActive: t.isActive }]));
}

export function paraTela(
  d: DocumentoLean,
  nomes: ReadonlyMap<string, { nome: string }>,
  hoje: string,
): DocumentoDaTela {
  const situacao = situacaoDoDocumento(d.validadeAte, hoje);
  return {
    id: String(d._id),
    tipo: d.tipo,
    tipoNome: nomes.get(d.tipo)?.nome ?? d.tipo.toUpperCase(),
    numero: d.numero ?? null,
    emitidoPor: d.emitidoPor ?? null,
    emitidoEm: paraYmd(d.emitidoEm),
    validadeAte: d.validadeAte ? paraYmd(d.validadeAte) : null,
    emitidoEmTexto: formatarDataDocumento(d.emitidoEm),
    validadeAteTexto: d.validadeAte ? formatarDataDocumento(d.validadeAte) : null,
    situacao,
    situacaoTexto: rotuloSituacao(situacao),
    arquivoNome: d.arquivo.originalName,
    href: `/api/ativos/documentos/${String(d._id)}/arquivo`,
  };
}

const porTipo = (a: DocumentoDaTela, b: DocumentoDaTela) =>
  a.tipoNome.localeCompare(b.tipoNome, 'pt-BR');

/** A seção Documentos da ficha do ativo. Quem chama já recusou o Solicitante. */
export async function carregarDocumentosDoAtivo(
  ativoId: string,
  hoje: string = hojeEmBelem(),
): Promise<DocumentosDaFicha | null> {
  if (!Types.ObjectId.isValid(ativoId)) return null;
  const ativo = await AtivoModel.findById(ativoId).select('categoriaId localizacaoId status').lean<{
    _id: Types.ObjectId;
    categoriaId: Types.ObjectId;
    localizacaoId?: Types.ObjectId | null;
    status: string;
  }>();
  if (!ativo) return null;

  const [nomes, categoria, doAtivo, cadeia] = await Promise.all([
    mapaDeNomesDeTipo(),
    CategoriaAtivoModel.findById(ativo.categoriaId)
      .select('exigeDocumento')
      .lean<{ exigeDocumento?: string[] }>(),
    DocumentoAtivoModel.find({ ativoId: ativo._id, situacao: { $in: ['vigente', 'substituido'] } })
      .select(
        'tipo numero emitidoPor emitidoEm validadeAte situacao substituidoEm arquivo.originalName',
      )
      .sort({ createdAt: -1 })
      .lean<(DocumentoLean & { situacao: string })[]>(),
    ancestraisDe(ativo.localizacaoId),
  ]);

  const herdadosDocs = cadeia.length
    ? await DocumentoAtivoModel.find({
        localizacaoId: { $in: cadeia.map((n) => n._id) },
        situacao: 'vigente',
      })
        .select('tipo localizacaoId numero emitidoPor emitidoEm validadeAte arquivo.originalName')
        .lean<DocumentoLean[]>()
    : [];
  const nomeDoLocal = new Map(cadeia.map((n) => [String(n._id), n.nome]));
  const ordemNaCadeia = new Map(cadeia.map((n, i) => [String(n._id), i]));

  const vigentes = doAtivo
    .filter((d) => d.situacao === 'vigente')
    .map((d) => paraTela(d, nomes, hoje))
    .sort(porTipo);
  const substituidos = doAtivo
    .filter((d) => d.situacao === 'substituido')
    .map((d) => ({
      ...paraTela(d, nomes, hoje),
      substituidoEmTexto: d.substituidoEm ? formatarDataDocumento(d.substituidoEm) : null,
    }));
  const herdados = herdadosDocs
    .sort(
      (a, b) =>
        (ordemNaCadeia.get(String(a.localizacaoId)) ?? 0) -
        (ordemNaCadeia.get(String(b.localizacaoId)) ?? 0),
    )
    .map((d) => ({
      ...paraTela(d, nomes, hoje),
      localNome: nomeDoLocal.get(String(d.localizacaoId)) ?? '',
    }));

  const cobertos = new Set([...vigentes, ...herdados].map((d) => d.tipo));
  const ativoBaixado = ativo.status === 'baixado';
  const faltando = ativoBaixado
    ? []
    : [...new Set(categoria?.exigeDocumento ?? [])]
        .filter((chave) => nomes.get(chave)?.isActive && !cobertos.has(chave))
        .map((chave) => ({ chave, nome: nomes.get(chave)!.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const tiposAtivos = [...nomes.entries()]
    .filter(([, t]) => t.isActive)
    .map(([chave, t]) => ({ chave, nome: t.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return { vigentes, substituidos, herdados, faltando, tiposAtivos, ativoBaixado };
}
