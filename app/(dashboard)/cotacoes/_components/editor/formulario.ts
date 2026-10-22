import type { CotacaoDTO, ReferenciaDTO } from '@/lib/material/serializar';
import { formatarQuantidade } from '@/shared/chamados/custo';
import { formatarCnpj } from '@/shared/contratos/cnpj';
import { impedimentosDeEnvio } from '@/shared/material/controles';
import { type ReferenciaEntrada, SalvarRascunhoSchema } from '@/shared/material/cotacao.schemas';
import {
  MIN_ORCAMENTOS_POR_ITEM,
  MIN_ORCAMENTOS_URGENCIA,
} from '@/shared/material/material.constants';
import { type CodigoControle, TEXTO_EDITOR } from '@/shared/material/mensagens';
import { raizesDoItem, reaisParaCentavos, valorDaLinhaCentavos } from '@/shared/material/valores';

import { centavosParaCampo, numeroBr } from '../apoio';

/**
 * O estado do editor da contratada (spec 0021, fatia 5) e o adaptador que o
 * transforma na entrada do `salvarRascunhoAction`. A lista "Pronta para
 * enviar?" passa pelo mesmo adaptador e pelo mesmo schema antes de rodar
 * `impedimentosDeEnvio`, para dar no navegador o resultado do envio (AC-15).
 */

/** Uma referência da contratada: a entrada que vai ao servidor e, se já gravada, como ficou. */
export type RefLocal = { entrada: ReferenciaEntrada; gravada: ReferenciaDTO | null };

export type ItemDoFormulario = {
  id: string;
  descricao: string;
  unidade: string;
  quantidade: string;
  motivo: string;
  doDiagnostico: boolean;
  /** De onde vem o preço; `null` (ainda sem escolha) ou `orcamento` é o caminho 3. */
  origem: string | null;
  anexoVNumero: number | null;
  sinapiCodigo: string | null;
  sinapiReferencia: string | null;
  precoTabelaCentavos: number | null;
  valorProvisorio: boolean;
  /** As referências da contratada (editáveis) e as do fiscal (só leitura). */
  referencias: RefLocal[];
  referenciasFiscal: ReferenciaDTO[];
};

export type OrcamentoDoFormulario = {
  id: string;
  fornecedor: string;
  cnpj: string;
  data: string;
  validade: string;
  arquivoId: string;
  arquivoNome: string;
  precos: Record<string, string>;
};

export type EstadoDoFormulario = {
  itens: ItemDoFormulario[];
  orcamentos: OrcamentoDoFormulario[];
};

export const daTabela = (i: Pick<ItemDoFormulario, 'origem'>) =>
  !!i.origem && i.origem !== 'orcamento';

function entradaDaGravada(r: ReferenciaDTO): ReferenciaEntrada {
  return r.tipo === 'sinapi' && r.sinapiCodigo
    ? { id: r.id, sinapiCodigo: r.sinapiCodigo }
    : { id: r.id, fonte: r.fonte, valorUnitarioCentavos: r.valorUnitarioCentavos, data: r.data };
}

export function estadoDoDto(c: CotacaoDTO): EstadoDoFormulario {
  const nomeArquivo = new Map((c.arquivos ?? []).map((a) => [a.id, a.nomeOriginal]));
  return {
    itens: (c.itens ?? []).map((i) => ({
      id: i.id,
      descricao: i.descricao,
      unidade: i.unidade,
      quantidade: formatarQuantidade(i.quantidade),
      motivo: i.motivo,
      doDiagnostico: i.doDiagnostico,
      origem: i.origem ?? null,
      anexoVNumero: i.anexoVNumero ?? null,
      sinapiCodigo: i.sinapiCodigo ?? null,
      sinapiReferencia: i.sinapiReferencia ?? null,
      precoTabelaCentavos: daTabela({ origem: i.origem ?? null }) ? i.precoAplicadoCentavos : null,
      valorProvisorio: !!i.valorProvisorio,
      referencias: (i.referencias ?? [])
        .filter((r) => r.papel === 'responsavel_tecnico')
        .map((r) => ({ entrada: entradaDaGravada(r), gravada: r })),
      referenciasFiscal: (i.referencias ?? []).filter((r) => r.papel === 'fiscal'),
    })),
    orcamentos: (c.orcamentos ?? []).map((o) => ({
      id: o.id,
      fornecedor: o.fornecedor,
      cnpj: formatarCnpj(o.cnpj),
      data: o.data,
      validade: o.validade ?? '',
      arquivoId: o.arquivoId,
      arquivoNome: nomeArquivo.get(o.arquivoId) ?? 'arquivo anexado',
      precos: Object.fromEntries(
        o.precos.map((p) => [p.itemId, centavosParaCampo(p.valorUnitarioCentavos)]),
      ),
    })),
  };
}

