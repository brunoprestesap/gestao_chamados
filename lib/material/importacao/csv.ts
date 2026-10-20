import 'server-only';

import { decodificarCp1252 } from '@/lib/ativos/importacao/parse';
import {
  COLUNAS_ANEXO_V,
  COLUNAS_SINAPI,
  LINHAS_PROCURA_CABECALHO,
  MAX_ERROS_LISTADOS,
  MAX_ITEM_ANEXO_V,
  MAX_LINHAS_IMPORTACAO_MATERIAL,
} from '@/shared/material/material.constants';
import { erroColunasFaltando, ERROS_IMPORTACAO_MATERIAL } from '@/shared/material/mensagens';
import { normalizarCodigoSinapi, reaisParaCentavos } from '@/shared/material/valores';

/**
 * Leitura do CSV do Anexo V e do SINAPI (spec 0019, fatia 3, _Leitura do
 * CSV_). Layout próprio e fixo, separador `;` como o Excel em português
 * grava, campo entre aspas aceito. O cabeçalho é procurado nas 20 primeiras
 * linhas e as colunas a mais são ignoradas. Qualquer linha inválida recusa o
 * arquivo inteiro. Nada aqui toca o banco.
 */

export type LinhaAnexoV = {
  numero: number;
  descricao: string;
  unidade: string;
  quantidadeEstimada: number;
  precoPactuadoCentavos: number;
  /** `null` quando a coluna falta ou vem vazia na linha. */
  sinapiCodigo: string | null;
};

export type LinhaSinapi = {
  codigo: string;
  descricao: string;
  unidade: string;
  precoCentavos: number;
};

export type ErroLinha = { linha: number; motivo: string };

export type RecusaCsv = {
  ok: false;
  error: string;
  colunasFaltando?: string[];
  linhas?: ErroLinha[];
};

export type LeituraCsv<T> = { ok: true; linhas: T[] } | RecusaCsv;

/** UTF-8 estrito (com ou sem BOM); se não for, Windows-1252, como o Excel grava. */
export function decodificarCsv(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return decodificarCp1252(bytes);
  }
}

type Registro = { linha: number; campos: string[] };

/**
 * Divide o texto em registros de campos. Aspas duplas só abrem um campo no
 * começo dele; dentro, `""` vira uma aspa e `;` ou quebra de linha fazem
 * parte do campo. `linha` é a linha do arquivo onde o registro começa.
 */
export function lerRegistros(texto: string): Registro[] {
  const t = texto.replace(/^﻿/, '');
  const registros: Registro[] = [];
  let campos: string[] = [];
  let campo = '';
  let entreAspas = false;
  let inicioDoCampo = true;
  let linhaAtual = 1;
  let linhaDoRegistro = 1;

  const fecharCampo = () => {
    campos.push(campo);
    campo = '';
    inicioDoCampo = true;
  };
  const fecharRegistro = () => {
    fecharCampo();
    registros.push({ linha: linhaDoRegistro, campos });
    campos = [];
  };

  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (entreAspas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        if (ch === '\n') linhaAtual++;
        campo += ch;
      }
      continue;
    }
    if (ch === '"' && inicioDoCampo) {
      entreAspas = true;
      inicioDoCampo = false;
      continue;
    }
    if (ch === ';') {
      fecharCampo();
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fecharRegistro();
      linhaAtual++;
      linhaDoRegistro = linhaAtual;
      continue;
    }
    campo += ch;
    inicioDoCampo = false;
  }
  if (campo !== '' || campos.length > 0) fecharRegistro();
  return registros;
}

/** Nome de coluna sem diferença de maiúscula, acento e espaço nas pontas. */
export function normalizarNomeColuna(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}

type Cabecalho = { indiceDoRegistro: number; colunas: Map<string, number> };

/**
 * A primeira linha, entre as 20 primeiras, que tem todas as colunas
 * obrigatórias. Sem ela, as que faltaram são contadas contra a linha que tem
 * mais nomes reconhecidos.
 */
