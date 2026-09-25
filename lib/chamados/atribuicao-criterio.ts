import { DECISAO_MOTIVO_MAX } from '@/shared/conversas/conversa.schemas';

/**
 * O critério da atribuição automática (spec 0008, AC-2), puro: recebe os
 * candidatos já lidos do banco e devolve a ordem de tentativa e o motivo da
 * decisão. Nada aqui acessa banco, relógio nem rede.
 */

export type CandidatoAtribuicao = {
  id: string;
  nome: string;
  /** Chamados dele em `CHAMADO_STATUS_CARGA_TECNICO`. */
  carga: number;
  /** `maxAssignedTickets ?? 5`. */
  limite: number;
  /**
   * A maior data entre `assignedAt` e `reassignedAt` dos chamados que ele tem
   * hoje, em qualquer status. `null` quando nunca recebeu chamado.
   */
  ultimaAtribuicao: Date | null;
};

/** Na seleção vale carga menor que o limite; limite 0 nunca recebe. */
export function elegiveis(candidatos: CandidatoAtribuicao[]): CandidatoAtribuicao[] {
  return candidatos.filter((c) => c.carga < c.limite);
}

/** Duas últimas atribuições iguais: as duas nulas, ou o mesmo instante. */
function mesmaData(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

/** `null` vem primeiro: quem nunca recebeu é o que está há mais tempo sem receber. */
function compararUltima(a: Date | null, b: Date | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a.getTime() - b.getTime();
}

/**
 * Menor carga primeiro. No empate, quem está há mais tempo sem receber chamado
 * (menor `ultimaAtribuicao`, nulo antes de tudo), e o id desempata por último.
 * Não altera o array recebido.
 */
export function ordenarCandidatos(candidatos: CandidatoAtribuicao[]): CandidatoAtribuicao[] {
  return [...candidatos].sort((a, b) => {
    if (a.carga !== b.carga) return a.carga - b.carga;
    const porUltima = compararUltima(a.ultimaAtribuicao, b.ultimaAtribuicao);
    if (porUltima !== 0) return porUltima;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * A frase que acompanha a `DecisaoIa` de técnico: o critério e a carga de quem
 * foi escolhido, para o Preposto entender a escolha. Só Preposto e Admin a
 * leem. Sempre cabe em `DECISAO_MOTIVO_MAX`.
 */
export function montarMotivoTecnico(
  escolhido: CandidatoAtribuicao,
  todosElegiveis: CandidatoAtribuicao[],
): string {
  const total = todosElegiveis.length;
  const empatados = todosElegiveis.filter((c) => c.carga === escolhido.carga);
  const carga = `${escolhido.carga} de ${escolhido.limite} chamados ativos`;

  let texto: string;
  if (total <= 1) {
    texto = `Único técnico elegível com a especialidade: ${carga}.`;
  } else if (empatados.length > 1) {
    // O que decidiu o empate: a data, se algum empatado tem uma última atribuição
    // diferente da do escolhido (inclusive nunca ter recebido); senão, o cadastro.
    const dataDecidiu = empatados.some(
      (c) => !mesmaData(c.ultimaAtribuicao, escolhido.ultimaAtribuicao),
    );
    const decisao = dataDecidiu
      ? 'decidido por quem está há mais tempo sem receber chamado'
      : 'sem diferença na última atribuição, decidido pela ordem do cadastro';
    texto = `Menor carga entre ${total} técnicos elegíveis (${carga}); empate com ${empatados.length - 1} ${decisao}.`;
  } else {
    texto = `Menor carga entre ${total} técnicos elegíveis: ${carga}.`;
  }
  return texto.slice(0, DECISAO_MOTIVO_MAX);
}
