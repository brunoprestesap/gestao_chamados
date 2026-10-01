import type { TipoServico } from '@/shared/chamados/tipo-servico';

/**
 * Um ativo no seletor do chamado (spec 0011, AC-14). `caminho` é o local do
 * ativo, que o formulário usa como sugestão de `localExato`; `tipoServico` e
 * `subtypeId` são sugestões calculadas no servidor (`lib/ativos/seletor.ts`).
 */
export type ItemSeletorAtivo = {
  id: string;
  codigo: string;
  descricao: string;
  caminho?: string;
  categoriaNome: string;
  tipoServico?: TipoServico;
  subtypeId?: string;
};

/** O ativo como aparece no DTO do chamado (lista, detalhe e sheet). */
export type ResumoAtivoChamado = { id: string; codigo: string; descricao: string };
