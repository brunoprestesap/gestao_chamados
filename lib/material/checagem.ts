import 'server-only';

import { Types } from 'mongoose';

import { lerCalendarioDiasUteis } from '@/lib/dias-uteis/calendario';
import { LIMITE_DIAS_CORRIDOS, prazoEmDiasUteis } from '@/lib/dias-uteis/prazo';
import {
  disponivelDe,
  itensNaoChecados,
  mesmaUnidade,
  palavrasDaBusca,
  precoMedioCentavos,
  restanteDoItem,
} from '@/shared/material/checagem';
import type { DecisaoChecagemInput } from '@/shared/material/cotacao.schemas';
import type {
  OrigemChecagem,
  PapelEvento,
  ResultadoChecagem,
} from '@/shared/material/material.constants';
import { ERROS_CHECAGEM } from '@/shared/material/mensagens';
import {
  type ItemParaTotal,
  valorDaLinhaCentavos,
  valorTotalCentavos,
} from '@/shared/material/valores';

import { buscarCandidatos, type MaterialSicam, relerMateriais } from './sicam';

/**
 * A etapa de checagem do almoxarifado (spec 0024): a busca que decide se a
 * cotação passa por uma pessoa e a conta da decisão de cada item. A gravação
 * fica em `criarCotacao` e `transicionar`; nada aqui escreve no banco.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export type EntradaChecagem = {
  itemId: Types.ObjectId;
  descricao: string;
  unidade: string;
  quantidadePedida: number;
  resultado: ResultadoChecagem;
  automatico: boolean;
  palavrasBuscadas: string[];
  origem: OrigemChecagem;
  consultadoEm: Date;
  coMat: string | null;
  materialDescricao: string | null;
  materialUnidade: string | null;
  saldoVisto: number | null;
  reservadoVisto: number | null;
  quantidadeAtendida: number | null;
  quantidadeSaida: number | null;
  quantidadeLiberada: number;
  precoUnitarioCentavos: number | null;
  valorCentavos: number | null;
  precoOrigem: OrigemChecagem | null;
  motivo: string | null;
  porUserId: Types.ObjectId | null;
  porNome: string | null;
  papel: PapelEvento;
  em: Date;
};

export type ChecagemDoc = {
  prazoAte: Date | null;
  voltarPara: 'rascunho' | 'devolvida' | null;
  abriuPausa: boolean;
  itens: EntradaChecagem[];
};

type ItemDaBusca = { _id: Types.ObjectId; descricao: string; unidade: string; quantidade: number };

/**
 * O fim do expediente do N-ésimo dia útil depois da entrada (AC-16). Uma falha
 * no cálculo devolve `null`, e essa cotação não gera aviso de atraso.
 */
export async function prazoDaChecagem(agora: Date, n: number): Promise<Date | null> {
  try {
    const cal = await lerCalendarioDiasUteis(
      agora,
      new Date(agora.getTime() + LIMITE_DIAS_CORRIDOS * DIA_MS),
    );
    return prazoEmDiasUteis(agora, n, cal);
  } catch (e) {
    console.error('[material] prazo da checagem: falha ao ler o calendário', e);
    return null;
  }
}

function montarEntrada(
  item: ItemDaBusca,
  campos: Partial<EntradaChecagem> &
    Pick<
      EntradaChecagem,
      'resultado' | 'origem' | 'consultadoEm' | 'quantidadeLiberada' | 'papel' | 'em'
    >,
): EntradaChecagem {
  return {
    itemId: item._id,
    descricao: item.descricao,
    unidade: item.unidade,
    quantidadePedida: item.quantidade,
    automatico: false,
    palavrasBuscadas: palavrasDaBusca(item.descricao),
    coMat: null,
    materialDescricao: null,
    materialUnidade: null,
    saldoVisto: null,
    reservadoVisto: null,
    quantidadeAtendida: null,
    quantidadeSaida: null,
    precoUnitarioCentavos: null,
    valorCentavos: null,
    precoOrigem: null,
    motivo: null,
    porUserId: null,
    porNome: null,
    ...campos,
  };
}

export type ResultadoDaBusca = {
  /** Algum item tem candidato, ou o SICAM não respondeu (AC-4). */
  precisaDePessoa: boolean;
  sicamRespondeu: boolean;
  /** Os `sem_candidato` que já ficam resolvidos. Sem o SICAM, nenhum item é liberado sozinho. */
  automaticas: EntradaChecagem[];
};

