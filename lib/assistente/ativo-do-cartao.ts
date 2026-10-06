import 'server-only';

import { Types } from 'mongoose';

import { codigosNoTexto } from '@/lib/ativos/codigo';
import { idsDaSubarvore } from '@/lib/ativos/localizacao';
import { FILTRO_VINCULAVEL } from '@/lib/ativos/seletor';
import { lerMensagens } from '@/lib/conversas';
import { AtivoModel } from '@/models/Ativo';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { LocalizacaoModel } from '@/models/Localizacao';
import type { CartaoModo } from '@/shared/conversas/conversa.constants';
import {
  ATIVO_CANDIDATO_TEXTO_MAX,
  type AtivoDoCartao,
  type AtivoOrigem,
  type CartaoPayload,
} from '@/shared/conversas/conversa.schemas';

import { ATIVO_CANDIDATOS_MAX } from './config';
import { ehMensagemDoRelato } from './confirmar';

/**
 * O equipamento sugerido no cartão resumo (spec 0014, AC-1 a AC-4). Sai do
 * código digitado no relato ou, sem código, do cruzamento entre a categoria do
 * serviço, a unidade do cartão e as palavras do local. Nunca chama o modelo e
 * nunca passa pelo portão de confiança.
 *
 * Nada aqui lança: falha de banco devolve `null`, e o cartão segue sem ativo.
 */

/** Palavras genéricas que não ajudam a separar um local de outro (AC-2). */
export const PALAVRAS_LOCAL_IGNORADAS: readonly string[] = [
  'sala',
  'andar',
  'bloco',
  'predio',
  'piso',
];

/** Os códigos citados nas mensagens do relato, na ordem e sem repetição (AC-1). */
export function codigosDoRelato(
  mensagens: readonly { autor: string; tipo: string; texto: string }[],
): string[] {
  const todos = mensagens.filter(ehMensagemDoRelato).flatMap((m) => codigosNoTexto(m.texto));
  return [...new Set(todos)];
}

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Números e palavras de 3 letras ou mais, sem acento, fora das genéricas. */
export function palavrasDoLocal(texto: string | null | undefined): string[] {
  const palavras = semAcento(texto ?? '')
    .split(/[^a-z0-9]+/)
    .filter((p) => (/^\d+$/.test(p) || p.length >= 3) && !PALAVRAS_LOCAL_IGNORADAS.includes(p));
  return [...new Set(palavras)];
}

/**
 * O desempate pelo local (AC-2): ficam só os candidatos com mais palavras do
 * local em comum com o caminho e a descrição, se esse número passar de zero.
 * Sem nenhuma palavra em comum, ficam todos.
 */
export function desempatarPorLocal<T extends { caminho: string | null; descricao: string }>(
  candidatos: readonly T[],
  localExato: string | null,
): T[] {
  const palavras = palavrasDoLocal(localExato);
  if (candidatos.length <= 1 || palavras.length === 0) return [...candidatos];

  const pontos = candidatos.map((c) => {
    const doAtivo = new Set(palavrasDoLocal(`${c.caminho ?? ''} ${c.descricao}`));
    return palavras.filter((p) => doAtivo.has(p)).length;
  });
  const maior = Math.max(...pontos);
  if (maior === 0) return [...candidatos];
  return candidatos.filter((_, i) => pontos[i] === maior);
}

type AtivoLido = {
  _id: Types.ObjectId;
  codigo: string;
  descricao: string;
  localizacaoId?: Types.ObjectId | null;
};

type Candidato = AtivoDoCartao['candidatos'][number];

function paraCandidato(ativo: AtivoLido, caminhoPorLocal: Map<string, string>): Candidato {
  const caminho = ativo.localizacaoId ? caminhoPorLocal.get(String(ativo.localizacaoId)) : null;
  return {
    ativoId: String(ativo._id),
    codigo: ativo.codigo,
    descricao: ativo.descricao.slice(0, ATIVO_CANDIDATO_TEXTO_MAX),
    caminho: caminho ? caminho.slice(0, ATIVO_CANDIDATO_TEXTO_MAX) : null,
  };
}

const PROJECAO = { codigo: 1, descricao: 1, localizacaoId: 1 } as const;