export function itemNovo(id: string): ItemDoFormulario {
  return {
    id,
    descricao: '',
    unidade: 'un',
    quantidade: '',
    motivo: '',
    doDiagnostico: false,
    origem: null,
    anexoVNumero: null,
    sinapiCodigo: null,
    sinapiReferencia: null,
    precoTabelaCentavos: null,
    valorProvisorio: false,
    referencias: [],
    referenciasFiscal: [],
  };
}

export function orcamentoNovo(id: string): OrcamentoDoFormulario {
  return {
    id,
    fornecedor: '',
    cnpj: '',
    data: '',
    validade: '',
    arquivoId: '',
    arquivoNome: '',
    precos: {},
  };
}

/** O que o editor recusa antes de ir ao servidor: orçamento sem arquivo. */
export function erroAntesDeSalvar(e: EstadoDoFormulario): string | null {
  return e.orcamentos.some((o) => !o.arquivoId) ? TEXTO_EDITOR.arquivoAntesDeSalvar : null;
}

/** O adaptador do formulário: a entrada de `salvarRascunhoAction`, antes do schema. */
export function montarEntrada(e: EstadoDoFormulario, cotacaoId: string, versao: number) {
  // Só os itens do caminho 3 recebem preço de orçamento.
  const ids = new Set(e.itens.filter((i) => !daTabela(i)).map((i) => i.id));
  return {
    id: cotacaoId,
    versao,
    itens: e.itens.map((i) => ({
      id: i.id,
      descricao: i.descricao,
      unidade: i.unidade,
      quantidade: numeroBr(i.quantidade),
      motivo: i.motivo,
      // Só o caminho 3 tem referência; a lista troca só as da contratada (AC-32).
      ...(daTabela(i) ? {} : { referencias: i.referencias.map((r) => r.entrada) }),
    })),
    orcamentos: e.orcamentos.map((o) => ({
      id: o.id,
      fornecedor: o.fornecedor,
      cnpj: o.cnpj,
      data: o.data,
      validade: o.validade || null,
      arquivoId: o.arquivoId,
      precos: Object.entries(o.precos)
        .filter(([itemId, v]) => ids.has(itemId) && v.trim() !== '')
        .map(([itemId, v]) => ({ itemId, valorUnitarioCentavos: reaisParaCentavos(v) ?? -1 })),
    })),
  };
}

export type ResultadoPronta =
  | { ok: false; erro: string }
  | { ok: true; impedimentos: CodigoControle[] };

/**
 * Os impedimentos do envio para o formulário em edição (AC-15): o mesmo
 * adaptador e o mesmo schema do salvar, depois `impedimentosDeEnvio` sobre o
 * que o servidor gravaria. O que só o servidor sabe (as tabelas do mês, o
 * preço da referência SINAPI nova) fica para o envio.
 */
export function prontaParaEnviar(
  e: EstadoDoFormulario,
  ctx: { cotacaoId: string; raizContratada: string; urgencia: boolean },
): ResultadoPronta {
  const antes = erroAntesDeSalvar(e);
  if (antes) return { ok: false, erro: antes };
  const p = SalvarRascunhoSchema.safeParse(montarEntrada(e, ctx.cotacaoId, 1));
  if (!p.success) return { ok: false, erro: p.error.issues[0]?.message ?? 'Dados inválidos.' };
  const doForm = new Map(e.itens.map((i) => [i.id, i]));
  const itens = p.data.itens.map((i) => {
    const f = doForm.get(i.id)!;
    // O servidor guarda as referências da contratada e as do fiscal ativas no item.
    const daContratada = (i.referencias ?? []).map((r) => ({
      valorUnitarioCentavos:
        'valorUnitarioCentavos' in r
          ? r.valorUnitarioCentavos
          : (f.referencias.find((x) => x.entrada.id === r.id)?.gravada?.valorUnitarioCentavos ?? 1),
      retiradaEm: null,
    }));
    const doFiscal = f.referenciasFiscal.map((r) => ({
      valorUnitarioCentavos: r.valorUnitarioCentavos,
      retiradaEm: r.retirada ? r.data : null,
    }));
    return { _id: i.id, origem: f.origem, referencias: [...daContratada, ...doFiscal] };
  });
  const orcamentos = (p.data.orcamentos ?? []).map((o) => ({
    _id: o.id,
    cnpj: o.cnpj,
    validade: o.validade ? new Date(`${o.validade}T12:00:00.000Z`) : null,
    fase: 'envio',
    precos: o.precos,
  }));
  return {
    ok: true,
    impedimentos: impedimentosDeEnvio({
      itens,
      orcamentos,
      raizContratada: ctx.raizContratada,
      urgencia: ctx.urgencia,
    }),
  };
}

/** Uma linha da lista "Pronta para enviar?": passa, ou os códigos que a barram. */
export type LinhaPronta = { chave: string; rotulo: string; codigos: CodigoControle[] };

