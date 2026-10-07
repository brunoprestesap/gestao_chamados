import 'server-only';

import {
  enviarMensagem,
  gravarCartao,
  gravarProposta,
  invalidarCartao,
  lerConversa,
  lerProposta,
  type MensagemLida,
  type PropostaLida,
  type Viewer,
} from '@/lib/conversas';
import { type LlmFailure, type LlmMessage, type LlmMeta, streamLlmObject } from '@/lib/llm';
import type { ConversaFalha } from '@/shared/conversas/conversa.constants';
import type { QuadroResposta } from '@/shared/conversas/quadro.schemas';

import { codigosDoRelato, resumoDoAtivo } from './ativo-do-cartao';
import { type CartaoMontado, montarCartao, revisarAbertura } from './cartao';
import { type CatalogoParaPrompt, lerCatalogoParaPrompt } from './catalogo';
import { ENTRADA_MAX_CARACTERES } from './config';
import { mensagemDeReserva, respostaSemAfirmarAbertura } from './mensagens';
import { lerPerfil, type Perfil, SEM_PERFIL } from './perfil';
import { ABERTURA_TASK, montarSistema, PROMPT_VERSION } from './prompt';
import {
  chaveDoAtivo,
  chaveDosDuplicados,
  conteudoDaProposta,
  conteudoDoCartao,
  type ConteudoVisivel,
  mesmoConteudo,
  propostaProntaParaCartao,
  validarExtracao,
} from './proposta';
import { type RespostaAbertura, respostaAberturaSchema } from './schema';

/**
 * Grava a mensagem do solicitante, transmite a resposta do assistente em
 * quadros e, no fim, atualiza a proposta e o cartão resumo (specs 0003 e 0004).
 *
 * Uma chamada ao modelo por mensagem, na raia interativa: ela devolve a
 * resposta para a pessoa e a leitura do relato no mesmo objeto (AC-1). Montar
 * o cartão nunca chama o modelo.
 *
 * Nada aqui lança exceção. Falha da IA vira mensagem de autor `sistema`, o
 * quadro `reserva` e, quando não há cartão valendo, o cartão manual (AC-8);
 * resposta boa que não pôde ser gravada vira `fim` com `mensagemId: null`.
 * Este módulo sempre recebe conversa que já existe: criar e descartar rascunho
 * é da rota sem `id`.
 */

export type RespostaIniciada =
  | { ok: false; reason: ConversaFalha }
  | {
      ok: true;
      conversaId: string;
      mensagemId: string;
      quadros: AsyncGenerator<QuadroResposta>;
    };

type Params = {
  viewer: Viewer;
  conversaId: string;
  texto: string;
  /** Vem de `request.signal`: aba fechada ou conexão caída libera a vaga na GPU. */
  signal?: AbortSignal;
};

/** O que aconteceu com o cartão nesta volta, para a linha de log (AC-16). */
type DestinoCartao = 'novo' | 'mantido' | 'invalidado' | 'nenhum';

function registrar(evento: string, dados: Record<string, unknown>): void {
  // Nenhum texto de conversa entra em log: nem relato, nem resposta, nem local.
  console.warn(`[assistente] ${evento}`, JSON.stringify(dados));
}

function descrever(err: unknown): string {
  return err instanceof Error ? err.name : 'erro';
}

/**
 * O histórico que vai ao modelo (AC-2). `solicitante` vira `user` e resposta
 * de texto da `ia` vira `assistant`; aviso do `sistema` e cartão ficam de fora,
 * porque não fazem parte do diálogo.
 *
 * O histórico cabe no `orcamento`, que é o que sobra de
 * `ENTRADA_MAX_CARACTERES` depois do prompt de sistema desta chamada. Quando
 * não cabe, saem as mensagens do meio: ficam sempre a primeira mensagem do
 * solicitante, que costuma trazer o relato, e as mais recentes.
 */
