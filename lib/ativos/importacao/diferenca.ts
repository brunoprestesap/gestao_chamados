import 'server-only';

import type { Types } from 'mongoose';

import { AtivoModel } from '@/models/Ativo';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { LocalizacaoModel } from '@/models/Localizacao';
import { SEM_LOCAL, type TierManutencao, TIERS_VINCULAVEIS } from '@/shared/ativos/ativo.constants';
import type { GrupoImportacao } from '@/shared/ativos/importacao.constants';

import {
  CAMPOS_PATRIMONIAIS,
  type CamposPatrimoniaisSicam,
  mesmoValorPatrimonial,
} from '../patrimonial';
import { classificar } from './classificacao';
import type { LinhaSicam } from './parse';

/**
 * A diferença entre as linhas aceitas do SICAM e os ativos do Sigma (spec
 * 0012, AC-19 e AC-20): novos, alterados (inclusive o ausente que voltou) e
 * sumidos. Só lê o banco; quem grava é `pendente.ts`.
 */

export type CampoAlterado = { campo: string; antes?: unknown; depois?: unknown };

export type DadosNovo = {
  descricao: string;
  numeroSerie?: string;
  camposPatrimoniais: CamposPatrimoniaisSicam;
};

export type ItemImportacao = {
  grupo: GrupoImportacao;
  codigo: string;
  retornou?: boolean;
  tier?: TierManutencao;
  categoriaSugerida?: string;
  bloqueio?: string;
  descricao?: string;
  local?: string;
  camposAlterados?: CampoAlterado[];
  dados?: DadosNovo;
};

export type Diferenca = {
  itens: ItemImportacao[];
  continuamAusentes: number;
  contagens: { novos: number; alterados: number; sumidos: number };
};

type AtivoPatrimonio = {
  _id: Types.ObjectId;
  codigo: string;
  descricao: string;
  status: string;
  localizacaoId?: Types.ObjectId | null;
  camposPatrimoniais?: Record<string, unknown> | null;
};

export function textoBloqueio(chave: string): string {
  return `Categoria ${chave} não cadastrada`;
}

/** Campos que mudaram. Campo vazio no CSV nunca conta como mudança. */
export function camposQueMudaram(
  atual: Record<string, unknown> | null | undefined,
  linha: CamposPatrimoniaisSicam,
): CampoAlterado[] {
  const mudancas: CampoAlterado[] = [];
  for (const { campo } of CAMPOS_PATRIMONIAIS) {
    const depois = linha[campo];
    if (depois === undefined) continue;
    const antes = atual?.[campo] ?? undefined;
    if (mesmoValorPatrimonial(campo, antes, depois)) continue;
    mudancas.push(antes === undefined ? { campo, depois } : { campo, antes, depois });
  }
  return mudancas;
}

export async function calcularDiferenca(
  linhas: LinhaSicam[],
  codigosAceitos: Set<string>,
): Promise<Diferenca> {
  const [ativos, categorias] = await Promise.all([
    AtivoModel.find({ origemCodigo: 'patrimonio' })
      .select('codigo descricao status localizacaoId camposPatrimoniais')
      .lean<AtivoPatrimonio[]>(),
    CategoriaAtivoModel.find({ isActive: true }).select('chave').lean<{ chave: string }[]>(),
  ]);
  const porCodigo = new Map(ativos.map((a) => [a.codigo, a]));
  const chavesAtivas = new Set(categorias.map((c) => c.chave));

  const novos: ItemImportacao[] = [];
  const alterados: ItemImportacao[] = [];

  for (const linha of linhas) {
    const ativo = porCodigo.get(linha.codigo);
    if (!ativo) {
      const classe = classificar(linha.descricao);
      if (!classe || !TIERS_VINCULAVEIS.includes(classe.tier)) continue;
      novos.push({
        grupo: 'novo',
        codigo: linha.codigo,
        tier: classe.tier,
        categoriaSugerida: classe.categoria,
        ...(!chavesAtivas.has(classe.categoria) && { bloqueio: textoBloqueio(classe.categoria) }),
        descricao: linha.descricao,
        dados: {
          descricao: linha.descricao,
          ...(linha.numeroSerie && { numeroSerie: linha.numeroSerie }),
          camposPatrimoniais: linha.camposPatrimoniais,
        },
      });
      continue;
    }

    const atual = ativo.camposPatrimoniais ?? null;
    const mudancas = camposQueMudaram(atual, linha.camposPatrimoniais);
    const retornou = !!atual?.ausenteNoSicamDesde;
    if (mudancas.length === 0 && !retornou && atual) continue;
    alterados.push({
      grupo: 'alterado',
      codigo: ativo.codigo,
      ...(retornou && { retornou: true }),
      descricao: ativo.descricao,
      camposAlterados: mudancas,
    });
  }

  // Sumido: já veio do SICAM alguma vez, não está baixado nem marcado, e saiu do arquivo.
  const fora = ativos.filter((a) => !codigosAceitos.has(a.codigo));
  const continuamAusentes = fora.filter((a) => !!a.camposPatrimoniais?.ausenteNoSicamDesde).length;
  const sumidosAtivos = fora.filter(
    (a) =>
      a.status !== 'baixado' &&
      !!a.camposPatrimoniais?.importadoEm &&
      !a.camposPatrimoniais?.ausenteNoSicamDesde,
  );
  const idsLocais = [
    ...new Set(sumidosAtivos.flatMap((a) => (a.localizacaoId ? [String(a.localizacaoId)] : []))),
  ];
  const locais = idsLocais.length
    ? await LocalizacaoModel.find({ _id: { $in: idsLocais } })
        .select('caminho')
        .lean<{ _id: Types.ObjectId; caminho: string }[]>()
    : [];
  const caminho = new Map(locais.map((l) => [String(l._id), l.caminho]));
  const sumidos: ItemImportacao[] = sumidosAtivos.map((a) => ({
    grupo: 'sumido',
    codigo: a.codigo,
    descricao: a.descricao,
    local: (a.localizacaoId && caminho.get(String(a.localizacaoId))) || SEM_LOCAL,
  }));

  return {
    itens: [...novos, ...alterados, ...sumidos],
    continuamAusentes,
    contagens: { novos: novos.length, alterados: alterados.length, sumidos: sumidos.length },
  };
}
