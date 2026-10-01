/**
 * Prazo para avaliar ou recusar o serviço (spec 0010).
 *
 * O prazo nasce na conclusão e fica gravado no chamado. Enquanto a janela está
 * aberta, o solicitante avalia ou recusa e a gestão reabre; vencido, o cron
 * encerra. Funções puras: o "agora" vem sempre de quem chama (o servidor).
 */

export const PRAZO_AVALIACAO_HORAS_PADRAO = 48;
export const PRAZO_AVALIACAO_HORAS_MIN = 1;
export const PRAZO_AVALIACAO_HORAS_MAX = 720;

const UMA_HORA_MS = 60 * 60 * 1000;

export const MSG_CHAMADO_JA_ENCERRADO = 'Este chamado já foi encerrado.';
export const MSG_ENCERRADO_DEFINITIVO = 'Chamado encerrado definitivamente. Abra um novo chamado.';
export const MSG_PRAZO_AVALIACAO_VENCIDO = 'O prazo para avaliar este chamado terminou.';

/** Valor lido do banco que saiu da faixa (ou não existe) volta ao padrão. */
export function normalizarPrazoAvaliacaoHoras(valor: unknown): number {
  return typeof valor === 'number' &&
    Number.isInteger(valor) &&
    valor >= PRAZO_AVALIACAO_HORAS_MIN &&
    valor <= PRAZO_AVALIACAO_HORAS_MAX
    ? valor
    : PRAZO_AVALIACAO_HORAS_PADRAO;
}

/** `concludedAt + horas`, em horas corridas. */
export function calcularPrazoAvaliacao(concludedAt: Date, horas: number): Date {
  return new Date(concludedAt.getTime() + normalizarPrazoAvaliacaoHoras(horas) * UMA_HORA_MS);
}

type DataLike = Date | string | null | undefined;

function paraData(valor: DataLike): Date | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Janela aberta: `concluído` e prazo no futuro, ou sem prazo (concluído antes
 * do deploy, até o cron preencher). AC-5.
 */
export function janelaAberta(
  status: string | null | undefined,
  prazo: DataLike,
  agora: Date,
): boolean {
  if (status !== 'concluído') return false;
  const d = paraData(prazo);
  return d === null || d.getTime() > agora.getTime();
}

/**
 * Filtro Mongo da janela aberta, para ir dentro do `findOneAndUpdate`: a
 * guarda vale no momento da escrita, nunca num `if` antes dela.
 */
export function filtroJanelaAberta(agora: Date) {
  return {
    status: 'concluído' as const,
    $or: [{ prazoAvaliacaoAte: { $gt: agora } }, { prazoAvaliacaoAte: null }],
  };
}

/**
 * Qual erro devolver quando a escrita atômica não achou o chamado na janela,
 * na precedência da AC-5: encerrado, depois prazo vencido. `null` deixa quem
 * chama devolver os erros de dono e de status que já existiam.
 */
export function erroForaDaJanela(
  status: string | null | undefined,
  prazo: DataLike,
  agora: Date,
  mensagemEncerrado: string = MSG_CHAMADO_JA_ENCERRADO,
): string | null {
  if (status === 'encerrado') return mensagemEncerrado;
  if (status === 'concluído' && !janelaAberta(status, prazo, agora)) {
    return MSG_PRAZO_AVALIACAO_VENCIDO;
  }
  return null;
}

export type CamposJanelaDTO = {
  prazoAvaliacaoAte: string | null;
  /** Calculada com o `now` do servidor (AC-10): a tela só lê, nunca recalcula. */
  janelaAvaliacaoAberta: boolean;
  chamadoAnteriorId: string | null;
};

/** Os campos da spec 0010 que toda rota de leitura do chamado devolve. */
export function camposJanelaDTO(
  c: { status?: unknown; prazoAvaliacaoAte?: unknown; chamadoAnteriorId?: unknown },
  agora: Date,
): CamposJanelaDTO {
  const prazo =
    c.prazoAvaliacaoAte instanceof Date || typeof c.prazoAvaliacaoAte === 'string'
      ? paraData(c.prazoAvaliacaoAte)
      : null;
  return {
    prazoAvaliacaoAte: prazo ? prazo.toISOString() : null,
    janelaAvaliacaoAberta: janelaAberta(
      typeof c.status === 'string' ? c.status : null,
      prazo,
      agora,
    ),
    chamadoAnteriorId: c.chamadoAnteriorId ? String(c.chamadoAnteriorId) : null,
  };
}

/** `DD/MM às HH:mm` no fuso informado (o do `BusinessCalendar`). */
export function formatarPrazoAvaliacao(prazo: DataLike, timezone = 'America/Belem'): string {
  const d = paraData(prazo);
  if (!d) return '';
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${v('day')}/${v('month')} às ${v('hour')}:${v('minute')}`;
}

/** A frase do prazo, igual em tela, `Notification` e e-mail. */
export function frasePrazoAvaliacao(prazo: DataLike, timezone?: string): string {
  const quando = formatarPrazoAvaliacao(prazo, timezone);
  return quando ? `Avalie ou recuse o serviço até ${quando}` : '';
}
