import { normalizarCodigo } from '../codigo';
import {
  type CamposPatrimoniaisSicam,
  ILEGIVEL,
  lerDataSicam,
  lerNumero,
  texto,
  textoCompacto,
} from '../patrimonial';
import { COLUNA, COLUNAS_USADAS, MAPA_PATRIMONIAL } from './layout';

/**
 * Leitura do export bruto do SICAM (spec 0012, AC-17 e AC-18). O arquivo não
 * tem aspas e quebra linhas quando a descrição traz `;`, então o parse é
 * próprio: divide por `;` e conserta a linha vendo os campos crus, como o
 * `docs/specs/0011-gestao-ativos/extrair.py`. Nada aqui toca o banco.
 */

/** Uma linha aceita (bem tombado e presente), já mapeada. */
export type LinhaSicam = {
  codigo: string;
  descricao: string;
  numeroSerie?: string;
  camposPatrimoniais: CamposPatrimoniaisSicam;
};

export type ContagensParse = {
  linhasLidas: number;
  linhasReparadas: number;
  linhasAceitas: number;
  linhasDuplicadas: number;
  valoresIlegiveis: number;
};

export type ResultadoParse =
  | ({ ok: true; linhas: LinhaSicam[]; codigosAceitos: Set<string> } & ContagensParse)
  | { ok: false; error: string };

/** O export sai do Oracle em cp1252 (Windows-1252), não em UTF-8. */
export function decodificarCp1252(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder('windows-1252').decode(bytes);
}

function igualSemCaixa(v: string | undefined, esperado: string): boolean {
  return (v ?? '').trim().toUpperCase() === esperado;
}

/**
 * Acerta a linha para o número de campos do cabeçalho. Com campos a mais, o
 * excesso veio de `;` na descrição: os campos antes dela e depois dela ficam
 * fixos (4 e 34 no export atual) e o meio volta a ser a descrição. Com campos
 * a menos, completa com vazios à direita.
 */
function repararLinha(
  campos: string[],
  esperado: number,
  indiceDescricao: number,
): { campos: string[]; reparada: boolean } {
  if (campos.length === esperado) return { campos, reparada: false };
  if (campos.length < esperado) {
    return {
      campos: [...campos, ...Array<string>(esperado - campos.length).fill('')],
      reparada: true,
    };
  }
  const direita = esperado - indiceDescricao - 1;
  return {
    campos: [
      ...campos.slice(0, indiceDescricao),
      campos.slice(indiceDescricao, campos.length - direita).join(';'),
      ...campos.slice(campos.length - direita),
    ],
    reparada: true,
  };
}

export function parseSicam(textoArquivo: string): ResultadoParse {
  const linhasTexto = textoArquivo.replace(/^﻿/, '').split(/\r?\n/);
  const cabecalhoTexto = linhasTexto.shift();
  if (!cabecalhoTexto || cabecalhoTexto.trim() === '') {
    return { ok: false, error: 'O arquivo está vazio.' };
  }

  const cabecalho = cabecalhoTexto.split(';').map((n) => n.trim());
  const indice = new Map<string, number>();
  cabecalho.forEach((nome, i) => {
    if (!indice.has(nome)) indice.set(nome, i);
  });
  const faltando = COLUNAS_USADAS.find((c) => !indice.has(c));
  if (faltando) {
    return {
      ok: false,
      error: `O arquivo não parece um export do SICAM: falta a coluna ${faltando}`,
    };
  }
  const col = (nome: string) => indice.get(nome)!;
  const indiceDescricao = col(COLUNA.descricaoMaterial);

  const contagens: ContagensParse = {
    linhasLidas: 0,
    linhasReparadas: 0,
    linhasAceitas: 0,
    linhasDuplicadas: 0,
    valoresIlegiveis: 0,
  };
  const linhas: LinhaSicam[] = [];
  const codigosAceitos = new Set<string>();

  for (const bruta of linhasTexto) {
    if (bruta.trim() === '') continue;
    contagens.linhasLidas += 1;
    const { campos, reparada } = repararLinha(bruta.split(';'), cabecalho.length, indiceDescricao);
    if (reparada) contagens.linhasReparadas += 1;

    if (!igualSemCaixa(campos[col(COLUNA.tipoTombo)], 'T')) continue;
    if (!igualSemCaixa(campos[col(COLUNA.saida)], 'PRESENTE')) continue;
    contagens.linhasAceitas += 1;

    const codigo = normalizarCodigo(campos[col(COLUNA.numeroTombo)] ?? '');
    if (!codigo) continue;
    if (codigosAceitos.has(codigo)) {
      contagens.linhasDuplicadas += 1;
      continue;
    }
    codigosAceitos.add(codigo);

    const camposPatrimoniais: Record<string, unknown> = {};
    for (const m of MAPA_PATRIMONIAL) {
      const cru = campos[col(m.coluna)];
      const valor =
        m.tipo === 'data' ? lerDataSicam(cru) : m.tipo === 'numero' ? lerNumero(cru) : texto(cru);
      if (valor === ILEGIVEL) {
        contagens.valoresIlegiveis += 1;
        continue;
      }
      if (valor !== undefined) camposPatrimoniais[m.campo] = valor;
    }

    const numeroSerie = camposPatrimoniais.numeroSerie as string | undefined;
    linhas.push({
      codigo,
      descricao: textoCompacto(campos[indiceDescricao]) ?? '',
      ...(numeroSerie && { numeroSerie }),
      camposPatrimoniais: camposPatrimoniais as CamposPatrimoniaisSicam,
    });
  }

  return { ok: true, linhas, codigosAceitos, ...contagens };
}
