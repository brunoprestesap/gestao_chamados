/**
 * Export do SICAM fictício para os testes (spec 0012, parte 2). O arquivo de
 * verdade tem nome e matrícula (LGPD) e nunca entra em teste. O cabeçalho tem
 * 39 colunas, como o export atual: 4 antes da descrição e 34 depois.
 */

const ESQUERDA = ['Tipo Tombo', 'Número Tombo', 'Código Material', 'Situação'];
const DIREITA_USADAS = [
  'Nome Fornecedor',
  'Data Tombo',
  'Descrição Lotação',
  'Nome Setor',
  'Matrícula Responsável Termo',
  'Nome Responsável Termo',
  'Numero de série',
  'Saída',
  'Dt Ini Garantia',
  'Dt Fim Garantia',
  'Valor Histórico',
  'Estado de Conservação',
  'Classificação',
];
const DIREITA = [
  ...DIREITA_USADAS,
  ...Array.from({ length: 34 - DIREITA_USADAS.length }, (_, i) => `Coluna Extra ${i + 1}`),
];

export const CABECALHO_SICAM = [...ESQUERDA, 'Descrição Material', ...DIREITA];

export type LinhaFicticia = Partial<Record<string, string>>;

/** Uma linha bem tombada e presente, com os campos dados por cima. */
export function linhaSicam(campos: LinhaFicticia = {}, cabecalho = CABECALHO_SICAM): string {
  const base: Record<string, string> = {
    'Tipo Tombo': 'T',
    'Número Tombo': '100',
    'Código Material': '5555',
    'Descrição Material': 'CONDICIONADOR DE AR SPLIT 12000 BTUS',
    'Nome Fornecedor': 'FORNECEDOR FICTICIO LTDA',
    'Data Tombo': '15-JAN-20',
    'Descrição Lotação': 'SECRETARIA FICTICIA',
    'Nome Setor': 'SETOR X',
    'Matrícula Responsável Termo': 'XX00001',
    'Nome Responsável Termo': 'PESSOA FICTICIA',
    'Numero de série': 'SN100',
    Saída: 'PRESENTE',
    'Dt Ini Garantia': '',
    'Dt Fim Garantia': '29-DEZ-23',
    'Valor Histórico': '8.700,90',
  };
  const valores = { ...base, ...campos };
  return cabecalho.map((c) => valores[c] ?? '').join(';');
}

/** O arquivo inteiro, em texto (CRLF, como sai do Windows). */
export function csvSicam(linhas: string[], cabecalho = CABECALHO_SICAM): string {
  return [cabecalho.join(';'), ...linhas].join('\r\n') + '\r\n';
}

/** Bytes em cp1252: para estes textos (só Latin-1), igual ao `latin1` do Node. */
export function bytesCp1252(texto: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(texto, 'latin1'));
}
