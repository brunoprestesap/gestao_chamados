/**
 * Apuração do IMR do contrato (spec 0023). `apurarMes` é pura e é a única
 * função que calcula pontos: a prévia e o fechamento chamam a mesma (AC-15).
 */

import type { ChamadoStatus } from '@/shared/chamados/chamado.constants';
import {
  INICIO_PRAZO_GRAVADO,
  N_PRAZO_ESTIMADO,
  type PapelImr,
  pontosDaEscala,
  type TipoMarcacao,
} from '@/shared/imr-contrato/imr-contrato.constants';
import type {
  ApuracaoMes,
  IntervaloFechado,
  LinhaI3,
  LinhaI4,
  MarcacaoDaLinha,
  MarcacaoForaDaBase,
  MarcacoesDaLinha,
  ResultadoI3,
  ResultadoI4,
  SituacaoLinha,
} from '@/shared/imr-contrato/imr-contrato.types';
import type { SituacaoCotacao } from '@/shared/material/material.constants';

import {
  type CalendarioImr,
  diaEmBelem,
  limitesDoMesEmBelem,
  prazoDeResposta,
  prazoEmDiasUteis,
} from './prazo';

/** Um chamado do contrato como a leitura entrega. */
export type ChamadoLidoI3 = {
  id: string;
  ticketNumber: string;
  solicitanteNome: string;
  setor: string;
  titulo: string;
  createdAt: Date;
  responseStartedAt: Date | null;
  status: ChamadoStatus;
  /** Tem `originTemplateId`: preventiva, fora do indicador 3. */
  preventiva: boolean;
  /** Recusa (`rejectedAt`) ou cancelamento (último histórico, senão `updatedAt`). */
  encerradoEm: Date | null;
};

/** Uma cotação de material de chamado do contrato como a leitura entrega. */
export type CotacaoLidaI4 = {
  id: string;
  numero: string;
  chamadoTicketNumber: string;
  situacao: SituacaoCotacao;
  autorizadoEm: Date | null;
  fornecimentoAte: Date | null;
  executadoEm: Date | null;
  /** O `em` do último evento para `cancelada` ou `reprovada`, só se está hoje numa delas. */
  encerradoEm: Date | null;
};

/** Um evento de `ImrMarcacao` do contrato e mês, com o nome do autor e o número do alvo. */
export type MarcacaoLida = {
  id: string;
  indicador: 3 | 4;
  alvoId: string;
  /** Número do chamado ou da cotação, para a lista "fora da base". */
  alvoNumero: string;
  tipo: TipoMarcacao;
  motivo: string;
  porNome: string;
  papel: PapelImr;
  em: Date;
};

export type EntradaApuracao = {
  competencia: string;
  agora: Date;
  calendario: CalendarioImr;
  chamados: ChamadoLidoI3[];
  cotacoes: CotacaoLidaI4[];
  marcacoes?: MarcacaoLida[];
  intervalosFechados?: IntervaloFechado[];
  /** N atual de `MaterialConfig`, para o prazo estimado da cotação nova sem prazo; padrão 5. */
  prazoFornecimentoDiasUteis?: number;
};

type Familia = 'desconsiderar' | 'nao_atendimento';

/** Estado vigente: para cada indicador, alvo e família, a marcação ativa (ou nada). */
type Vigentes = Map<string, { desconsiderar?: MarcacaoLida; nao_atendimento?: MarcacaoLida }>;

const chave = (indicador: 3 | 4, alvoId: string) => `${indicador}:${alvoId}`;

/**
 * O último evento de cada família por alvo, por `em` e `_id`, sem os eventos
 * gravados com o mês fechado (corrida rara, AC-9): esses são ignorados sempre.
 */
export function marcacoesVigentes(
  marcacoes: readonly MarcacaoLida[],
  intervalos: readonly IntervaloFechado[] = [],
): Vigentes {
  const fechado = (em: Date) => intervalos.some((i) => em >= i.de && (!i.ate || em < i.ate));
  const ordenadas = marcacoes
    .filter((m) => !fechado(m.em))
    .sort((a, b) => a.em.getTime() - b.em.getTime() || a.id.localeCompare(b.id));
  const vigentes: Vigentes = new Map();
  for (const m of ordenadas) {
    const k = chave(m.indicador, m.alvoId);
    const atual = vigentes.get(k) ?? {};
    const familia: Familia =
      m.tipo === 'desconsiderar' || m.tipo === 'desfazer_desconsiderar'
        ? 'desconsiderar'
        : 'nao_atendimento';
    atual[familia] = m.tipo === familia ? m : undefined;
    vigentes.set(k, atual);
  }
  return vigentes;
}

const daLinha = (m: MarcacaoLida | undefined): MarcacaoDaLinha =>
  m ? { motivo: m.motivo, porNome: m.porNome, papel: m.papel, em: m.em } : null;

