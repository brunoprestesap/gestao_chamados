import 'server-only';

import { MAX_LINHAS_REVISAO_POR_GRUPO } from '@/shared/material/material.constants';

import type { LinhaAnexoV, LinhaSinapi } from './csv';

/**
 * A revisão da importação (spec 0019, AC-24, AC-25): novos, alterados e
 * removidos contra o que vale hoje. Pura. As contagens são todas; as linhas
 * guardadas para a tela param em 500 por grupo.
 */

export type CampoRevisao =
  | 'descricao'
  | 'unidade'
  | 'quantidadeEstimada'
  | 'precoCentavos'
  | 'sinapiCodigo';

export type MudancaRevisao = {
  campo: CampoRevisao;
  antes: string | number | null;
  depois: string | number | null;
};

export type LinhaRevisao = { chave: string; descricao: string; mudancas?: MudancaRevisao[] };

export type Revisao = {
  novos: LinhaRevisao[];
  alterados: LinhaRevisao[];
  removidos: LinhaRevisao[];
};

export type ResumoRevisao = { total: number; novos: number; alterados: number; removidos: number };

function acumular(
  grupos: Revisao,
  resumo: ResumoRevisao,
  grupo: keyof Revisao,
  linha: LinhaRevisao,
) {
  resumo[grupo] += 1;
  if (grupos[grupo].length < MAX_LINHAS_REVISAO_POR_GRUPO) grupos[grupo].push(linha);
}

export type ItemVigenteParaRevisao = {
  numero: number;
  descricao: string;
  unidade: string;
  quantidadeEstimada: number;
  precoPactuadoCentavos: number;
  sinapiCodigo: string | null;
};

/**
 * O código que a versão nova vai gravar: código vazio no CSV mantém o da
 * versão anterior (AC-24, decisão de 19/10).
 */
export function codigoDaVersaoNova(
  doCsv: string | null,
  anterior: string | null | undefined,
): string | null {
  return doCsv ?? anterior ?? null;
}

/** Anexo V contra os itens vigentes do mesmo contrato, por número. */
export function revisarAnexoV(
  linhas: readonly LinhaAnexoV[],
  vigentes: readonly ItemVigenteParaRevisao[],
): { revisao: Revisao; resumo: ResumoRevisao } {
  const revisao: Revisao = { novos: [], alterados: [], removidos: [] };
  const resumo: ResumoRevisao = { total: linhas.length, novos: 0, alterados: 0, removidos: 0 };
  const porNumero = new Map(vigentes.map((v) => [v.numero, v]));
  const vistos = new Set<number>();
  for (const l of [...linhas].sort((a, b) => a.numero - b.numero)) {
    vistos.add(l.numero);
    const atual = porNumero.get(l.numero);
    if (!atual) {
      acumular(revisao, resumo, 'novos', { chave: String(l.numero), descricao: l.descricao });
      continue;
    }
    const mudancas: MudancaRevisao[] = [];
    const comparar = (
      campo: CampoRevisao,
      antes: string | number | null,
      depois: string | number | null,
    ) => {
      if (antes !== depois) mudancas.push({ campo, antes, depois });
    };
    comparar('descricao', atual.descricao, l.descricao);
    comparar('unidade', atual.unidade, l.unidade);
    comparar('quantidadeEstimada', atual.quantidadeEstimada, l.quantidadeEstimada);
    comparar('precoCentavos', atual.precoPactuadoCentavos, l.precoPactuadoCentavos);
    comparar(
      'sinapiCodigo',
      atual.sinapiCodigo ?? null,
      codigoDaVersaoNova(l.sinapiCodigo, atual.sinapiCodigo),
    );
    if (mudancas.length) {
      acumular(revisao, resumo, 'alterados', {
        chave: String(l.numero),
        descricao: l.descricao,
        mudancas,
      });
    }
  }
  for (const v of vigentes) {
    if (!vistos.has(v.numero)) {
      acumular(revisao, resumo, 'removidos', { chave: String(v.numero), descricao: v.descricao });
    }
  }
  return { revisao, resumo };
}

/** SINAPI contra o mês mais recente, por código. Só leitura: o mês novo nunca muda o anterior. */
export function revisarSinapi(
  linhas: readonly LinhaSinapi[],
  anteriores: readonly LinhaSinapi[],
): { revisao: Revisao; resumo: ResumoRevisao } {
  const revisao: Revisao = { novos: [], alterados: [], removidos: [] };
  const resumo: ResumoRevisao = { total: linhas.length, novos: 0, alterados: 0, removidos: 0 };
  const porCodigo = new Map(anteriores.map((a) => [a.codigo, a]));
  const vistos = new Set<string>();
  for (const l of linhas) {
    vistos.add(l.codigo);
    const atual = porCodigo.get(l.codigo);
    if (!atual) {
      acumular(revisao, resumo, 'novos', { chave: l.codigo, descricao: l.descricao });
      continue;
    }
    const mudancas: MudancaRevisao[] = [];
    if (atual.descricao !== l.descricao) {
      mudancas.push({ campo: 'descricao', antes: atual.descricao, depois: l.descricao });
    }
    if (atual.unidade !== l.unidade) {
      mudancas.push({ campo: 'unidade', antes: atual.unidade, depois: l.unidade });
    }
    if (atual.precoCentavos !== l.precoCentavos) {
      mudancas.push({
        campo: 'precoCentavos',
        antes: atual.precoCentavos,
        depois: l.precoCentavos,
      });
    }
    if (mudancas.length) {
      acumular(revisao, resumo, 'alterados', { chave: l.codigo, descricao: l.descricao, mudancas });
    }
  }
  for (const a of anteriores) {
    if (!vistos.has(a.codigo)) {
      acumular(revisao, resumo, 'removidos', { chave: a.codigo, descricao: a.descricao });
    }
  }
  return { revisao, resumo };
}
