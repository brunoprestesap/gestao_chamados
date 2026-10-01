/**
 * Carga única do Tier A (spec 0011, AC-8 e AC-9): lê o CSV limpo
 * (`docs/ativos_sicam.csv`, `;` com aspas) e monta os dados que o gerador
 * (`scripts/gerar-carga-ativos.ts`) escreve num script mongosh.
 *
 * Imports relativos, sem o alias `@/` e sem `server-only`: roda pelo `tsx`,
 * fora do Next. Descartável: a fatia 2 troca isto por um importador do CSV
 * bruto do SICAM.
 */
import type { Criticidade } from '../../shared/ativos/ativo.constants';
import { normalizarCodigo } from './codigo';

/** As 9 categorias da carga. A criticidade é ponto de partida; o Admin ajusta. */
export const CATEGORIAS_CARGA: readonly {
  chave: string;
  nome: string;
  criticidadePadrao: Criticidade;
}[] = [
  { chave: 'climatizacao', nome: 'Climatização', criticidadePadrao: 'media' },
  { chave: 'energia_nobreak', nome: 'Nobreak', criticidadePadrao: 'alta' },
  { chave: 'energia_gerador', nome: 'Gerador', criticidadePadrao: 'critica' },
  { chave: 'energia_transformador', nome: 'Transformador', criticidadePadrao: 'critica' },
  { chave: 'combate_incendio', nome: 'Combate a incêndio', criticidadePadrao: 'critica' },
  { chave: 'controle_acesso', nome: 'Controle de acesso', criticidadePadrao: 'media' },
  { chave: 'hidraulica_bomba', nome: 'Bomba hidráulica', criticidadePadrao: 'alta' },
  { chave: 'ar_comprimido', nome: 'Ar comprimido', criticidadePadrao: 'baixa' },
  { chave: 'exaustao_ventilacao', nome: 'Exaustão e ventilação', criticidadePadrao: 'media' },
];

const CHAVES_CONHECIDAS = new Set(CATEGORIAS_CARGA.map((c) => c.chave));

export type CamposPatrimoniaisCarga = {
  lotacao?: string;
  setor?: string;
  responsavelMatricula?: string;
  responsavelNome?: string;
  dataTombo?: Date;
  garantiaInicio?: Date;
  garantiaFim?: Date;
  valorHistorico?: number;
  codigoMaterial?: string;
  fornecedor?: string;
  numeroSerie?: string;
};

export type AtivoCarga = {
  codigo: string;
  tombamento: string;
  origemCodigo: 'patrimonio' | 'interno';
  descricao: string;
  tierManutencao: 'A';
  categoriaChave: string;
  numeroSerie?: string;
  camposPatrimoniais: CamposPatrimoniaisCarga;
};

/** Erro de dado no CSV: o gerador para antes de escrever o script. */
export class ErroCarga extends Error {}

/**
 * Parser de CSV com separador `;`, aspas duplas (`""` escapa aspas) e quebra
 * de linha dentro de campo entre aspas. Aceita CRLF e BOM.
 */
export function parseCsv(texto: string, separador = ';'): string[][] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let entreAspas = false;
  const t = texto.replace(/^﻿/, '');

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreAspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      entreAspas = true;
    } else if (c === separador) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => !(l.length === 1 && l[0].trim() === ''));
}

/** Lê o CSV em objetos pelo cabeçalho. Linha com número errado de colunas falha. */
export function lerRegistros(texto: string): Record<string, string>[] {
  const [cabecalho, ...corpo] = parseCsv(texto);
  if (!cabecalho) throw new ErroCarga('CSV vazio.');
  const nomes = cabecalho.map((n) => n.trim());
  return corpo.map((valores, idx) => {
    if (valores.length !== nomes.length) {
      throw new ErroCarga(
        `Linha ${idx + 2}: ${valores.length} colunas, o cabeçalho tem ${nomes.length}.`,
      );
    }
    return Object.fromEntries(nomes.map((n, i) => [n, valores[i]]));
  });
}

