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
