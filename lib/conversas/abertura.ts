import 'server-only';

import { Types } from 'mongoose';

import { generateTicketNumber } from '@/lib/chamado-utils';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ConversaModel } from '@/models/Conversa';
import { ConversaMensagemModel } from '@/models/ConversaMensagem';
import { DecisaoIaModel } from '@/models/DecisaoIa';

import { TICKET_NUMBER_TENTATIVAS } from './config';
import {
  buscarConversa,
  garantirHistoricoAbertura,
  registrarErro,
  repararSePreciso,
  reservaAindaMinha,
  reservar,
  soltarReserva,
} from './conversa-store';
import { derivarIaSituacao, garantirHistoricoDecisao, gravarDecisao } from './decisoes';
import type { AberturaResultado, DadosChamado, DecisaoEntrada, Falha, Viewer } from './types';

/**
 * A conversa vira chamado (spec 0002, AC-3 a AC-5).
 *
 * São cinco passos sem transação, todos repetíveis sem efeito duplo e todos
 * condicionais ao mesmo `chamadoIdReservado`. O chamado é o ponto de virada:
 * decisão gravada antes dele só passa a valer quando ele existe, e decisão
 * órfã é apagada no reparo.
 */

const falha = (reason: Falha['reason']): Falha => ({ ok: false, reason });

/** Qual chave única colidiu, quando o Mongo recusa a gravação. */
function chaveDuplicada(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  if (e.code !== 11000) return null;
  const chaves = Object.keys(e.keyPattern ?? {});
  return chaves[0] ?? 'desconhecida';
}

export type AbrirChamadoParams = {
  viewer: Viewer;
  conversaId: string;
  /** Campos do chamado montados por quem chama; sem `_id` e sem número. */
  dadosChamado: DadosChamado;
  decisoes?: DecisaoEntrada[];
};

export async function abrirChamadoDaConversa(
  params: AbrirChamadoParams,
): Promise<AberturaResultado> {
  const decisoes = params.decisoes ?? [];

  try {
    await dbConnect();

    const encontrada = await buscarConversa(params.conversaId);
    if (!encontrada) return falha('nao_encontrada');
    if (String(encontrada.solicitanteId) !== params.viewer.userId) return falha('sem_permissao');

    // Uma confirmação anterior pode ter parado no meio. O reparo completa o que
    // faltou, ou desfaz a reserva abandonada, antes de tentar de novo (AC-5).
    const conversa = await repararSePreciso(encontrada);

    // Já virou chamado: devolve o mesmo id, sem criar nada.
    if (conversa.chamadoId) {
      const existente = await ChamadoModel.findById(conversa.chamadoId)
        .select('ticket_number')
        .lean();
      if (existente) {
        return {
          ok: true,
          chamadoId: String(conversa.chamadoId),
          ticketNumber: String(existente.ticket_number),
          jaExistia: true,
        };
      }
    }

    // ---- Passo 1: reserva, em uma única gravação condicional ----
    const agora = new Date();
    const reserva = await reservar(params.conversaId, params.viewer.userId, agora);
    if (!reserva) return falha('confirmacao_em_andamento');

    const chamadoId = reserva.chamadoIdReservado;
    const chamadoObjectId = new Types.ObjectId(chamadoId);

    // ---- Passo 2: decisões, com o id reservado ----
    const gravadas: {
      id: string;
      campo: DecisaoEntrada['campo'];
      rotulo: string;
      decididoPor: 'ia' | 'regra';
    }[] = [];
    for (const decisao of decisoes) {
      if (!(await reservaAindaMinha(params.conversaId, chamadoId))) {
        return falha('confirmacao_em_andamento');
      }
      const gravada = await gravarDecisao({
        ...decisao,
        chamadoId,
        conversaId: params.conversaId,
        confirmadoPorUserId: params.viewer.userId,
      });
      if (!gravada) {
        // Valor reprovado: nada foi criado além de decisões válidas anteriores,
        // que o reparo apaga por serem órfãs deste id reservado.
        await DecisaoIaModel.deleteMany({ chamadoId: chamadoObjectId });
        await soltarReserva(params.conversaId, chamadoId, conversa.ultimaMensagemEm);
        return falha('invalida');
      }
      gravadas.push({
        id: gravada.id,
        campo: decisao.campo,
        rotulo: gravada.valorFinal.rotulo,
        decididoPor: decisao.decididoPor,
      });
    }

    // ---- Passo 3: o chamado, com o `_id` reservado ----
    const criado = await criarChamado({
      chamadoId: chamadoObjectId,
      conversaId: new Types.ObjectId(params.conversaId),
      dados: params.dadosChamado,
      iaSituacao: derivarIaSituacao(decisoes),
    });
    if (!criado) return falha('erro');

    // ---- Passo 4: histórico (uma `abertura` e uma `decisao_ia` por decisão) ----
    await garantirHistoricoAbertura(chamadoId, params.viewer.userId);
    for (const gravada of gravadas) {
      await garantirHistoricoDecisao({
        chamadoId,
        decisaoIaId: gravada.id,
        campo: gravada.campo,
        rotulo: gravada.rotulo,
        decididoPor: gravada.decididoPor,
      });
    }

    // ---- Passo 5: o vínculo, condicional ao mesmo id reservado ----
    await ConversaModel.updateOne(
      { _id: params.conversaId, chamadoIdReservado: chamadoObjectId, chamadoId: null },
      { $set: { chamadoId: chamadoObjectId, expiresAt: null, vinculandoEm: null } },
    );
    await ConversaMensagemModel.updateMany(
      { conversaId: params.conversaId },
      { $set: { expiresAt: null } },
    );

    return {
      ok: true,
      chamadoId,
      ticketNumber: criado.ticketNumber,
      jaExistia: criado.jaExistia,
    };
  } catch (err) {
    registrarErro('abrirChamadoDaConversa', { conversaId: params.conversaId }, err);
    return falha('erro');
  }
}

/**
 * Passo 3. Cria o chamado com o `_id` reservado. Número repetido gera outro
 * número e tenta de novo; `_id` ou `conversaId` repetido quer dizer que o
 * chamado já existe, e aí o resultado é o mesmo com `jaExistia: true`.
 */
async function criarChamado(params: {
  chamadoId: Types.ObjectId;
  conversaId: Types.ObjectId;
  dados: DadosChamado;
  iaSituacao: string;
}): Promise<{ ticketNumber: string; jaExistia: boolean } | null> {
  for (let tentativa = 0; tentativa < TICKET_NUMBER_TENTATIVAS; tentativa += 1) {
    const ticketNumber = await generateTicketNumber();
    try {
      await ChamadoModel.create({
        ...params.dados,
        _id: params.chamadoId,
        ticket_number: ticketNumber,
        conversaId: params.conversaId,
        canalAbertura: 'chat',
        iaSituacao: params.iaSituacao,
      });
      return { ticketNumber, jaExistia: false };
    } catch (err) {
      const chave = chaveDuplicada(err);
      if (chave === 'ticket_number') continue;
      if (chave === '_id' || chave === 'conversaId') {
        const existente = await ChamadoModel.findById(params.chamadoId)
          .select('ticket_number')
          .lean();
        if (existente) {
          return { ticketNumber: String(existente.ticket_number), jaExistia: true };
        }
      }
      throw err;
    }
  }
  return null;
}
