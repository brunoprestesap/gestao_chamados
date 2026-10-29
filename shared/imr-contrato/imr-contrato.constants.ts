/**
 * Escala, faixas e textos do IMR do contrato (spec 0023). Puros, usados igual
 * na tela, no fechamento e no PDF.
 */

/** Pontos máximos de cada indicador; a soma é sempre 100 (RN-50, AC-17). */
export const PONTOS_MAXIMOS = { i1: 40, i2: 20, i3: 20, i4: 20 } as const;

/**
 * Escala do TR para os indicadores 3 e 4 (AC-4): 0 ocorrência = 20, 1 = 15,
 * 2 = 10, 3 = 5, 4 ou mais = 0.
 */
export function pontosDaEscala(ocorrencias: number): number {
  if (ocorrencias <= 0) return 20;
  if (ocorrencias >= 4) return 0;
  return 20 - ocorrencias * 5;
}

export type FaixaPagamento = { minimo: number; fator: number; percentual: number };

/** Tabela do funcional 16.1 da spec 0019, da maior para a menor faixa. */
export const FAIXAS_PAGAMENTO: readonly FaixaPagamento[] = [
  { minimo: 80, fator: 1, percentual: 100 },
  { minimo: 70, fator: 0.97, percentual: 97 },
  { minimo: 60, fator: 0.95, percentual: 95 },
  { minimo: 50, fator: 0.93, percentual: 93 },
  { minimo: 0, fator: 0.9, percentual: 90 },
];

/** A faixa de pagamento do total (AC-10). */
export function faixaDoTotal(total: number): FaixaPagamento {
  return FAIXAS_PAGAMENTO.find((f) => total >= f.minimo) ?? FAIXAS_PAGAMENTO.at(-1)!;
}

/** Quantos dias antes do mês a leitura começa, para pegar prazos que caem dentro dele. */
export const DIAS_ANTES_DO_MES = 30;

/**
 * N do prazo estimado da cotação autorizada antes da spec 0023, sem
 * `fornecimentoAte` gravado (AC-6): fixo em 5, não segue o parâmetro.
 */
export const N_PRAZO_ESTIMADO = 5;

/**
 * Desde este instante (o merge da spec 0023, 29/10/2026), a autorização grava
 * `fornecimentoAte`. Cotação autorizada depois dele e ainda sem prazo teve
 * falha no cálculo, e o prazo estimado usa o N atual do parâmetro, não o 5.
 */
export const INICIO_PRAZO_GRAVADO = new Date('2026-10-29T14:19:09.000Z');

/** Quantos dias antes do fim do mês a autorização antiga pode ter, para o prazo estimado cair nele. */
export const DIAS_AUTORIZACAO_ESTIMADA = 60;

export const TEXTO_SOMA_RN50 =
  'A soma é de quatro indicadores em 100 pontos, conforme o checklist do TR. A divergência da seção 30.2.1 do TR está registrada para correção (RN-50).';

export const TEXTO_PREVIA = 'Mês aberto: prévia ao vivo, os números mudam até o fechamento.';

/** Tamanho do motivo das marcações, do fechamento e da reabertura (AC-7, AC-8, AC-11). */
export const MOTIVO_IMR_MIN = 10;
export const MOTIVO_IMR_MAX = 500;

/**
 * As marcações do fiscal e do gestor (AC-7, AC-8). Duas famílias: desconsiderar
 * um atraso, e não atendimento (no indicador 4, lido como "não fornecido").
 */
export const TIPOS_MARCACAO = [
  'desconsiderar',
  'desfazer_desconsiderar',
  'nao_atendimento',
  'desfazer_nao_atendimento',
] as const;
export type TipoMarcacao = (typeof TIPOS_MARCACAO)[number];

export const PAPEIS_IMR = ['fiscal', 'gestor'] as const;
export type PapelImr = (typeof PAPEIS_IMR)[number];

/** O papel gravado na emissão do PDF (AC-13): o Admin sem designação também emite. */
export const PAPEIS_EMISSAO_IMR = ['fiscal', 'gestor', 'admin'] as const;
export type PapelEmissaoImr = (typeof PAPEIS_EMISSAO_IMR)[number];

