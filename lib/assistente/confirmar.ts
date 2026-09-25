import 'server-only';

import { Types } from 'mongoose';

import { tentarAtribuicaoAutomatica } from '@/lib/chamados/atribuicao-automatica';
import { notificarNovoChamado } from '@/lib/chamados/novo-chamado';
import {
  abrirChamadoDaConversa,
  type DecisaoEntrada,
  enviarMensagem,
  invalidarCartao,
  lerMensagens,
  lerProposta,
  type PropostaLida,
  type Viewer,
} from '@/lib/conversas';
import { dbConnect } from '@/lib/db';
import { montarSnapshotSla } from '@/lib/sla-snapshot';
import { UnitModel } from '@/models/unit';
import type { AtribuicaoResultado } from '@/shared/chamados/atribuicao-automatica.constants';
import { toAttendanceNature } from '@/shared/chamados/chamado.constants';
import type { TipoServico } from '@/shared/chamados/tipo-servico';
import { confirmarAberturaSchema } from '@/shared/conversas/abertura.schemas';
import type {
  CartaoModo,
  ConversaFalha,
  DecisaoEfeito,
} from '@/shared/conversas/conversa.constants';

import { lerServicoAtivo, type ServicoAtivo } from './catalogo';
import { fraseDeChamadoAberto } from './mensagens';
import { confiancaSuficienteParaPrioridade } from './portao';

/**
 * A confirmação do cartão resumo: o chamado nasce (spec 0004, AC-10 e AC-11).
 *
 * Nunca chama o modelo. Do navegador vêm só a conversa, o cartão, a unidade,
 * o local e, no modo manual, o tipo; serviço, prioridade, confiança, motivo e
 * `meta` são lidos de `propostaIa` no banco (AC-17). A costura sem transação,
 * o reparo e a proteção contra clique duplo são de `abrirChamadoDaConversa`
 * (spec 0002).
 */

export type ConfirmacaoFalha = ConversaFalha | 'cartao_desatualizado' | 'dados_invalidos';

export type ConfirmacaoResultado =
  | { ok: true; chamadoId: string; ticketNumber: string; jaExistia: boolean }
  | { ok: false; reason: ConfirmacaoFalha };

const falha = (reason: ConfirmacaoFalha): ConfirmacaoResultado => ({ ok: false, reason });

/**
 * O título do chamado aberto pela conversa: `<rótulo> — <local>`. O formulário
 * usa sempre o tipo; a conversa usa o nome do serviço no modo `ia`, porque ele
 * existe e diz mais, e o tipo no modo `manual`.
 */
export function montarTituloChat({
  rotulo,
  localExato,
}: {
  rotulo: string;
  localExato: string;
}): string {
  return `${rotulo.trim()} — ${localExato.trim()}`;
}

