/** Tipos da apuração do IMR do contrato (spec 0023), comuns à tela, ao fechamento e ao PDF. */

import type { TipoServico } from '@/shared/chamados/tipo-servico';

import type { PapelEmissaoImr, PapelImr, TipoMarcacao } from './imr-contrato.constants';

export type SituacaoLinha = 'atraso' | 'nao_atendimento' | 'desconsiderada';

/** A marcação vigente de uma família num alvo (AC-7, AC-8). */
export type MarcacaoDaLinha = { motivo: string; porNome: string; papel: PapelImr; em: Date } | null;

/** As marcações vigentes de um alvo, uma por família. */
export type MarcacoesDaLinha = {
  /** A que decide a situação: não atendimento vence a desconsideração. */
  marcacao: MarcacaoDaLinha;
  desconsideracao: MarcacaoDaLinha;
  naoAtendimento: MarcacaoDaLinha;
};

/** Uma linha do indicador 3 (AC-16). */
export type LinhaI3 = {
  chamadoId: string;
  ticketNumber: string;
  solicitanteNome: string;
  setor: string;
  solicitadoEm: Date;
  descricao: string;
  /** Primeira atribuição ao técnico; null = sem início. */
  iniciadoEm: Date | null;
  /** Minutos corridos da abertura ao início, nunca negativo; null sem início. */
  tempoAteInicioMin: number | null;
  prazo: Date;
  /** Passou do prazo sem início (ou começou depois dele). */
  atraso: boolean;
  situacao: SituacaoLinha;
} & MarcacoesDaLinha;

export type ResultadoI3 = {
  pontos: number;
  /** Ocorrências que contam na escala (não desconsideradas). */
  ocorrencias: number;
  desconsideradas: number;
  zeradoPorMarcacao: boolean;
  linhas: LinhaI3[];
  /** Chamados da base do mês (prazo vence no mês). */
  base: number;
  /** Chamados da base atendidos dentro do prazo. */
  noPrazo: number;
  /** Chamados da base sem início com o prazo ainda por vencer. */
  aguardandoPrazo: number;
  /** Chamados que avançaram no ciclo sem `responseStartedAt` (dado antigo); não contam (AC-3). */
  semRegistroDeInicio: number;
};

/** Uma linha do indicador 4 (AC-16). */
export type LinhaI4 = {
  cotacaoId: string;
  numero: string;
  chamadoTicketNumber: string;
  /** null quando o `alterar` desfez a autorização depois do prazo vencido. */
  autorizadoEm: Date | null;
  prazo: Date;
  /** Prazo calculado na leitura, com N = 5, para cotação autorizada antes da spec 0023 (AC-6). */
  prazoEstimado: boolean;
  /** null = sem execução. */
  executadoEm: Date | null;
  /** Passou do prazo sem execução (ou foi executada depois dele). */
  atraso: boolean;
  situacao: SituacaoLinha;
} & MarcacoesDaLinha;

export type ResultadoI4 = {
  pontos: number;
  ocorrencias: number;
  desconsideradas: number;
  zeradoPorMarcacao: boolean;
  linhas: LinhaI4[];
  /** Cotações com prazo de fornecimento no mês. */
  base: number;
  /** Executadas até o prazo. */
  noPrazo: number;
  /** Sem execução com o prazo ainda por vencer. */
  aguardandoPrazo: number;
  /** Cotações da base com o prazo estimado (autorizadas antes da spec 0023). */
  prazosEstimados: number;
};

/**
 * Marcação vigente cujo alvo não está na base do mês (o tipo do chamado mudou,
 * por exemplo): não conta e aparece à parte (AC-9).
 */
export type MarcacaoForaDaBase = {
  indicador: 3 | 4;
  alvoId: string;
  /** Número do chamado ou da cotação; vazio se o alvo sumiu. */
  alvoNumero: string;
  tipo: Extract<TipoMarcacao, 'desconsiderar' | 'nao_atendimento'>;
  motivo: string;
  porNome: string;
  papel: PapelImr;
  em: Date;
};

export type ApuracaoMes = {
  competencia: string;
  apuradoEm: Date;
  /** Feriados (`YYYY-MM-DD`) entre a abertura mais antiga da base e o último prazo. */
  feriadosUsados: string[];
  i3: ResultadoI3;
  i4: ResultadoI4;
  marcacoesForaDaBase: MarcacaoForaDaBase[];
};

/** Um intervalo em que o mês esteve fechado: do `fechadoEm` da vN à reabertura dela (null = ainda fechado). */
export type IntervaloFechado = { de: Date; ate: Date | null };

/** Fechado quando existe fechamento e a maior versão não tem reabertura (AC-10, AC-11). */
export type EstadoDoMes = {
  fechado: boolean;
  /** 0 sem fechamento nenhum. */
  maiorVersao: number;
  intervalos: IntervaloFechado[];
};

/** Os parâmetros usados no ato do fechamento, gravados na foto (AC-10). */
export type ParametrosDoFechamento = {
  prazoFornecimentoDiasUteis: number;
  expediente: { dias: number[]; inicio: string; fim: string; fuso: string };
  /** Os feriados usados nos prazos, `YYYY-MM-DD`. */
  feriados: string[];
  tiposServico: TipoServico[];
  vigencia: { inicio: string; fim: string };
};

/** A foto gravada de um fechamento (AC-10), como a tela e o PDF leem. */
export type FechamentoLido = {
  id: string;
  contratoId: string;
  competencia: string;
  versao: number;
  i1: { pontos: number; observacao: string | null };
  i2: { pontos: number; observacao: string | null };
  i3: ResultadoI3;
  i4: ResultadoI4;
  marcacoesForaDaBase: MarcacaoForaDaBase[];
  total: number;
  faixa: { fator: number; percentual: number };
  reincidenciaZero: (1 | 2 | 3 | 4)[];
  reincidenciaAvaliada: boolean;
  parametros: ParametrosDoFechamento;
  contratoNumero: string;
  fechadoPorNome: string;
  papel: PapelImr;
  fechadoEm: Date;
};

/** Uma reabertura, com o nome do autor (AC-11). */
export type ReaberturaLida = {
  versaoReaberta: number;
  motivo: string;
  porNome: string;
  papel: PapelImr;
  em: Date;
};

/** Uma versão fechada na lista de versões (AC-11). */
export type VersaoResumo = {
  versao: number;
  total: number;
  fechadoPorNome: string;
  papel: PapelImr;
  fechadoEm: Date;
};

/** Uma emissão do PDF de uma versão (AC-13), com o nome de quem emitiu. */
export type EmissaoPdfImr = {
  id: string;
  versao: number;
  sha256: string;
  porNome: string;
  papel: PapelEmissaoImr;
  em: Date;
};