export function montarHistorico(
  anteriores: Pick<MensagemLida, 'autor' | 'tipo' | 'texto'>[],
  textoNovo: string,
  orcamento: number,
): LlmMessage[] {
  const dialogo: LlmMessage[] = anteriores
    .filter((m) => m.tipo === 'texto' && (m.autor === 'solicitante' || m.autor === 'ia'))
    .map((m) => ({
      role: m.autor === 'solicitante' ? 'user' : 'assistant',
      content: m.texto,
    }));
  dialogo.push({ role: 'user', content: textoNovo });

  const tamanho = (mensagens: LlmMessage[]) =>
    mensagens.reduce((soma, m) => soma + m.content.length, 0);
  if (tamanho(dialogo) <= orcamento) return dialogo;

  // A mensagem nova é a que está sendo respondida: ela sempre vai.
  const nova = dialogo[dialogo.length - 1]!;
  const indicePrimeira = dialogo.findIndex((m) => m.role === 'user');
  const primeira =
    indicePrimeira >= 0 && indicePrimeira < dialogo.length - 1 ? dialogo[indicePrimeira]! : null;

  let sobra = orcamento - nova.content.length;
  const manterPrimeira = primeira !== null && primeira.content.length <= sobra;
  if (manterPrimeira) sobra -= primeira.content.length;

  // Do fim para o começo, sem voltar até a primeira nem pular buracos.
  const recentes: LlmMessage[] = [];
  for (let i = dialogo.length - 2; i > indicePrimeira; i -= 1) {
    const mensagem = dialogo[i]!;
    if (mensagem.content.length > sobra) break;
    recentes.unshift(mensagem);
    sobra -= mensagem.content.length;
  }

  return [...(manterPrimeira && primeira ? [primeira] : []), ...recentes, nova];
}

export async function responderNaConversa(params: Params): Promise<RespostaIniciada> {
  const { viewer, conversaId, texto, signal } = params;

  // Uma leitura só resolve três coisas: se a conversa existe, se é do viewer e
  // qual é o histórico. Conferir o dono antes do modelo é o que impede um
  // pedido de terceiro de consumir vaga na GPU compartilhada.
  const lida = await lerConversa(viewer, conversaId);
  if (!lida.ok) return { ok: false, reason: lida.reason };

  // Conversa já ligada a chamado abre em modo leitura, sem caixa de envio.
  // Chegar aqui significa pedido fora da tela: some do mesmo jeito que uma
  // conversa inexistente, sem gastar chamada ao modelo.
  if (lida.conversa.situacao !== 'rascunho') {
    return { ok: false, reason: 'nao_encontrada' };
  }

  const gravada = await enviarMensagem({
    viewer,
    conversaId,
    autor: 'solicitante',
    tipo: 'texto',
    texto,
  });
  if (!gravada.ok) return { ok: false, reason: gravada.reason };

  return {
    ok: true,
    conversaId,
    mensagemId: gravada.id,
    quadros: transmitir({
      viewer,
      conversaId,
      origemMensagemId: gravada.id,
      anteriores: lida.mensagens,
      texto,
      signal,
    }),
  };
}

type Contexto = {
  catalogo: CatalogoParaPrompt;
  perfil: Perfil;
  proposta: PropostaLida | null;
};

const CATALOGO_VAZIO: CatalogoParaPrompt = {
  bloco: null,
  tamanho: 0,
  acimaDoTeto: false,
  porCodigo: new Map(),
  codigoPorId: new Map(),
};

/**
 * Catálogo, unidade do perfil e proposta atual, lidos a cada chamada. Falha
 * de leitura não derruba a conversa: segue sem aquele pedaço, e o modelo
 * pergunta o que faltar.
 */