/** Roda a busca dos itens numa só chamada, antes de qualquer gravação (AC-2 a AC-4). */
export async function buscarParaChecagem(
  itens: readonly ItemDaBusca[],
  agora: Date,
): Promise<ResultadoDaBusca> {
  const r = await buscarCandidatos(
    itens.map((i) => ({ itemId: String(i._id), palavras: palavrasDaBusca(i.descricao) })),
  );
  if (!r.ok) return { precisaDePessoa: true, sicamRespondeu: false, automaticas: [] };
  const automaticas: EntradaChecagem[] = [];
  let precisaDePessoa = false;
  for (const item of itens) {
    if ((r.porItem.get(String(item._id)) ?? []).length > 0) {
      precisaDePessoa = true;
      continue;
    }
    automaticas.push(
      montarEntrada(item, {
        resultado: 'sem_candidato',
        automatico: true,
        origem: 'sicam',
        consultadoEm: r.consultadoEm,
        quantidadeLiberada: item.quantidade,
        papel: 'sistema',
        em: agora,
      }),
    );
  }
  return { precisaDePessoa, sicamRespondeu: true, automaticas };
}

type ItemDaDecisao = ItemDaBusca & ItemParaTotal;

type OrcamentoDaDecisao = {
  precos: { itemId: Types.ObjectId; valorUnitarioCentavos: number }[];
};

export type Decidida<I, O> = {
  ok: true;
  entradas: EntradaChecagem[];
  itens: I[];
  orcamentos: O[];
  valorTotalCentavos: number;
  /** Os ids dos itens atendidos por inteiro, que saíram de `itens`. */
  removidos: Set<string>;
};

/**
 * A decisão de `concluir_checagem` (AC-6 a AC-10, AC-12, AC-13). Vale por
 * inteiro: qualquer decisão inválida devolve o erro e nada é gravado. O SICAM é
 * relido aqui, antes da gravação condicional, e é ele quem decide a origem: com
 * resposta, saldo e preço nunca vêm da tela (salvo `VL_ATU` vazio, AC-13).
 */