/** O que cada marcação faz, no título do diálogo e no botão, por indicador. */
export function rotuloMarcacao(tipo: TipoMarcacao, indicador: 3 | 4): string {
  switch (tipo) {
    case 'desconsiderar':
      return 'Desconsiderar atraso';
    case 'desfazer_desconsiderar':
      return 'Desfazer desconsideração';
    case 'nao_atendimento':
      return indicador === 3 ? 'Marcar não atendimento' : 'Marcar não fornecido';
    case 'desfazer_nao_atendimento':
      return indicador === 3 ? 'Desfazer não atendimento' : 'Desfazer não fornecido';
  }
}

export const MENSAGENS_MARCACAO = {
  semPapel: 'Só o fiscal ou o gestor do contrato fazem marcações no IMR.',
  foraDaBase3: 'Esse chamado não está na base do indicador 3 deste mês.',
  foraDaBase4: 'Essa cotação não está na base do indicador 4 deste mês.',
  semAtraso: 'Só uma ocorrência de atraso pode ser desconsiderada.',
  jaDesconsiderada: 'Essa ocorrência já está desconsiderada.',
  semDesconsideracao: 'Essa ocorrência não está desconsiderada.',
  jaNaoAtendimento: 'Essa marcação já está feita.',
  semNaoAtendimento: 'Não há marcação vigente para desfazer.',
  mesIndisponivel: 'Esse mês não está disponível para esse contrato.',
} as const;

/** `CHM-2026-00123` casa com ele mesmo e com só a parte final, `123` ou `00123`. */
export function mesmoNumero(ticketNumber: string, digitado: string): boolean {
  if (ticketNumber.toLowerCase() === digitado.toLowerCase()) return true;
  if (!/^\d+$/.test(digitado)) return false;
  const final = ticketNumber.match(/(\d+)$/)?.[1];
  return final !== undefined && Number(final) === Number(digitado);
}

/** Observação opcional dos pontos dos indicadores 1 e 2 no fechamento (AC-10). */
export const OBSERVACAO_IMR_MAX = 500;

export const MENSAGENS_FECHAMENTO = {
  mesFechado: 'O mês está fechado. Reabra para alterar.',
  mesNaoTerminou: 'O mês só pode ser fechado depois do último dia dele.',
  jaFechado: 'O mês já está fechado.',
  corridaFechamento: 'O mês já foi fechado por outra pessoa. Atualize a tela.',
  previaMudou:
    'Os pontos dos indicadores 3 ou 4 mudaram desde que você abriu a tela. Atualize a tela e confira antes de fechar.',
  naoFechado: 'O mês não está fechado.',
  corridaReabertura: 'O mês já foi reaberto por outra pessoa. Atualize a tela.',
  semPapel: 'Só o fiscal ou o gestor do contrato fecham e reabrem o mês do IMR.',
} as const;

export type IndicadorImr = 1 | 2 | 3 | 4;

/** Pontos dos quatro indicadores; I1 e I2 ficam null na prévia, antes do fechamento. */
export type PontosImr = { i1: number | null; i2: number | null; i3: number; i4: number };

/**
 * Reincidência de zero (AC-12): o indicador com 0 no mês e 0 no fechamento
 * vigente do mês anterior do mesmo contrato.
 */
export type Reincidencia =
  | { avaliada: true; zerados: IndicadorImr[] }
  | { avaliada: false; motivo: 'mes_anterior_aberto' | 'primeiro_mes' };

export function textoReincidenciaZero(indicador: IndicadorImr): string {
  return `Reincidência de zero no indicador ${indicador}: multa de 0,3% sobre a nota fiscal mensal.`;
}

export const TEXTO_REINCIDENCIA_NAO_AVALIADA = {
  mes_anterior_aberto: 'Reincidência não avaliada: o mês anterior não foi fechado.',
  primeiro_mes: 'Reincidência não avaliada: primeiro mês do contrato.',
} as const;

export const TEXTO_SEM_REINCIDENCIA = 'Sem reincidência de zero em relação ao mês anterior.';

export const MENSAGENS_PDF_IMR = {
  semAcesso: 'O IMR do contrato é do Admin e de quem tem designação de fiscal ou gestor.',
  mesAberto: 'O PDF sai só do mês fechado. Feche o mês antes de emitir.',
  mesIndisponivel: 'Esse mês não está disponível para esse contrato.',
  ocupado: 'Outro PDF está sendo gerado. Tente em alguns segundos.',
  falhou: 'Não foi possível gerar o PDF. Tente de novo.',
} as const;
