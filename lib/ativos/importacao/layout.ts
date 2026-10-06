import type { CampoPatrimonial, TipoCampoPatrimonial } from '../patrimonial';

/**
 * As colunas que o importador lê do export bruto do SICAM (spec 0012, AC-17),
 * os mesmos nomes que `docs/specs/0011-gestao-ativos/extrair.py` lê do export real. O cabeçalho é
 * conferido pelo nome, nunca pela posição. `Situação`, `Estado de
 * Conservação` e `Classificação` ficam de fora de propósito.
 */
export const COLUNA = {
  tipoTombo: 'Tipo Tombo',
  numeroTombo: 'Número Tombo',
  descricaoMaterial: 'Descrição Material',
  saida: 'Saída',
} as const;

/** Coluna do SICAM para o campo de `camposPatrimoniais`, com o tipo do valor. */
export const MAPA_PATRIMONIAL: readonly {
  coluna: string;
  campo: CampoPatrimonial;
  tipo: TipoCampoPatrimonial;
}[] = [
  { coluna: 'Descrição Lotação', campo: 'lotacao', tipo: 'texto' },
  { coluna: 'Nome Setor', campo: 'setor', tipo: 'texto' },
  { coluna: 'Matrícula Responsável Termo', campo: 'responsavelMatricula', tipo: 'texto' },
  { coluna: 'Nome Responsável Termo', campo: 'responsavelNome', tipo: 'texto' },
  { coluna: 'Data Tombo', campo: 'dataTombo', tipo: 'data' },
  { coluna: 'Dt Ini Garantia', campo: 'garantiaInicio', tipo: 'data' },
  { coluna: 'Dt Fim Garantia', campo: 'garantiaFim', tipo: 'data' },
  { coluna: 'Valor Histórico', campo: 'valorHistorico', tipo: 'numero' },
  { coluna: 'Código Material', campo: 'codigoMaterial', tipo: 'texto' },
  { coluna: 'Nome Fornecedor', campo: 'fornecedor', tipo: 'texto' },
  { coluna: 'Numero de série', campo: 'numeroSerie', tipo: 'texto' },
];

/** Todas as colunas usadas: faltando uma, o arquivo é recusado. */
export const COLUNAS_USADAS: readonly string[] = [
  ...Object.values(COLUNA),
  ...MAPA_PATRIMONIAL.map((m) => m.coluna),
];

/** Limite do arquivo, o mesmo `client_max_body_size 10M` do nginx. */
export const TAMANHO_MAXIMO_ARQUIVO = 10 * 1024 * 1024;