/** As marcações de um alvo da base e a situação que elas decidem. */
function aplicarMarcacoes(
  vigentes: Vigentes,
  indicador: 3 | 4,
  alvoId: string,
  atraso: boolean,
): MarcacoesDaLinha & { situacao: SituacaoLinha } {
  const v = vigentes.get(chave(indicador, alvoId));
  const naoAtendimento = daLinha(v?.nao_atendimento);
  // Desconsiderar só vale sobre um atraso.
  const desconsideracao = atraso ? daLinha(v?.desconsiderar) : null;
  const situacao: SituacaoLinha = naoAtendimento
    ? 'nao_atendimento'
    : desconsideracao
      ? 'desconsiderada'
      : 'atraso';
  return {
    situacao,
    marcacao: naoAtendimento ?? desconsideracao,
    desconsideracao,
    naoAtendimento,
  };
}

/** Pontos e contagens das linhas da base (AC-4, AC-7, AC-8). */
function pontuar(base: readonly ({ atraso: boolean } & MarcacoesDaLinha)[]) {
  let ocorrencias = 0;
  let desconsideradas = 0;
  let zeradoPorMarcacao = false;
  for (const l of base) {
    if (l.naoAtendimento) zeradoPorMarcacao = true;
    if (!l.atraso) continue;
    if (l.desconsideracao) desconsideradas += 1;
    else ocorrencias += 1;
  }
  return {
    pontos: zeradoPorMarcacao ? 0 : pontosDaEscala(ocorrencias),
    ocorrencias,
    desconsideradas,
    zeradoPorMarcacao,
  };
}

const COTACAO_ENCERRADA: readonly SituacaoCotacao[] = ['cancelada', 'reprovada'];

const SEM_INICIO_CONTA: readonly ChamadoStatus[] = ['aberto', 'validado'];
const ENCERRADO_SEM_ATENDER: readonly ChamadoStatus[] = ['cancelado', 'recusado'];

type ApuradoI3 = ResultadoI3 & { diasUsados: string[]; baseI3: Map<string, LinhaI3> };

function apurarI3(e: EntradaApuracao, vigentes: Vigentes): ApuradoI3 {
  const { inicio, fim } = limitesDoMesEmBelem(e.competencia);
  // Toda a base do mês, com e sem atraso: o não atendimento pode cair num chamado atendido no prazo.
  const baseI3 = new Map<string, LinhaI3>();
  const diasUsados: string[] = [];
  let noPrazo = 0;
  let aguardandoPrazo = 0;
  let semRegistroDeInicio = 0;

  for (const c of e.chamados) {
    if (c.preventiva) continue;
    const prazo = prazoDeResposta(c.createdAt, e.calendario);
    if (!prazo || prazo < inicio || prazo >= fim) continue;

    const entra = (iniciadoEm: Date | null, atraso: boolean) => {
      diasUsados.push(diaEmBelem(c.createdAt), diaEmBelem(prazo));
      baseI3.set(c.id, {
        chamadoId: c.id,
        ticketNumber: c.ticketNumber,
        solicitanteNome: c.solicitanteNome,
        setor: c.setor,
        solicitadoEm: c.createdAt,
        descricao: c.titulo,
        iniciadoEm,
        tempoAteInicioMin: iniciadoEm
          ? Math.max(0, Math.floor((iniciadoEm.getTime() - c.createdAt.getTime()) / 60_000))
          : null,
        prazo,
        atraso,
        ...aplicarMarcacoes(vigentes, 3, c.id, atraso),
      });
    };

    if (c.responseStartedAt) {
      // O prazo é sempre depois da abertura, então início antes dela nunca é atraso.
      const atraso = c.responseStartedAt > prazo;
      if (!atraso) noPrazo += 1;
      entra(c.responseStartedAt, atraso);
      continue;
    }

    if (ENCERRADO_SEM_ATENDER.includes(c.status)) {
      // Encerrado antes do prazo sai da base; depois do prazo vencido, conta.
      if (!c.encerradoEm || c.encerradoEm <= prazo) continue;
      entra(null, true);
      continue;
    }

    if (!SEM_INICIO_CONTA.includes(c.status)) {
      semRegistroDeInicio += 1;
      continue;
    }

    const atraso = prazo < e.agora;
    if (!atraso) aguardandoPrazo += 1;
    entra(null, atraso);
  }

  const base = [...baseI3.values()];
  const linhas = base
    .filter((l) => l.atraso || l.naoAtendimento)
    .sort(
      (a, b) =>
        a.prazo.getTime() - b.prazo.getTime() ||
        a.solicitadoEm.getTime() - b.solicitadoEm.getTime(),
    );
  return {
    ...pontuar(base),
    linhas,
    base: base.length,
    noPrazo,
    aguardandoPrazo,
    semRegistroDeInicio,
    diasUsados,
    baseI3,
  };
}

/**
 * O prazo de fornecimento da cotação (AC-6): o gravado; sem ele, o prazo é
 * estimado com N = 5 para a cotação autorizada antes da spec 0023, e com o N
 * atual do parâmetro para a autorizada depois (o cálculo falhou na autorização).
 */