/** Ramo do código (AC-1): só código que existe e pode receber chamado. */
async function candidatosPorCodigo(codigos: string[]): Promise<Candidato[]> {
  const ativos = await AtivoModel.find({ ...FILTRO_VINCULAVEL, codigo: { $in: codigos } })
    .select(PROJECAO)
    .lean<AtivoLido[]>();
  if (ativos.length === 0) return [];

  const porCodigo = new Map(ativos.map((a) => [a.codigo, a]));
  const emOrdem = codigos
    .map((c) => porCodigo.get(c))
    .filter((a): a is AtivoLido => Boolean(a))
    .slice(0, ATIVO_CANDIDATOS_MAX);

  const localIds = emOrdem.map((a) => a.localizacaoId).filter(Boolean);
  const locais = localIds.length
    ? await LocalizacaoModel.find({ _id: { $in: localIds } })
        .select('caminho')
        .lean<{ _id: Types.ObjectId; caminho: string }[]>()
    : [];
  const caminhoPorLocal = new Map(locais.map((l) => [String(l._id), l.caminho]));
  return emOrdem.map((a) => paraCandidato(a, caminhoPorLocal));
}

/**
 * Ramo da regra (AC-2, AC-3): categoria ligada ao subtipo do serviço, local
 * ativo da unidade (ou descendente ativo dele) e o desempate pelo texto do
 * local. Zero ou mais de 5 depois do desempate não sugere nada.
 */
async function candidatosPorRegra(params: {
  subtypeId: string;
  unitId: string;
  localExato: string | null;
}): Promise<Candidato[]> {
  const [categorias, locaisDaUnidade] = await Promise.all([
    CategoriaAtivoModel.find({ serviceSubTypeId: params.subtypeId })
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>(),
    LocalizacaoModel.find({ unitId: params.unitId, isActive: true })
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>(),
  ]);
  if (categorias.length === 0 || locaisDaUnidade.length === 0) return [];

  // O filho herda a unidade do pai mesmo sem `unitId` próprio.
  const subarvores = await Promise.all(locaisDaUnidade.map((l) => idsDaSubarvore(String(l._id))));
  const ids = [...new Set(subarvores.flat().map(String))];
  const locais = await LocalizacaoModel.find({ _id: { $in: ids }, isActive: true })
    .select('caminho')
    .lean<{ _id: Types.ObjectId; caminho: string }[]>();
  if (locais.length === 0) return [];
  const caminhoPorLocal = new Map(locais.map((l) => [String(l._id), l.caminho]));

  const ativos = await AtivoModel.find({
    ...FILTRO_VINCULAVEL,
    categoriaId: { $in: categorias.map((c) => c._id) },
    localizacaoId: { $in: locais.map((l) => l._id) },
  })
    .select(PROJECAO)
    .sort({ codigo: 1 })
    .lean<AtivoLido[]>();

  const candidatos = desempatarPorLocal(
    ativos.map((a) => paraCandidato(a, caminhoPorLocal)),
    params.localExato,
  );
  return candidatos.length <= ATIVO_CANDIDATOS_MAX ? candidatos : [];
}

export type DadosDoCartaoParaAtivo = {
  conversaId: string;
  modo: CartaoModo;
  servico: Pick<NonNullable<CartaoPayload['servico']>, 'subtypeId'> | null;
  unidade: Pick<NonNullable<CartaoPayload['unidade']>, 'unitId'> | null;
  localExato: string | null;
};

export async function resolverAtivoDoCartao(
  dados: DadosDoCartaoParaAtivo,
): Promise<AtivoDoCartao | null> {
  try {
    const codigos = codigosDoRelato(await lerMensagens(dados.conversaId));
    if (codigos.length > 0) {
      const porCodigo = await candidatosPorCodigo(codigos);
      if (porCodigo.length > 0) return { origem: 'codigo', candidatos: porCodigo };
    }

    // Sem sinal suficiente, a regra não roda: só o código vale (AC-4).
    if (dados.modo !== 'ia' || !dados.servico || !dados.unidade) return null;

    const porRegra = await candidatosPorRegra({
      subtypeId: dados.servico.subtypeId,
      unitId: dados.unidade.unitId,
      localExato: dados.localExato,
    });
    return porRegra.length > 0 ? { origem: 'regra', candidatos: porRegra } : null;
  } catch (err) {
    console.error(
      '[assistente]',
      JSON.stringify({
        operacao: 'resolverAtivoDoCartao',
        conversaId: dados.conversaId,
        error: err instanceof Error ? err.name : 'unknown',
      }),
    );
    return null;
  }
}

/** Origem e quantidade, para as linhas de log (AC-13). Nunca o código nem o local. */
export function resumoDoAtivo(ativo: AtivoDoCartao | null | undefined): {
  ativoOrigem: AtivoOrigem | null;
  ativoCandidatos: number;
} {
  return { ativoOrigem: ativo?.origem ?? null, ativoCandidatos: ativo?.candidatos.length ?? 0 };
}