async function lerContexto(viewer: Viewer, conversaId: string): Promise<Contexto> {
  const [catalogo, perfil, proposta] = await Promise.all([
    lerCatalogoParaPrompt().catch((err) => {
      registrar('catalogo indisponivel', { conversaId, erro: descrever(err) });
      return CATALOGO_VAZIO;
    }),
    lerPerfil(viewer.userId).catch((err) => {
      registrar('perfil indisponivel', { conversaId, erro: descrever(err) });
      return SEM_PERFIL;
    }),
    lerProposta(viewer, conversaId),
  ]);

  if (catalogo.acimaDoTeto) {
    registrar('catalogo acima do teto', { conversaId, tamanho: catalogo.tamanho });
  }

  return { catalogo, perfil, proposta: proposta.ok ? proposta.proposta : null };
}

type TransmitirParams = {
  viewer: Viewer;
  conversaId: string;
  /** A mensagem do solicitante que esta volta responde (AC-3). */
  origemMensagemId: string;
  anteriores: MensagemLida[];
  texto: string;
  signal?: AbortSignal;
};

async function* transmitir(params: TransmitirParams): AsyncGenerator<QuadroResposta> {
  const { viewer, conversaId, origemMensagemId, anteriores, texto, signal } = params;
  const comecouEm = Date.now();

  yield { tipo: 'inicio', conversaId, mensagemId: origemMensagemId };

  const contexto = await lerContexto(viewer, conversaId);
  const system = montarSistema({
    catalogo: contexto.catalogo.bloco,
    perfil: contexto.perfil,
    proposta: contexto.proposta
      ? {
          codigo: contexto.proposta.servico
            ? (contexto.catalogo.codigoPorId.get(contexto.proposta.servico.catalogServiceId) ??
              null)
            : null,
          localExato: contexto.proposta.localExato,
        }
      : null,
  });
  const historico = montarHistorico(anteriores, texto, ENTRADA_MAX_CARACTERES - system.length);

  // Sem `sampling`: vale o `maxOutputTokens` padrão da spec 0001 (AC-1).
  const stream = await streamLlmObject({
    task: ABERTURA_TASK,
    promptVersion: PROMPT_VERSION,
    schema: respostaAberturaSchema,
    system,
    messages: historico,
    lane: 'interactive',
    userId: viewer.userId,
    ref: { type: 'conversa', id: conversaId },
    signal,
  });

  // Falhou antes de qualquer conteúdo: vai direto para a reserva, sem parcial.
  if (!stream.ok) {
    yield* reserva({ viewer, conversaId, motivo: stream.reason, comecouEm });
    return;
  }

  try {
    for await (const parcial of stream.partial) {
      // Só a `resposta` vai para a tela; a extração nunca sai do servidor.
      const textoParcial = typeof parcial?.resposta === 'string' ? parcial.resposta : '';
      if (textoParcial) yield { tipo: 'parcial', texto: textoParcial };
    }
  } catch (err) {
    // O parcial é só exibição; o veredito real é o `final` logo abaixo.
    registrar('parcial interrompido', { conversaId, erro: descrever(err) });
  }

  const final = await stream.final;

  // Resposta reprovada pelo schema, prazo estourado no meio, conexão perdida:
  // o texto parcial que a tela mostrou é trocado pela mensagem de reserva.
  if (!final.ok) {
    yield* reserva({ viewer, conversaId, motivo: final.reason, comecouEm });
    return;
  }

  const resposta = respostaSemAfirmarAbertura(final.data.resposta);
  if (resposta !== final.data.resposta) {
    registrar('resposta afirmava chamado aberto', { conversaId });
  }

  const guardada = await enviarMensagem({
    viewer,
    conversaId,
    autor: 'ia',
    tipo: 'texto',
    texto: resposta,
    llmCallId: final.meta.callId,
  });

  if (guardada.ok) {
    yield { tipo: 'fim', texto: resposta, mensagemId: guardada.id, motivo: null };
  } else {
    // Resposta boa que não pôde ser gravada: o rascunho foi descartado noutra
    // aba ou o teto de 30 foi atingido no meio. A tela mostra a resposta com o
    // aviso de que ela não fica salva, e nenhuma exceção sobe.
    registrar('resposta nao gravada', {
      conversaId,
      motivo: guardada.reason,
      duracaoMs: Date.now() - comecouEm,
    });
    yield { tipo: 'fim', texto: resposta, mensagemId: null, motivo: guardada.reason };
  }

  yield* atualizarProposta({
    viewer,
    conversaId,
    origemMensagemId,
    // A mensagem desta volta já está gravada: ela entra na procura do código.
    relato: [...anteriores, { autor: 'solicitante', tipo: 'texto', texto }],
    dados: final.data,
    meta: final.meta,
    contexto,
    comecouEm,
  });
}