export function prazoDeFornecimento(
  c: Pick<CotacaoLidaI4, 'fornecimentoAte' | 'autorizadoEm'>,
  cal: CalendarioImr,
  nAtual: number = N_PRAZO_ESTIMADO,
): { prazo: Date; estimado: boolean } | null {
  if (c.fornecimentoAte) return { prazo: c.fornecimentoAte, estimado: false };
  if (!c.autorizadoEm) return null;
  const n = c.autorizadoEm >= INICIO_PRAZO_GRAVADO ? nAtual : N_PRAZO_ESTIMADO;
  const prazo = prazoEmDiasUteis(c.autorizadoEm, n, cal);
  return prazo ? { prazo, estimado: true } : null;
}

type ApuradoI4 = ResultadoI4 & { diasUsados: string[]; baseI4: Map<string, LinhaI4> };

function apurarI4(e: EntradaApuracao, vigentes: Vigentes): ApuradoI4 {
  const { inicio, fim } = limitesDoMesEmBelem(e.competencia);
  const baseI4 = new Map<string, LinhaI4>();
  const diasUsados: string[] = [];
  let noPrazo = 0;
  let aguardandoPrazo = 0;
  let prazosEstimados = 0;

  for (const c of e.cotacoes) {
    const p = prazoDeFornecimento(c, e.calendario, e.prazoFornecimentoDiasUteis);
    if (!p || p.prazo < inicio || p.prazo >= fim) continue;
    const { prazo, estimado } = p;

    const entra = (atraso: boolean) => {
      if (estimado) prazosEstimados += 1;
      if (c.autorizadoEm) diasUsados.push(diaEmBelem(c.autorizadoEm));
      diasUsados.push(diaEmBelem(prazo));
      baseI4.set(c.id, {
        cotacaoId: c.id,
        numero: c.numero,
        chamadoTicketNumber: c.chamadoTicketNumber,
        autorizadoEm: c.autorizadoEm,
        prazo,
        prazoEstimado: estimado,
        executadoEm: c.executadoEm,
        atraso,
        ...aplicarMarcacoes(vigentes, 4, c.id, atraso),
      });
    };

    // A execução vence o encerramento: executada a tempo nunca é atraso, mesmo cancelada depois.
    if (c.executadoEm) {
      const atraso = c.executadoEm > prazo;
      if (!atraso) noPrazo += 1;
      entra(atraso);
      continue;
    }

    if (COTACAO_ENCERRADA.includes(c.situacao)) {
      // Encerrada antes do prazo, sem execução, sai da base; depois do prazo vencido, conta.
      if (!c.encerradoEm || c.encerradoEm <= prazo) continue;
      entra(true);
      continue;
    }

    const atraso = prazo < e.agora;
    if (!atraso) aguardandoPrazo += 1;
    entra(atraso);
  }

  const base = [...baseI4.values()];
  const linhas = base
    .filter((l) => l.atraso || l.naoAtendimento)
    .sort((a, b) => a.prazo.getTime() - b.prazo.getTime() || a.numero.localeCompare(b.numero));
  return {
    ...pontuar(base),
    linhas,
    base: base.length,
    noPrazo,
    aguardandoPrazo,
    prazosEstimados,
    diasUsados,
    baseI4,
  };
}

/** A apuração e a base completa do mês, que a ação de marcar usa para conferir o alvo. */
export type ApuracaoComBase = {
  apuracao: ApuracaoMes;
  baseI3: Map<string, LinhaI3>;
  baseI4: Map<string, LinhaI4>;
};

export function apurarComBase(e: EntradaApuracao): ApuracaoComBase {
  const vigentes = marcacoesVigentes(e.marcacoes ?? [], e.intervalosFechados ?? []);
  const { diasUsados: dias3, baseI3, ...i3 } = apurarI3(e, vigentes);
  const { diasUsados: dias4, baseI4, ...i4 } = apurarI4(e, vigentes);
  const ordenados = [...dias3, ...dias4].sort();
  const primeiro = ordenados[0];
  const ultimo = ordenados.at(-1);
  const feriadosUsados =
    primeiro && ultimo
      ? [...e.calendario.feriados].filter((d) => d >= primeiro && d <= ultimo).sort()
      : [];

  // Marcação vigente de alvo que saiu da base não conta e aparece à parte (AC-9).
  const marcacoesForaDaBase: MarcacaoForaDaBase[] = [];
  for (const v of vigentes.values()) {
    for (const m of [v.desconsiderar, v.nao_atendimento]) {
      if (!m) continue;
      const base = m.indicador === 3 ? baseI3 : baseI4;
      if (base.has(m.alvoId)) continue;
      marcacoesForaDaBase.push({
        indicador: m.indicador,
        alvoId: m.alvoId,
        alvoNumero: m.alvoNumero,
        tipo: m.tipo as MarcacaoForaDaBase['tipo'],
        motivo: m.motivo,
        porNome: m.porNome,
        papel: m.papel,
        em: m.em,
      });
    }
  }
  marcacoesForaDaBase.sort((a, b) => a.em.getTime() - b.em.getTime());

  return {
    apuracao: {
      competencia: e.competencia,
      apuradoEm: e.agora,
      feriadosUsados,
      i3,
      i4,
      marcacoesForaDaBase,
    },
    baseI3,
    baseI4,
  };
}

export function apurarMes(e: EntradaApuracao): ApuracaoMes {
  return apurarComBase(e).apuracao;
}