/** Todo o texto do solicitante, na ordem, separado por uma linha em branco. */
export function montarDescricao(
  mensagens: { autor: string; tipo: string; texto: string }[],
): string {
  return mensagens
    .filter((m) => m.autor === 'solicitante' && m.tipo === 'texto')
    .map((m) => m.texto.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * As decisões da confirmação, lidas só da proposta guardada (AC-10).
 *
 * `efeitoPrioridade` vem do portão de confiança (spec 0007): `'aplicado'`
 * quando o chamado nasce `validado` sozinho, `'sugestao'` (o padrão) nos
 * outros casos. O serviço nunca vira `'aplicado'` nesta fatia: o portão exige
 * o mesmo modo `ia` que já o resolveu, então ele nunca precisou de triagem.
 */
export function decisoesDaProposta(
  proposta: PropostaLida,
  servico: ServicoAtivo | null,
  efeitoPrioridade: DecisaoEfeito = 'sugestao',
): DecisaoEntrada[] {
  if (!proposta.llmCallId || !proposta.modelo || !proposta.promptVersion || !proposta.task) {
    return [];
  }
  const meta = {
    model: proposta.modelo,
    promptVersion: proposta.promptVersion,
    task: proposta.task,
    callId: proposta.llmCallId,
  };

  const decisoes: DecisaoEntrada[] = [];
  if (servico && proposta.servico) {
    decisoes.push({
      campo: 'servico',
      decididoPor: 'ia',
      efeito: 'sugestao',
      valor: {
        catalogServiceId: proposta.servico.catalogServiceId,
        subtypeId: proposta.servico.subtypeId,
        tipoServico: proposta.servico.tipoServico,
      },
      confianca: proposta.servico.confianca,
      motivo: proposta.servico.motivo,
      meta,
    });
  }
  if (proposta.prioridade) {
    decisoes.push({
      campo: 'prioridade',
      decididoPor: 'ia',
      efeito: efeitoPrioridade,
      valor: { prioridade: proposta.prioridade.prioridade },
      confianca: proposta.prioridade.confianca,
      motivo: proposta.prioridade.motivo,
      meta,
    });
  }
  return decisoes;
}

function registrar(dados: Record<string, unknown>): void {
  // Nenhum texto de relato, de resposta ou de local entra em log (AC-16).
  console.warn('[abertura]', JSON.stringify(dados));
}

export async function confirmarAbertura(
  viewer: Viewer,
  entrada: unknown,
): Promise<ConfirmacaoResultado> {
  const parsed = confirmarAberturaSchema.safeParse(entrada);
  if (!parsed.success) return falha('dados_invalidos');
  const { conversaId, cartaoId, unitId, localExato, tipoServico } = parsed.data;

  try {
    await dbConnect();

    const lida = await lerProposta(viewer, conversaId);
    if (!lida.ok) {
      // Conversa de outra pessoa sai igual a conversa inexistente (AC-17).
      return falha(lida.reason === 'erro' ? 'erro' : 'nao_encontrada');
    }

    // Só o cartão apontado pela proposta tem ação (AC-12).
    const proposta = lida.proposta;
    if (!proposta || proposta.cartaoMensagemId !== cartaoId) {
      return falha('cartao_desatualizado');
    }

    // Clique duplo: a conversa já virou chamado com este mesmo cartão. A
    // abertura devolve o chamado que existe, sem gravar nem notificar nada.
    if (lida.situacao === 'vinculada') {
      const existente = await abrirChamadoDaConversa({ viewer, conversaId, dadosChamado: {} });
      if (!existente.ok) return falha(traduzir(existente.reason));
      registrar({ conversaId, chamadoId: existente.chamadoId, modo: null, jaExistia: true });
      return {
        ok: true,
        chamadoId: existente.chamadoId,
        ticketNumber: existente.ticketNumber,
        jaExistia: true,
      };
    }

    // Ponteiro sem mensagem conta como cartão desatualizado.
    const cartao = lida.cartaoAtual;
    if (!cartao) {
      await invalidarCartao(viewer, conversaId, cartaoId);
      return falha('cartao_desatualizado');
    }

    const modo: CartaoModo = cartao.payload.modo;
    let servico: ServicoAtivo | null = null;
    let tipo: TipoServico;

    if (modo === 'ia') {
      const doCartao = cartao.payload.servico;
      // O serviço do cartão tem que ser o da proposta e continuar ativo; senão
      // o cartão deixa de valer e `Revisar e abrir` monta outro.
      servico =
        doCartao && proposta.servico?.catalogServiceId === doCartao.catalogServiceId
          ? await lerServicoAtivo(doCartao.catalogServiceId, doCartao.subtypeId)
          : null;
      if (!servico) {
        await invalidarCartao(viewer, conversaId, cartaoId);
        return falha('cartao_desatualizado');
      }
      tipo = servico.tipoServico;
    } else {
      if (!tipoServico) return falha('dados_invalidos');
      tipo = tipoServico;
    }

    const unidade = await UnitModel.findOne({ _id: unitId, isActive: true }).select('_id').lean();
    if (!unidade) return falha('dados_invalidos');

    const descricao = montarDescricao(await lerMensagens(conversaId));
    const titulo = montarTituloChat({
      rotulo: servico ? servico.rotuloServico : tipo,
      localExato,
    });

    // O portão de confiança (spec 0007): roda uma única vez, agora. Sem
    // confiança suficiente, ou sem snapshot de SLA de verdade por trás, o
    // caminho cai inteiro no comportamento de sempre (`aberto`, sugestão).
    const now = new Date();
    let statusChamado: 'aberto' | 'validado' = 'aberto';
    let efeitoPrioridade: DecisaoEfeito = 'sugestao';
    let classificacao: Record<string, unknown> = {};

    if (proposta.prioridade) {
      // Falha ao ler a configuração do portão também cai no caminho de
      // sempre (espírito do AC-4): nunca impede a abertura.
      const confiante = await confiancaSuficienteParaPrioridade({
        modo,
        confianca: proposta.prioridade.confianca,
      }).catch((err: unknown) => {
        registrar({
          conversaId,
          aviso: 'portao_indisponivel',
          erro: err instanceof Error ? err.name : 'desconhecido',
        });
        return false;
      });
      if (confiante) {
        const snapshot = await montarSnapshotSla(proposta.prioridade.prioridade, now);
        if (snapshot.ok) {
          statusChamado = 'validado';
          efeitoPrioridade = 'aplicado';
          classificacao = {
            finalPriority: proposta.prioridade.prioridade,
            // A natureza aprovada, como a classificação manual grava (AC-1):
            // o chat só abre `Padrão`, então a aprovada é a mesma pedida.
            attendanceNature: toAttendanceNature('Padrão'),
            classifiedAt: now,
            sla: snapshot.snapshot,
          };
        }
      }
    }

    const aberto = await abrirChamadoDaConversa({
      viewer,
      conversaId,
      dadosChamado: {
        titulo,
        descricao,
        status: statusChamado,
        solicitanteId: new Types.ObjectId(viewer.userId),
        unitId: new Types.ObjectId(unitId),
        localExato,
        tipoServico: tipo,
        grauUrgencia: 'Normal',
        naturezaAtendimento: 'Padrão',
        requestedAttendanceNature: toAttendanceNature('Padrão'),
        // O chat não pede dado pessoal, então o chamado nasce sem telefone.
        telefoneContato: '',
        catalogServiceId: servico ? new Types.ObjectId(servico.catalogServiceId) : null,
        subtypeId: servico ? new Types.ObjectId(servico.subtypeId) : null,
        ...classificacao,
      },
      decisoes: decisoesDaProposta(proposta, servico, efeitoPrioridade),
    });
    if (!aberto.ok) return falha(traduzir(aberto.reason));

    if (!aberto.jaExistia) {
      // A atribuição automática (spec 0008): só o chamado que nasceu `validado`
      // pelo chat, e só na primeira confirmação (`jaExistia` voltou antes). O
      // passo nunca lança; `nao_tentada` deixa tudo como na spec 0007.
      let atribuicao: AtribuicaoResultado = { resultado: 'nao_tentada' };
      if (statusChamado === 'validado' && servico) {
        atribuicao = await tentarAtribuicaoAutomatica({
          chamadoId: aberto.chamadoId,
          solicitanteId: viewer.userId,
          subtypeId: servico.subtypeId,
          titulo,
          ticketNumber: aberto.ticketNumber,
        }).catch((err: unknown): AtribuicaoResultado => {
          // O contrato do passo é nunca lançar; se lançar mesmo assim, o chamado
          // já existe e a pessoa não pode receber um erro por isso.
          registrar({
            conversaId,
            chamadoId: aberto.chamadoId,
            aviso: 'atribuicao_indisponivel',
            erro: err instanceof Error ? err.name : 'desconhecido',
          });
          return { resultado: 'nao_tentada' };
        });
      }

      const aviso = await enviarMensagem({
        viewer,
        conversaId,
        autor: 'sistema',
        tipo: 'texto',
        texto: fraseDeChamadoAberto(aberto.ticketNumber, {
          validado: statusChamado === 'validado',
          finalPriority:
            statusChamado === 'validado' ? (proposta.prioridade?.prioridade ?? null) : null,
          atribuicao,
        }),
      });
      if (!aviso.ok) {
        registrar({ conversaId, chamadoId: aberto.chamadoId, aviso: aviso.reason });
      }

      // A gestão fica sabendo como no formulário. Falha aqui não desfaz o chamado.
      await notificarNovoChamado({
        chamadoId: aberto.chamadoId,
        ticketNumber: aberto.ticketNumber,
        titulo,
        solicitanteId: viewer.userId,
        jaValidado: statusChamado === 'validado',
        // `nao_tentada` não muda o aviso: vale o texto da 0007.
        ...(atribuicao.resultado !== 'nao_tentada' ? { atribuicao } : {}),
      }).catch((err) => {
        console.error(
          '[abertura]',
          JSON.stringify({
            conversaId,
            chamadoId: aberto.chamadoId,
            notificacao: err instanceof Error ? err.message : 'unknown',
          }),
        );
      });
    }

    registrar({ conversaId, chamadoId: aberto.chamadoId, modo, jaExistia: aberto.jaExistia });

    return {
      ok: true,
      chamadoId: aberto.chamadoId,
      ticketNumber: aberto.ticketNumber,
      jaExistia: aberto.jaExistia,
    };
  } catch (err) {
    console.error(
      '[abertura]',
      JSON.stringify({ conversaId, error: err instanceof Error ? err.message : 'unknown' }),
    );
    return falha('erro');
  }
}

/** `sem_permissao` sai como `nao_encontrada`, como nas rotas da spec 0003. */
function traduzir(reason: ConversaFalha): ConfirmacaoFalha {
  return reason === 'sem_permissao' ? 'nao_encontrada' : reason;
}