type AtualizarParams = {
  viewer: Viewer;
  conversaId: string;
  origemMensagemId: string;
  /** As mensagens da conversa até esta volta, já em memória. */
  relato: Pick<MensagemLida, 'autor' | 'tipo' | 'texto'>[];
  dados: RespostaAbertura;
  meta: LlmMeta;
  contexto: Contexto;
  comecouEm: number;
};

/**
 * Depois de uma resposta boa: grava a proposta e decide o cartão (AC-3, AC-4).
 *
 * - Conteúdo visível igual ao do cartão que vale: nada muda.
 * - Mudou e a proposta está pronta (completa, serviço válido, local): cartão novo.
 * - Mudou e não está pronta: o cartão que valia deixa de valer.
 */
async function* atualizarProposta(params: AtualizarParams): AsyncGenerator<QuadroResposta> {
  const { viewer, conversaId, origemMensagemId, relato, dados, meta, contexto, comecouEm } = params;

  const extracao = validarExtracao({
    dados,
    catalogo: contexto.catalogo,
    meta,
    origemMensagemId,
  });

  let cartao: DestinoCartao = 'nenhum';
  let ativo: CartaoMontado['payload']['ativo'] = null;
  let duplicadosTotal = 0;
  const concluir = () =>
    registrar('proposta', {
      conversaId,
      codigo: extracao.codigo,
      completo: dados.completo,
      cartao,
      // Origem e quantidade do equipamento, nunca o código nem o local (spec 0014, AC-13).
      ...resumoDoAtivo(ativo),
      // Só quantos parecidos, nunca número nem local (spec 0017, AC-20).
      duplicadosTotal,
      duracaoMs: Date.now() - comecouEm,
    });

  const gravada = await gravarProposta(viewer, conversaId, extracao.entrada);
  if (!gravada.ok) {
    // A conversa deixou de ser rascunho (virou chamado, foi descartada): nem
    // proposta nem cartão depois disso (AC-12).
    concluir();
    return;
  }
  if (!gravada.gravada) {
    // Resposta de uma mensagem mais antiga terminando depois (duas abas): a
    // proposta guardada já responde a uma mais nova e fica como está.
    registrar('proposta_velha', {
      conversaId,
      origemMensagemId,
      origemGuardada: gravada.origemGuardada,
    });
    concluir();
    return;
  }

  const lida = await lerProposta(viewer, conversaId);
  if (!lida.ok || !lida.proposta || lida.situacao !== 'rascunho') {
    concluir();
    return;
  }

  const proposta = lida.proposta;
  const atual = lida.cartaoAtual;
  const pronta = propostaProntaParaCartao(proposta);

  // Os candidatos de equipamento entram na comparação (spec 0014, AC-7), mas
  // só são calculados quando há código no relato ou a proposta está pronta:
  // nos outros turnos não há consulta ao banco, e a chave do cartão que vale
  // é mantida, para o ativo não decidir nada sozinho.
  let montado: CartaoMontado | null = null;
  let novoConteudo: ConteudoVisivel;
  if (pronta || codigosDoRelato(relato).length > 0) {
    // Os parecidos só são procurados com a proposta pronta (spec 0017,
    // AC-5a); no turno só do código, a chave deles vem do cartão que vale.
    montado = await montarCartao({
      conversaId,
      proposta,
      perfil: contexto.perfil,
      viewer,
      buscarDuplicados: pronta,
    });
    ativo = montado.payload.ativo ?? null;
    duplicadosTotal = montado.payload.duplicados?.length ?? 0;
    novoConteudo = conteudoDaProposta(
      proposta,
      contexto.perfil,
      chaveDoAtivo(ativo),
      pronta ? chaveDosDuplicados(montado.payload.duplicados) : chaveDoCartaoAtual(atual),
    );
  } else {
    novoConteudo = conteudoDaProposta(
      proposta,
      contexto.perfil,
      atual ? conteudoDoCartao(atual.payload).ativoChave : '',
      chaveDoCartaoAtual(atual),
    );
  }

  if (atual && mesmoConteudo(conteudoDoCartao(atual.payload), novoConteudo)) {
    cartao = 'mantido';
    concluir();
    return;
  }

  if (pronta && montado) {
    // O serviço pode ter sido desativado no meio: aí não há cartão da IA.
    if (montado.payload.modo === 'ia') {
      const novo = await gravarCartao({
        viewer,
        conversaId,
        autor: montado.autor,
        texto: montado.texto,
        payload: montado.payload,
        llmCallId: meta.callId,
        origemMensagemId,
      });
      if (novo.ok) {
        cartao = 'novo';
        concluir();
        yield {
          tipo: 'cartao',
          mensagemId: novo.mensagemId,
          cartao: montado.payload,
          substituiId: novo.substituiId,
        };
      } else {
        // Outra resposta gravou proposta no meio, ou a conversa deixou de ser
        // rascunho: quem chegou depois decide o cartão.
        concluir();
      }
      return;
    }
  }

  if (atual) {
    await invalidarCartao(viewer, conversaId, atual.id);
    cartao = 'invalidado';
    concluir();
    yield { tipo: 'cartao', mensagemId: null, cartao: null, substituiId: atual.id };
    return;
  }

  concluir();
}