/**
 * As linhas da lista, cada uma juntando os códigos de `impedimentosDeEnvio`
 * que confere. Só aparecem as que valem para esta cotação: CNPJ e validade
 * com algum orçamento, as de orçamento por item com algum item do caminho 3.
 */
export function linhasDaLista(
  e: EstadoDoFormulario,
  r: ResultadoPronta,
  urgencia: boolean,
): LinhaPronta[] {
  const imp = new Set(r.ok ? r.impedimentos : []);
  const com = (codigos: CodigoControle[]) => codigos.filter((c) => imp.has(c));
  const caminho3 = e.itens.some((i) => !daTabela(i));
  const linhas: LinhaPronta[] = [];
  if (!r.ok) linhas.push({ chave: 'formulario', rotulo: r.erro, codigos: [] });
  else linhas.push({ chave: 'formulario', rotulo: TEXTO_EDITOR.prontaFormulario, codigos: [] });
  if (e.orcamentos.length > 0) {
    linhas.push(
      {
        chave: 'cnpj',
        rotulo: TEXTO_EDITOR.prontaCnpj,
        codigos: com(['cnpj_invalido', 'cnpj_contratada']),
      },
      {
        chave: 'validade',
        rotulo: TEXTO_EDITOR.prontaValidade,
        codigos: com(['validade_ausente']),
      },
    );
  }
  if (caminho3) {
    linhas.push({
      chave: 'orcamentos',
      rotulo: TEXTO_EDITOR.prontaOrcamentos(
        urgencia ? MIN_ORCAMENTOS_URGENCIA : MIN_ORCAMENTOS_POR_ITEM,
      ),
      codigos: com(['orcamentos_insuficientes']),
    });
    if (!urgencia) {
      linhas.push({
        chave: 'raizes',
        rotulo: TEXTO_EDITOR.prontaRaizes,
        codigos: com(['cnpj_mesma_raiz']),
      });
    }
    linhas.push({
      chave: 'referencia',
      rotulo: TEXTO_EDITOR.prontaReferencia,
      codigos: com(['sem_referencia']),
    });
  } else {
    linhas.push({ chave: 'tabela', rotulo: TEXTO_EDITOR.prontaSoTabela, codigos: [] });
  }
  return linhas;
}

/** Linha que passa: sem código e, na do formulário, sem erro. */
export const linhaPassa = (l: LinhaPronta, r: ResultadoPronta) =>
  l.codigos.length === 0 && (l.chave !== 'formulario' || r.ok);

/** Os preços em centavos que os orçamentos deram ao item, sem os vazios ou inválidos. */
export function precosDoItem(orcamentos: readonly OrcamentoDoFormulario[], itemId: string) {
  return orcamentos
    .map((o) => ({ id: o.id, centavos: reaisParaCentavos(o.precos[itemId] ?? '') }))
    .filter((p): p is { id: string; centavos: number } => p.centavos != null);
}

export function menorPrecoDoItem(
  orcamentos: readonly OrcamentoDoFormulario[],
  itemId: string,
): number | null {
  const v = precosDoItem(orcamentos, itemId).map((p) => p.centavos);
  return v.length ? Math.min(...v) : null;
}

/** Empresas diferentes que cotaram o item: a mesma raiz de CNPJ conta uma vez (AC-31). */
export function empresasDoItem(orcamentos: readonly OrcamentoDoFormulario[], itemId: string) {
  const cotaram = new Set(precosDoItem(orcamentos, itemId).map((p) => p.id));
  return raizesDoItem(
    itemId,
    orcamentos
      .filter((o) => cotaram.has(o.id))
      .map((o) => ({ cnpj: o.cnpj, precos: [{ itemId }] })),
  );
}

/** O preço unitário do item: o da tabela, ou o menor dos orçamentos no caminho 3. */
export function precoDoItem(e: EstadoDoFormulario, i: ItemDoFormulario): number | null {
  return daTabela(i) ? i.precoTabelaCentavos : menorPrecoDoItem(e.orcamentos, i.id);
}

/**
 * O total pelo menor preço de cada item (AC-15), em centavos: soma das linhas
 * de `valorDaLinhaCentavos`. Item sem preço ou com quantidade inválida fica de
 * fora e entra na contagem `semPreco`.
 */
export function totalPeloMenorPreco(e: EstadoDoFormulario): {
  totalCentavos: number;
  semPreco: number;
} {
  let totalCentavos = 0;
  let semPreco = 0;
  for (const i of e.itens) {
    const preco = precoDoItem(e, i);
    const qtd = numeroBr(i.quantidade);
    if (preco == null || !Number.isFinite(qtd)) semPreco++;
    else totalCentavos += valorDaLinhaCentavos(qtd, preco);
  }
  return { totalCentavos, semPreco };
}
