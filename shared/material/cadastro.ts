/**
 * O cadastro de material em seções (spec 0021, fatia 7): a seção vem do
 * endereço (`?secao=`, AC-18) e a escada de faixas (AC-20) cruza as faixas
 * ativas com os aprovadores vigentes. Puro, para o servidor e o navegador.
 */

export const SECOES_CADASTRO = [
  'empenhos',
  'designacoes',
  'faixas',
  'anexo-v',
  'sinapi',
  'parametros',
] as const;
export type SecaoCadastro = (typeof SECOES_CADASTRO)[number];

/** A seção do endereço; ausente ou desconhecida cai em `empenhos`. */
export function secaoDoCadastro(valor: string | string[] | undefined): SecaoCadastro {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return (SECOES_CADASTRO as readonly string[]).includes(v ?? '')
    ? (v as SecaoCadastro)
    : 'empenhos';
}

export type DegrauFaixa = {
  id: string;
  nome: string;
  limiteCentavos: number;
  /** Aprovadores com designação vigente nesta faixa. */
  aprovadores: number;
};

export type EscadaFaixas = {
  /** Só as faixas ativas, do menor limite para o maior. */
  degraus: DegrauFaixa[];
  /** O maior limite de faixa com aprovador vigente: acima dele ninguém aprova. `null` sem nenhum. */
  tetoCentavos: number | null;
};

/** A escada de limites (AC-20): faixas ativas por limite crescente, com os aprovadores vigentes de cada uma. */
export function escadaDeFaixas(
  faixas: readonly { id: string; nome: string; limiteCentavos: number; ativa: boolean }[],
  designacoes: readonly { papel: string; faixaId: string | null; vigente: boolean }[],
): EscadaFaixas {
  const porFaixa = new Map<string, number>();
  for (const d of designacoes) {
    if (d.papel !== 'aprovador' || !d.vigente || !d.faixaId) continue;
    porFaixa.set(d.faixaId, (porFaixa.get(d.faixaId) ?? 0) + 1);
  }
  const degraus = faixas
    .filter((f) => f.ativa)
    .map((f) => ({
      id: f.id,
      nome: f.nome,
      limiteCentavos: f.limiteCentavos,
      aprovadores: porFaixa.get(f.id) ?? 0,
    }))
    .sort((a, b) => a.limiteCentavos - b.limiteCentavos);
  const comAprovador = degraus.filter((d) => d.aprovadores > 0);
  return {
    degraus,
    tetoCentavos: comAprovador.length
      ? Math.max(...comAprovador.map((d) => d.limiteCentavos))
      : null,
  };
}

// O formatador é criado uma vez, com opções fixas, para o servidor e o
// navegador darem o mesmo texto (spec 0022, AC-6).
const FORMATO_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Belem',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** A data e a hora de um ato do cadastro (ISO), no fuso de Belém. */
export function dataHoraDoCadastro(iso: string): string {
  return FORMATO_DATA_HORA.format(new Date(iso));
}

export type MovimentoDoEmpenho = {
  tipo: string;
  valorCentavos: number;
  ato: string;
  em: string;
  porNome: string;
};

export type SituacaoDoEmpenho = { ativo: boolean; motivo: string; porNome: string; em: string };

/** Um item da linha do tempo do empenho; `antigo` é a inativação de antes do motivo (AC-7). */
export type ItemLinhaDoTempo =
  | ({ tipo: 'movimento'; tipoMovimento: string } & Omit<MovimentoDoEmpenho, 'tipo'>)
  | ({ tipo: 'situacao' } & SituacaoDoEmpenho)
  | { tipo: 'antigo' };

/**
 * A linha do tempo única do empenho (spec 0022, AC-6): movimentos e mudanças
 * de situação, do mais novo ao mais antigo. Recebe as situações na ordem em
 * que foram gravadas. O item `antigo` entra no fim quando o empenho está
 * inativo sem histórico, ou quando a primeira mudança gravada é uma
 * reativação: nos dois casos houve uma inativação antes do registro (AC-7).
 */
export function linhaDoTempoDoEmpenho(e: {
  ativo: boolean;
  movimentos: readonly MovimentoDoEmpenho[];
  situacoes: readonly SituacaoDoEmpenho[];
}): ItemLinhaDoTempo[] {
  const datados: Extract<ItemLinhaDoTempo, { em: string }>[] = [
    ...e.movimentos.map(({ tipo, ...m }) => ({
      tipo: 'movimento' as const,
      tipoMovimento: tipo,
      ...m,
    })),
    ...e.situacoes.map((s) => ({ tipo: 'situacao' as const, ...s })),
  ];
  datados.sort((a, b) => Date.parse(b.em) - Date.parse(a.em));
  const primeira = e.situacoes[0];
  const inativadoAntes = primeira ? primeira.ativo : !e.ativo;
  return inativadoAntes ? [...datados, { tipo: 'antigo' }] : datados;
}