export async function decidirChecagem<I extends ItemDaDecisao, O extends OrcamentoDaDecisao>(p: {
  itens: readonly I[];
  orcamentos: readonly O[];
  entradasAnteriores: readonly EntradaChecagem[];
  decisoes: readonly DecisaoChecagemInput[];
  autor: { userId: string; nome: string | null; papel: PapelEvento };
  agora: Date;
}): Promise<Decidida<I, O> | { ok: false; error: string }> {
  const { itens, orcamentos, entradasAnteriores, decisoes, autor, agora } = p;
  const abertos = itensNaoChecados(itens, entradasAnteriores, (i) => String(i._id));
  const porItem = new Map(decisoes.map((d) => [d.itemId, d]));
  if (porItem.size !== decisoes.length) return { ok: false, error: ERROS_CHECAGEM.item_repetido };
  if (abertos.some((i) => !porItem.has(String(i._id)))) {
    return { ok: false, error: ERROS_CHECAGEM.falta_decisao };
  }
  const idsAbertos = new Set(abertos.map((i) => String(i._id)));
  if (decisoes.some((d) => !idsAbertos.has(d.itemId))) {
    return { ok: false, error: ERROS_CHECAGEM.item_fora_da_checagem };
  }

  const coMats = [
    ...new Set(
      decisoes.flatMap((d) =>
        !d.manual && d.resultado !== 'sem_correspondente' && d.coMat ? [d.coMat] : [],
      ),
    ),
  ];
  const leitura = await relerMateriais(coMats);
  const sicam = leitura.ok;
  // A origem é do servidor: o SICAM que voltou recusa o manual, e o que caiu recusa o resto.
  if (sicam && decisoes.some((d) => d.manual)) {
    return { ok: false, error: ERROS_CHECAGEM.sicam_voltou };
  }
  if (!sicam && decisoes.some((d) => !d.manual)) {
    return { ok: false, error: ERROS_CHECAGEM.sicam_fora };
  }
  const consultadoEm = leitura.ok ? leitura.consultadoEm : agora;
  const quem = {
    porUserId: new Types.ObjectId(autor.userId),
    porNome: autor.nome,
    papel: autor.papel,
    em: agora,
  };

  const entradas: EntradaChecagem[] = [];
  const saidaPorMaterial = new Map<string, number>();
  const restantes = new Map<string, number>();

  for (const item of abertos) {
    const id = String(item._id);
    const d = porItem.get(id)!;
    const manual = !!d.manual;
    const origem: OrigemChecagem = manual ? 'manual' : 'sicam';
    const comum = { ...quem, origem, consultadoEm, motivo: d.motivo?.trim() || null };

    if (d.resultado === 'sem_correspondente') {
      if (manual && !comum.motivo) return { ok: false, error: ERROS_CHECAGEM.motivo_manual };
      entradas.push(
        montarEntrada(item, {
          ...comum,
          resultado: 'sem_correspondente',
          quantidadeLiberada: item.quantidade,
        }),
      );
      continue;
    }

    let material: MaterialSicam | null = null;
    if (!manual) {
      if (!d.coMat) return { ok: false, error: ERROS_CHECAGEM.material_ausente };
      material = leitura.ok ? (leitura.porCoMat.get(d.coMat) ?? null) : null;
      if (!material) return { ok: false, error: ERROS_CHECAGEM.material_sumiu(d.coMat) };
    } else {
      if (!comum.motivo) return { ok: false, error: ERROS_CHECAGEM.motivo_manual };
      if (d.saldoManual == null) return { ok: false, error: ERROS_CHECAGEM.saldo_manual };
    }
    const copia = {
      coMat: material?.coMat ?? d.coMat ?? null,
      materialDescricao:
        (material?.descricao ?? d.materialDescricao ?? null)?.slice(0, 300) ?? null,
      materialUnidade: material?.unidade ?? d.materialUnidade ?? null,
      saldoVisto: material?.saldo ?? d.saldoManual ?? null,
      reservadoVisto: material?.reservado ?? null,
    };

    if (d.resultado === 'cotar_mesmo_assim') {
      if (!comum.motivo) return { ok: false, error: ERROS_CHECAGEM.motivo_cotar };
      entradas.push(
        montarEntrada(item, {
          ...comum,
          ...copia,
          resultado: 'cotar_mesmo_assim',
          quantidadeLiberada: item.quantidade,
        }),
      );
      continue;
    }

    // `usar`: a quantidade atendida é na unidade do item; a saída, na do SICAM (AC-8).
    const atendida = d.quantidadeAtendida;
    if (atendida == null) return { ok: false, error: ERROS_CHECAGEM.quantidade_ausente };
    if (atendida > item.quantidade + 1e-9) {
      return { ok: false, error: ERROS_CHECAGEM.acima_do_pedido(item.descricao) };
    }
    const unidadeDoMaterial = copia.materialUnidade;
    const mesma = !unidadeDoMaterial || mesmaUnidade(item.unidade, unidadeDoMaterial);
    const saida = mesma ? atendida : d.quantidadeSaida;
    if (saida == null) return { ok: false, error: ERROS_CHECAGEM.saida_ausente(item.descricao) };

    let preco: number | null;
    let precoOrigem: OrigemChecagem;
    const medio = material ? precoMedioCentavos(material.valorTotal, material.saldo) : null;
    if (medio != null) {
      preco = medio;
      precoOrigem = 'sicam';
    } else {
      // Manual, ou SICAM no ar com `VL_ATU` vazio: o preço é digitado (AC-12, AC-13).
      preco = d.precoUnitarioCentavos ?? null;
      precoOrigem = 'manual';
      if (preco == null) return { ok: false, error: ERROS_CHECAGEM.preco_ausente(item.descricao) };
    }

    // O saldo relido é a régua, somando os itens que tiram do mesmo material (AC-9).
    const disponivel = material
      ? disponivelDe(material.saldo, material.reservado)
      : (d.saldoManual ?? 0);
    const chave = copia.coMat ?? `manual:${id}`;
    const somada = (saidaPorMaterial.get(chave) ?? 0) + saida;
    if (somada > disponivel + 1e-9) {
      return { ok: false, error: ERROS_CHECAGEM.saldo_insuficiente(item.descricao, disponivel) };
    }
    saidaPorMaterial.set(chave, somada);

    const restante = restanteDoItem(item.quantidade, atendida);
    restantes.set(id, restante);
    entradas.push(
      montarEntrada(item, {
        ...comum,
        ...copia,
        resultado: 'usar',
        quantidadeAtendida: atendida,
        quantidadeSaida: saida,
        quantidadeLiberada: restante,
        precoUnitarioCentavos: preco,
        valorCentavos: valorDaLinhaCentavos(saida, preco),
        precoOrigem,
      }),
    );
  }

  const removidos = new Set([...restantes].filter(([, r]) => r <= 0).map(([id]) => id));
  const novosItens = itens
    .filter((i) => !removidos.has(String(i._id)))
    .map((i) => {
      const r = restantes.get(String(i._id));
      return r === undefined ? i : { ...i, quantidade: r };
    });
  // O preço de item que saiu não pode prender o responsável técnico (AC-7).
  const novosOrcamentos = orcamentos.map((o) =>
    removidos.size === 0
      ? o
      : { ...o, precos: o.precos.filter((x) => !removidos.has(String(x.itemId))) },
  );
  return {
    ok: true,
    entradas,
    itens: novosItens,
    orcamentos: novosOrcamentos,
    valorTotalCentavos: valorTotalCentavos(novosItens),
    removidos,
  };
}