/** A chave dos parecidos do cartão que vale, ou vazia sem cartão (spec 0017, AC-8). */
function chaveDoCartaoAtual(atual: { payload: CartaoMontado['payload'] } | null): string {
  return atual ? conteudoDoCartao(atual.payload).duplicadosChave : '';
}

type ReservaParams = {
  viewer: Viewer;
  conversaId: string;
  motivo: LlmFailure['reason'];
  comecouEm: number;
};

/**
 * A IA não respondeu: o Sigma fala no lugar dela, com texto próprio, gravado
 * como mensagem de autor `sistema`. Sem cartão valendo, o cartão manual vem
 * logo depois, para o chamado abrir mesmo assim (AC-8).
 */
async function* reserva(params: ReservaParams): AsyncGenerator<QuadroResposta> {
  const { viewer, conversaId, motivo, comecouEm } = params;

  registrar('reserva', { conversaId, motivo, duracaoMs: Date.now() - comecouEm });

  // Quem desistiu foi a pessoa (aba fechada, conexão caída): não há a quem
  // avisar, e uma mensagem de sistema só sujaria a conversa no recarregamento.
  if (motivo === 'cancelled') return;

  const texto = mensagemDeReserva(motivo);

  const guardada = await enviarMensagem({
    viewer,
    conversaId,
    autor: 'sistema',
    tipo: 'texto',
    texto,
  });

  if (!guardada.ok) {
    registrar('reserva nao gravada', { conversaId, motivo: guardada.reason });
  }

  yield {
    tipo: 'reserva',
    texto,
    mensagemId: guardada.ok ? guardada.id : null,
    motivo,
  };

  // Cartão que já vale continua valendo: a falha não apaga o que a IA acertou.
  const lida = await lerProposta(viewer, conversaId);
  if (!lida.ok || lida.situacao !== 'rascunho' || lida.cartaoAtual) return;

  const revisado = await revisarAbertura(viewer, conversaId);
  if (!revisado.ok) {
    registrar('cartao da reserva nao gravado', { conversaId, motivo: revisado.reason });
    return;
  }

  yield {
    tipo: 'cartao',
    mensagemId: revisado.mensagemId,
    cartao: revisado.cartao,
    substituiId: revisado.substituiId,
  };
}
