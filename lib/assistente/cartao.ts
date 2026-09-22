import 'server-only';

import { gravarCartao, lerProposta, type PropostaLida, type Viewer } from '@/lib/conversas';
import type { ConversaFalha } from '@/shared/conversas/conversa.constants';
import type { CartaoFaltando } from '@/shared/conversas/conversa.constants';
import type { CartaoPayload } from '@/shared/conversas/conversa.schemas';

import { lerServicoAtivo } from './catalogo';
import { fraseDoCartao } from './mensagens';
import { lerPerfil, type Perfil } from './perfil';
import { conteudoDoCartao, limparLocal, mesmoConteudo, unidadeSugerida } from './proposta';

/**
 * O cartão resumo (spec 0004, AC-5 a AC-7). Montar cartão nunca chama o
 * modelo: ele sai da proposta guardada, com os rótulos lidos do banco na hora.
 *
 * Modo `ia` quando a proposta tem serviço que ainda vale; modo `manual` quando
 * não tem, ou quando não existe proposta. Campo ausente chega vazio e marcado
 * como obrigatório em `faltando`.
 */

export type CartaoMontado = {
  autor: 'ia' | 'sistema';
  texto: string;
  payload: CartaoPayload;
};

type PropostaDoCartao = Pick<PropostaLida, 'servico' | 'localExato' | 'localForaDoPerfil'> | null;

export async function montarCartao(params: {
  proposta: PropostaDoCartao;
  perfil: Perfil;
}): Promise<CartaoMontado> {
  const { proposta, perfil } = params;

  // O serviço pode ter sido desativado depois da proposta: aí o cartão é manual.
  const servico = proposta?.servico
    ? await lerServicoAtivo(proposta.servico.catalogServiceId, proposta.servico.subtypeId)
    : null;

  const unidade = unidadeSugerida(perfil, proposta?.localForaDoPerfil ?? false);
  const localExato = limparLocal(proposta?.localExato);

  const faltando: CartaoFaltando[] = [];
  if (!servico) faltando.push('tipo');
  if (!unidade) faltando.push('unidade');
  if (!localExato) faltando.push('local');

  const payload: CartaoPayload = {
    modo: servico ? 'ia' : 'manual',
    servico,
    unidade: unidade
      ? { unitId: unidade.unitId, rotulo: unidade.nome, andar: unidade.andar }
      : null,
    localExato,
    faltando,
  };

  return {
    autor: servico ? 'ia' : 'sistema',
    texto: fraseDoCartao(payload),
    payload,
  };
}

export type RevisarFalha = Extract<
  ConversaFalha,
  'nao_encontrada' | 'confirmacao_em_andamento' | 'erro'
>;

export type RevisarResultado =
  | { ok: true; mensagemId: string; cartao: CartaoPayload; substituiId: string | null }
  | { ok: false; reason: RevisarFalha };

/**
 * `Revisar e abrir`, e o cartão depois da reserva (AC-7, AC-8). Se já existe
 * cartão que vale e o conteúdo dele é o mesmo que a proposta montaria agora,
 * devolve esse mesmo cartão sem gravar mensagem nova.
 *
 * Só o dono age no próprio rascunho; qualquer outro recebe `nao_encontrada`,
 * igual a conversa inexistente (AC-17).
 */
export async function revisarAbertura(
  viewer: Viewer,
  conversaId: string,
): Promise<RevisarResultado> {
  try {
    const lida = await lerProposta(viewer, conversaId);
    if (!lida.ok) {
      return { ok: false, reason: lida.reason === 'erro' ? 'erro' : 'nao_encontrada' };
    }
    if (lida.situacao === 'reservada') return { ok: false, reason: 'confirmacao_em_andamento' };
    if (lida.situacao !== 'rascunho') return { ok: false, reason: 'nao_encontrada' };

    const perfil = await lerPerfil(viewer.userId);
    const montado = await montarCartao({ proposta: lida.proposta, perfil });

    const atual = lida.cartaoAtual;
    if (
      atual &&
      mesmoConteudo(conteudoDoCartao(atual.payload), conteudoDoCartao(montado.payload))
    ) {
      return { ok: true, mensagemId: atual.id, cartao: atual.payload, substituiId: null };
    }

    const gravado = await gravarCartao({
      viewer,
      conversaId,
      autor: montado.autor,
      texto: montado.texto,
      payload: montado.payload,
      llmCallId: montado.payload.modo === 'ia' ? lida.proposta?.llmCallId : null,
    });
    if (!gravado.ok) {
      return { ok: false, reason: gravado.reason === 'erro' ? 'erro' : 'nao_encontrada' };
    }

    return {
      ok: true,
      mensagemId: gravado.mensagemId,
      cartao: montado.payload,
      substituiId: gravado.substituiId,
    };
  } catch (err) {
    console.error(
      '[assistente]',
      JSON.stringify({
        operacao: 'revisarAbertura',
        conversaId,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return { ok: false, reason: 'erro' };
  }
}
