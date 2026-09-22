import 'server-only';

import type { PropostaEntrada, PropostaLida } from '@/lib/conversas';
import type { LlmMeta } from '@/lib/llm';
import type { CartaoPayload } from '@/shared/conversas/conversa.schemas';

import { type CatalogoParaPrompt, normalizarCodigo } from './catalogo';
import { MOTIVO_VAZIO } from './config';
import type { Perfil, UnidadeDoPerfil } from './perfil';
import type { RespostaAbertura } from './schema';

/**
 * A extração do modelo virando proposta (spec 0004, AC-3). Saída do modelo é
 * dado não confiável: o código só vira serviço se existir no catálogo ativo
 * que foi para o prompt desta mesma chamada, e nenhum texto do modelo vira
 * rótulo. Confiança e motivo ficam só no servidor.
 */

/** O que aconteceu com o código devolvido, para a linha de log (AC-16). */
export type CodigoAvaliado = 'valido' | 'codigo_invalido' | 'nulo' | 'sem_catalogo';

export type ExtracaoValidada = {
  entrada: PropostaEntrada;
  codigo: CodigoAvaliado;
};

/** Motivo vazio vindo do modelo vira uma frase fixa: a decisão exige uma. */
export function motivoOuPadrao(motivo: string): string {
  const limpo = motivo.trim();
  return limpo || MOTIVO_VAZIO;
}

/** Local exato limpo: sem espaço nas pontas e nulo quando vazio. */
export function limparLocal(local: string | null | undefined): string | null {
  const limpo = (local ?? '').trim();
  return limpo || null;
}

export function validarExtracao(params: {
  dados: RespostaAbertura;
  catalogo: Pick<CatalogoParaPrompt, 'bloco' | 'porCodigo'>;
  meta: Pick<LlmMeta, 'callId' | 'model' | 'promptVersion' | 'task'>;
  origemMensagemId: string;
}): ExtracaoValidada {
  const { dados, catalogo, meta, origemMensagemId } = params;

  let codigo: CodigoAvaliado = 'nulo';
  let servico: PropostaEntrada['servico'] = null;

  if (!catalogo.bloco) {
    // Sem catálogo no prompt, qualquer código seria invenção (AC-2).
    codigo = 'sem_catalogo';
  } else if (dados.servicoCodigo !== null && dados.servicoCodigo.trim()) {
    const item = catalogo.porCodigo.get(normalizarCodigo(dados.servicoCodigo));
    if (item && item.tipoServico) {
      codigo = 'valido';
      servico = {
        catalogServiceId: item.catalogServiceId,
        subtypeId: item.subtypeId,
        tipoServico: item.tipoServico,
        confianca: dados.servicoConfianca,
        motivo: motivoOuPadrao(dados.servicoMotivo),
      };
    } else {
      codigo = 'codigo_invalido';
    }
  }

  // Campo nulo: a confiança e o motivo daquele campo não entram na proposta.
  const prioridade: PropostaEntrada['prioridade'] = dados.prioridade
    ? {
        prioridade: dados.prioridade,
        confianca: dados.prioridadeConfianca,
        motivo: motivoOuPadrao(dados.prioridadeMotivo),
      }
    : null;

  return {
    codigo,
    entrada: {
      servico,
      prioridade,
      localExato: limparLocal(dados.localExato),
      localForaDoPerfil: dados.localForaDoPerfil,
      completo: dados.completo,
      llmCallId: meta.callId,
      modelo: meta.model,
      promptVersion: meta.promptVersion,
      task: meta.task,
      origemMensagemId,
    },
  };
}

/**
 * A unidade que o cartão traz pronta: a do perfil, salvo quando o relato fala
 * de outro lugar. Sem unidade no perfil, o cartão pede para escolher (AC-6).
 */
export function unidadeSugerida(
  perfil: Perfil,
  localForaDoPerfil: boolean,
): UnidadeDoPerfil | null {
  if (localForaDoPerfil) return null;
  return perfil.unidade;
}

/** O que o cartão mostra: serviço, unidade e local. É o que decide cartão novo (AC-4). */
export type ConteudoVisivel = {
  servicoId: string | null;
  unidadeId: string | null;
  localExato: string | null;
};

type PropostaVisivel = Pick<PropostaLida, 'servico' | 'localExato' | 'localForaDoPerfil'>;

export function conteudoDaProposta(
  proposta: PropostaVisivel | null,
  perfil: Perfil,
): ConteudoVisivel {
  return {
    servicoId: proposta?.servico?.catalogServiceId ?? null,
    unidadeId: unidadeSugerida(perfil, proposta?.localForaDoPerfil ?? false)?.unitId ?? null,
    localExato: limparLocal(proposta?.localExato),
  };
}

export function conteudoDoCartao(cartao: CartaoPayload): ConteudoVisivel {
  return {
    servicoId: cartao.servico?.catalogServiceId ?? null,
    unidadeId: cartao.unidade?.unitId ?? null,
    localExato: limparLocal(cartao.localExato),
  };
}

export function mesmoConteudo(a: ConteudoVisivel, b: ConteudoVisivel): boolean {
  return (
    a.servicoId === b.servicoId && a.unidadeId === b.unidadeId && a.localExato === b.localExato
  );
}

/** A proposta pode virar cartão sozinha? Completa, com serviço válido e local (AC-4). */
export function propostaProntaParaCartao(
  proposta: PropostaVisivel & { completo: boolean },
): boolean {
  return (
    proposta.completo && proposta.servico !== null && limparLocal(proposta.localExato) !== null
  );
}