function acharCabecalho(
  registros: Registro[],
  obrigatorias: readonly string[],
  opcionais: readonly string[],
): Cabecalho | { faltando: string[] } {
  const conhecidas = new Set([...obrigatorias, ...opcionais]);
  let melhor: string[] = [...obrigatorias];
  let melhorReconhecidas = -1;
  const limite = Math.min(registros.length, LINHAS_PROCURA_CABECALHO);
  for (let r = 0; r < limite; r++) {
    const colunas = new Map<string, number>();
    registros[r]!.campos.forEach((c, i) => {
      const nome = normalizarNomeColuna(c);
      if (conhecidas.has(nome) && !colunas.has(nome)) colunas.set(nome, i);
    });
    const faltando = obrigatorias.filter((o) => !colunas.has(o));
    if (faltando.length === 0) return { indiceDoRegistro: r, colunas };
    if (colunas.size > melhorReconhecidas) {
      melhorReconhecidas = colunas.size;
      melhor = faltando;
    }
  }
  return { faltando: melhor };
}

/** Texto do campo: espaços colapsados e sem pontas. */
function textoDo(campo: string | undefined): string {
  return (campo ?? '').replace(/\s+/g, ' ').trim();
}

/** Dinheiro no formato brasileiro, até 2 casas e maior que zero. */
function lerPreco(bruto: string): { centavos: number } | { motivo: string } {
  const t = bruto.replace(/R\$\s?/i, '').replace(/\s/g, '');
  if (t === '') return { motivo: 'preço vazio' };
  if (/,\d{3,}$/.test(t)) return { motivo: `preço com mais de 2 casas decimais (${bruto.trim()})` };
  const centavos = reaisParaCentavos(t);
  if (centavos == null) return { motivo: `preço inválido (${bruto.trim()})` };
  if (centavos <= 0) return { motivo: 'preço precisa ser maior que zero' };
  return { centavos };
}

/** Quantidade no formato brasileiro (vírgula decimal, ponto de milhar), até 3 casas. */
function lerQuantidade(bruto: string): { valor: number } | { motivo: string } {
  const t = bruto.replace(/\s/g, '');
  if (t === '') return { motivo: 'quantidade vazia' };
  if (!/^\d{1,3}(\.?\d{3})*(,\d{1,3})?$/.test(t)) {
    return { motivo: `quantidade inválida ou com mais de 3 casas decimais (${bruto.trim()})` };
  }
  const valor = Number(t.replace(/\./g, '').replace(',', '.'));
  if (!(valor > 0)) return { motivo: 'quantidade precisa ser maior que zero' };
  return { valor };
}

function lerDescricao(bruto: string | undefined): { texto: string } | { motivo: string } {
  const texto = textoDo(bruto);
  if (!texto) return { motivo: 'descrição vazia' };
  if (texto.length > 300) return { motivo: 'descrição com mais de 300 caracteres' };
  return { texto };
}

function lerUnidade(bruto: string | undefined): { texto: string } | { motivo: string } {
  const texto = textoDo(bruto);
  if (!texto) return { motivo: 'unidade vazia' };
  if (texto.length > 20) return { motivo: 'unidade com mais de 20 caracteres' };
  return { texto };
}

/**
 * O esqueleto comum dos dois layouts: decodifica, acha o cabeçalho, pula as
 * linhas vazias e junta os erros de linha (até 20 listados).
 */
function lerLayout<T>(
  bytes: ArrayBuffer | Uint8Array,
  layout: { obrigatorias: readonly string[]; opcionais: readonly string[] },
  lerLinha: (valor: (coluna: string) => string | undefined) => T | { motivo: string },
): LeituraCsv<T> {
  const registros = lerRegistros(decodificarCsv(bytes));
  if (registros.every((r) => r.campos.every((c) => c.trim() === ''))) {
    return { ok: false, error: ERROS_IMPORTACAO_MATERIAL.arquivo_vazio };
  }
  const cab = acharCabecalho(registros, layout.obrigatorias, layout.opcionais);
  if ('faltando' in cab) {
    return { ok: false, error: erroColunasFaltando(cab.faltando), colunasFaltando: cab.faltando };
  }

  const linhas: T[] = [];
  const erros: ErroLinha[] = [];
  let totalErros = 0;
  for (const r of registros.slice(cab.indiceDoRegistro + 1)) {
    if (r.campos.every((c) => c.trim() === '')) continue;
    if (linhas.length + totalErros >= MAX_LINHAS_IMPORTACAO_MATERIAL) {
      return { ok: false, error: ERROS_IMPORTACAO_MATERIAL.linhas_demais };
    }
    const valor = (coluna: string) => {
      const i = cab.colunas.get(coluna);
      return i === undefined ? undefined : r.campos[i];
    };
    const lida = lerLinha(valor);
    if (typeof lida === 'object' && lida !== null && 'motivo' in lida) {
      totalErros++;
      if (erros.length < MAX_ERROS_LISTADOS) {
        erros.push({ linha: r.linha, motivo: (lida as { motivo: string }).motivo });
      }
      continue;
    }
    linhas.push(lida as T);
  }
  if (totalErros > 0) {
    return {
      ok: false,
      error:
        totalErros === 1
          ? 'Uma linha do arquivo é inválida; nada foi gravado.'
          : `${totalErros} linhas do arquivo são inválidas; nada foi gravado.`,
      linhas: erros,
    };
  }
  if (linhas.length === 0) return { ok: false, error: ERROS_IMPORTACAO_MATERIAL.sem_linhas };
  return { ok: true, linhas };
}

