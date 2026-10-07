import type { TipoServico } from '@/shared/chamados/tipo-servico';

/**
 * Saída do relatório por contrato (spec 0016): serializável, sem `Date`, para
 * a tela (Server Component) e o PDF lerem o mesmo objeto. Tempos em
 * milissegundos; `null` onde não há o que medir (vira "—", nunca zero).
 */

export type ContagemSla = {
  dentro: number;
  fora: number;
  emAndamento: number;
  semSla: number;
};

export type TopoRelatorioContrato = {
  /** Corretivos do contrato na janela, com e sem ativo. */
  corretivosTotal: number;
  corretivosSemAtivo: number;
  /** Os seis números da spec 0014, de `calcularFiltro` (AC-10). */
  corretivosComAtivo: number;
  percentualComAtivo: number | null;
  ativosAfetados: number;
  mtbfMedioMs: number | null;
  mttrMedioMs: number | null;
  ativosReincidentes: number;
  preventivasGeradas: number;
  preventivasConcluidas: number;
  /** SLA só dos corretivos com ativo (AC-13). */
  sla: ContagemSla & { percentualDentro: number | null };
};

export type LinhaAtivoRelatorio = {
  ativoId: string;
  codigo: string;
  descricao: string;
  categoriaId: string | null;
  categoria: string | null;
  caminho: string | null;
  corretivos: number;
  mtbfMs: number | null;
  mttrMs: number | null;
  corretivos90d: number;
  reincidente: boolean;
  sla: ContagemSla;
  preventivasGeradas: number;
  preventivasConcluidas: number;
};

export type LinhaCategoriaRelatorio = {
  /** `null` na linha "Sem categoria". */
  categoriaId: string | null;
  nome: string;
  ativosNoEscopo: number;
  ativosComChamado: number;
  corretivos: number;
  mttrMedioMs: number | null;
  reincidentes: number;
  slaDentro: number;
  slaFora: number;
  preventivasGeradas: number;
  preventivasConcluidas: number;
};

export type ContratoDoRelatorio = {
  id: string;
  numero: string;
  empresa: string;
  cnpjFormatado: string;
  processoSei: string;
  objeto: string | null;
  fiscal: string | null;
  tiposServico: TipoServico[];
  vigenciaInicio: string;
  vigenciaFim: string;
  isActive: boolean;
};

export type RelatorioContrato = {
  contrato: ContratoDoRelatorio;
  janela: {
    inicio: string;
    fim: string;
    mes: string;
    /** O mês escolhido é o mês atual em Belém (AC-6). */
    parcial: boolean;
  };
  /** ISO do instante do cálculo (`agora`). */
  geradoEm: string;
  geradoPorNome: string;
  topo: TopoRelatorioContrato;
  categorias: LinhaCategoriaRelatorio[];
  ativos: LinhaAtivoRelatorio[];
};

export type EmissaoRelatorioContrato = {
  id: string;
  geradoEm: string;
  geradoPorNome: string;
  hashSha256: string;
};