function texto(v: string | undefined): string | undefined {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : undefined;
}

/** `AAAA-MM-DD` vira Date ao meio dia UTC (não muda de dia no fuso de Belém). */
function data(v: string | undefined, coluna: string, codigo: string): Date | undefined {
  const t = texto(v);
  if (!t) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    throw new ErroCarga(`Ativo ${codigo}: data inválida em ${coluna} ("${t}").`);
  }
  return new Date(`${t}T12:00:00Z`);
}

/** `8700,9`, `1.234,5` ou `8700.9` vira number. */
function numero(v: string | undefined, coluna: string, codigo: string): number | undefined {
  const t = texto(v);
  if (!t) return undefined;
  // Com vírgula, o ponto é separador de milhar (`1.234,5`); sem vírgula, é decimal.
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  if (!Number.isFinite(n)) {
    throw new ErroCarga(`Ativo ${codigo}: número inválido em ${coluna} ("${t}").`);
  }
  return n;
}

function semVazios<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Converte uma linha em ativo. Falha quando a categoria não está entre as 9
 * ou quando `codigo` e `tombamento` não batem depois de normalizados.
 */
export function mapearLinha(r: Record<string, string>): AtivoCarga {
  const codigo = normalizarCodigo(r.codigo ?? '');
  if (!codigo) throw new ErroCarga('Linha sem código.');
  const tombamento = normalizarCodigo(r.tombamento ?? '');
  if (codigo !== tombamento) {
    throw new ErroCarga(`Ativo ${codigo}: código diferente do tombamento (${tombamento}).`);
  }
  const categoriaChave = (r.categoriaSugerida ?? '').trim();
  if (!CHAVES_CONHECIDAS.has(categoriaChave)) {
    throw new ErroCarga(`Ativo ${codigo}: categoria desconhecida "${categoriaChave}".`);
  }
  const origem = (r.origemCodigo ?? '').trim();
  if (origem !== 'patrimonio' && origem !== 'interno') {
    throw new ErroCarga(`Ativo ${codigo}: origemCodigo inválida "${origem}".`);
  }
  const descricao = texto(r.descricao);
  if (!descricao) throw new ErroCarga(`Ativo ${codigo}: sem descrição.`);

  const numeroSerie = texto(r.numeroSerie);
  return semVazios({
    codigo,
    tombamento,
    origemCodigo: origem,
    descricao,
    tierManutencao: 'A' as const,
    categoriaChave,
    numeroSerie,
    camposPatrimoniais: semVazios({
      lotacao: texto(r.lotacao),
      setor: texto(r.setor),
      responsavelMatricula: texto(r.responsavelMatricula),
      responsavelNome: texto(r.responsavelNome),
      dataTombo: data(r.dataTombo, 'dataTombo', codigo),
      garantiaInicio: data(r.garantiaInicio, 'garantiaInicio', codigo),
      garantiaFim: data(r.garantiaFim, 'garantiaFim', codigo),
      valorHistorico: numero(r.valorHistorico, 'valorHistorico', codigo),
      codigoMaterial: texto(r.codigoMaterial),
      fornecedor: texto(r.fornecedor),
      numeroSerie,
    }),
  });
}

/** Só as linhas `tierManutencao = A`, mapeadas. Código repetido no CSV falha. */
export function montarCarga(textoCsv: string): AtivoCarga[] {
  const ativos = lerRegistros(textoCsv)
    .filter((r) => (r.tierManutencao ?? '').trim().toUpperCase() === 'A')
    .map(mapearLinha);
  const vistos = new Set<string>();
  for (const a of ativos) {
    if (vistos.has(a.codigo)) throw new ErroCarga(`Código repetido no CSV: ${a.codigo}.`);
    vistos.add(a.codigo);
  }
  return ativos;
}