/** Anexo V: `ITEM`, `DESCRICAO`, `UNIDADE`, `QUANTIDADE`, `PRECO` e `CODIGO_SINAPI` opcional. */
export function lerCsvAnexoV(bytes: ArrayBuffer | Uint8Array): LeituraCsv<LinhaAnexoV> {
  const vistos = new Set<number>();
  return lerLayout<LinhaAnexoV>(bytes, COLUNAS_ANEXO_V, (v) => {
    const itemTexto = textoDo(v('ITEM'));
    if (!/^\d+$/.test(itemTexto)) return { motivo: `ITEM inválido (${itemTexto || 'vazio'})` };
    const numero = Number(itemTexto);
    if (numero < 1 || numero > MAX_ITEM_ANEXO_V) {
      return { motivo: `ITEM fora de 1 a ${MAX_ITEM_ANEXO_V} (${numero})` };
    }
    if (vistos.has(numero)) return { motivo: `ITEM ${numero} repetido no arquivo` };
    vistos.add(numero);
    const descricao = lerDescricao(v('DESCRICAO'));
    if ('motivo' in descricao) return descricao;
    const unidade = lerUnidade(v('UNIDADE'));
    if ('motivo' in unidade) return unidade;
    const quantidade = lerQuantidade(v('QUANTIDADE') ?? '');
    if ('motivo' in quantidade) return quantidade;
    const preco = lerPreco(v('PRECO') ?? '');
    if ('motivo' in preco) return preco;
    const codigo = normalizarCodigoSinapi(v('CODIGO_SINAPI') ?? '');
    if (codigo === null)
      return { motivo: `CODIGO_SINAPI inválido (${textoDo(v('CODIGO_SINAPI'))})` };
    return {
      numero,
      descricao: descricao.texto,
      unidade: unidade.texto,
      quantidadeEstimada: quantidade.valor,
      precoPactuadoCentavos: preco.centavos,
      sinapiCodigo: codigo === '' ? null : codigo,
    };
  });
}

/** SINAPI: `CODIGO`, `DESCRICAO`, `UNIDADE` e `PRECO` (a coluna do AP renomeada). */
export function lerCsvSinapi(bytes: ArrayBuffer | Uint8Array): LeituraCsv<LinhaSinapi> {
  const vistos = new Set<string>();
  return lerLayout<LinhaSinapi>(bytes, COLUNAS_SINAPI, (v) => {
    const codigo = normalizarCodigoSinapi(v('CODIGO') ?? '');
    if (!codigo) return { motivo: `CODIGO inválido (${textoDo(v('CODIGO')) || 'vazio'})` };
    if (vistos.has(codigo)) return { motivo: `CODIGO ${codigo} repetido no arquivo` };
    vistos.add(codigo);
    const descricao = lerDescricao(v('DESCRICAO'));
    if ('motivo' in descricao) return descricao;
    const unidade = lerUnidade(v('UNIDADE'));
    if ('motivo' in unidade) return unidade;
    const preco = lerPreco(v('PRECO') ?? '');
    if ('motivo' in preco) return preco;
    return {
      codigo,
      descricao: descricao.texto,
      unidade: unidade.texto,
      precoCentavos: preco.centavos,
    };
  });
}
