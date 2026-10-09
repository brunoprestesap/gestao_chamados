import 'server-only';

import { Types } from 'mongoose';

import { gravarHistoricoOuDesfazer } from '@/lib/ativos/auditoria';
import { ChamadoModel, type MaterialForaCotacaoDoc } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { CotacaoModel } from '@/models/Cotacao';
import { centavos, formatarReais, textoDoItem } from '@/shared/chamados/custo';
import {
  custoEditavel,
  MAX_MATERIAIS_CHAMADO,
  MENSAGENS_CUSTO,
  STATUS_CUSTO_EDITAVEL,
} from '@/shared/chamados/custo.constants';
import type {
  AdicionarMaterialInput,
  EditarMaterialInput,
  RemoverMaterialInput,
  ValorFinalCotacaoInput,
} from '@/shared/chamados/custo.schemas';

/**
 * As escritas de custo do chamado (spec 0018). Sem transação: cada escrita é
 * uma operação atômica num documento só, e o histórico passa por
 * `gravarHistoricoOuDesfazer`. Erro de regra volta como `{ ok: false }`; erro
 * inesperado sobe e a action devolve "tente de novo".
 */

export type ResultadoCusto = { ok: true } | { ok: false; error: string };

const STATUS_EDITAVEL = [...STATUS_CUSTO_EDITAVEL];

/**
 * Quando a gravação atômica não acha documento, relê o chamado para escolher
 * a mensagem, nesta ordem (AC-2a): chamado, status, item, teto.
 */
async function motivoDaRecusa(chamadoId: string, itemId?: string): Promise<string> {
  const c = await ChamadoModel.findById(chamadoId)
    .select('status materiaisForaCotacao._id')
    .lean<{ status: string; materiaisForaCotacao?: { _id: Types.ObjectId }[] }>();
  if (!c) return MENSAGENS_CUSTO.chamadoNaoEncontrado;
  if (!custoEditavel(c.status)) return MENSAGENS_CUSTO.statusTravado;
  const itens = c.materiaisForaCotacao ?? [];
  if (itemId && !itens.some((i) => String(i._id) === itemId)) return MENSAGENS_CUSTO.itemNaoExiste;
  if (!itemId && itens.length >= MAX_MATERIAIS_CHAMADO) return MENSAGENS_CUSTO.tetoItens;
  return MENSAGENS_CUSTO.falhaInesperada;
}

function historico(
  chamadoId: Types.ObjectId | string,
  userId: string,
  action: string,
  observacoes: string,
) {
  return ChamadoHistoryModel.create({
    chamadoId,
    userId: new Types.ObjectId(userId),
    action,
    observacoes,
  });
}

/** Só o item pedido, para devolver o estado de antes da gravação. */
function projecaoDoItem(itemId: string) {
  return { materiaisForaCotacao: { $elemMatch: { _id: new Types.ObjectId(itemId) } } };
}

export async function adicionarMaterial(
  entrada: AdicionarMaterialInput,
  userId: string,
): Promise<ResultadoCusto & { itemId?: string }> {
  const itemId = new Types.ObjectId();
  const item = {
    _id: itemId,
    descricao: entrada.descricao,
    quantidade: entrada.quantidade,
    valorUnitario: entrada.valorUnitario,
    criadoPorUserId: new Types.ObjectId(userId),
    criadoEm: new Date(),
  };
  // O teto vai no filtro: duas gravações simultâneas nunca passam de 50 (AC-4).
  const r = await ChamadoModel.updateOne(
    {
      _id: entrada.chamadoId,
      status: { $in: STATUS_EDITAVEL },
      [`materiaisForaCotacao.${MAX_MATERIAIS_CHAMADO - 1}`]: { $exists: false },
    },
    { $push: { materiaisForaCotacao: item } },
  );
  if (r.matchedCount === 0) return { ok: false, error: await motivoDaRecusa(entrada.chamadoId) };

  await gravarHistoricoOuDesfazer(
    () => historico(entrada.chamadoId, userId, 'custo_material_lancado', textoDoItem(item)),
    () =>
      ChamadoModel.updateOne(
        { _id: entrada.chamadoId },
        { $pull: { materiaisForaCotacao: { _id: itemId } } },
      ),
  );
  return { ok: true, itemId: String(itemId) };
}

export async function editarMaterial(
  entrada: EditarMaterialInput,
  userId: string,
): Promise<ResultadoCusto> {
  const itemId = new Types.ObjectId(entrada.itemId);
  // Só os três campos editáveis; `criadoPorUserId` e `criadoEm` nunca mudam.
  const antes = await ChamadoModel.findOneAndUpdate(
    {
      _id: entrada.chamadoId,
      status: { $in: STATUS_EDITAVEL },
      'materiaisForaCotacao._id': itemId,
    },
    {
      $set: {
        'materiaisForaCotacao.$.descricao': entrada.descricao,
        'materiaisForaCotacao.$.quantidade': entrada.quantidade,
        'materiaisForaCotacao.$.valorUnitario': entrada.valorUnitario,
      },
    },
    { projection: projecaoDoItem(entrada.itemId) },
  ).lean<{ materiaisForaCotacao?: MaterialForaCotacaoDoc[] }>();
  const velho = antes?.materiaisForaCotacao?.[0];
  if (!velho) return { ok: false, error: await motivoDaRecusa(entrada.chamadoId, entrada.itemId) };

  await gravarHistoricoOuDesfazer(
    () =>
      historico(
        entrada.chamadoId,
        userId,
        'custo_material_editado',
        `de ${textoDoItem(velho)} para ${textoDoItem(entrada)}`,
      ),
    () =>
      ChamadoModel.updateOne(
        { _id: entrada.chamadoId, 'materiaisForaCotacao._id': itemId },
        {
          $set: {
            'materiaisForaCotacao.$.descricao': velho.descricao,
            'materiaisForaCotacao.$.quantidade': velho.quantidade,
            'materiaisForaCotacao.$.valorUnitario': velho.valorUnitario,
          },
        },
      ),
  );
  return { ok: true };
}

export async function removerMaterial(
  entrada: RemoverMaterialInput,
  userId: string,
): Promise<ResultadoCusto> {
  const itemId = new Types.ObjectId(entrada.itemId);
  const antes = await ChamadoModel.findOneAndUpdate(
    {
      _id: entrada.chamadoId,
      status: { $in: STATUS_EDITAVEL },
      'materiaisForaCotacao._id': itemId,
    },
    { $pull: { materiaisForaCotacao: { _id: itemId } } },
    { projection: projecaoDoItem(entrada.itemId) },
  ).lean<{ materiaisForaCotacao?: MaterialForaCotacaoDoc[] }>();
  const velho = antes?.materiaisForaCotacao?.[0];
  if (!velho) return { ok: false, error: await motivoDaRecusa(entrada.chamadoId, entrada.itemId) };

  // A cópia do item removido fica no histórico (AC-2).
  await gravarHistoricoOuDesfazer(
    () => historico(entrada.chamadoId, userId, 'custo_material_removido', textoDoItem(velho)),
    () =>
      ChamadoModel.updateOne(
        { _id: entrada.chamadoId },
        { $push: { materiaisForaCotacao: velho } },
      ),
  );
  return { ok: true };
}

function textoDoValorFinal(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? 'estimado' : formatarReais(centavos(valor));
}

/**
 * Valor final da cotação aprovada (AC-5). A cotação e o chamado moram em
 * coleções diferentes: o status do chamado é lido logo antes, e fica aceita a
 * janela mínima em que ele é encerrado entre a leitura e a gravação.
 */
export async function informarValorFinalCotacao(
  entrada: ValorFinalCotacaoInput,
  userId: string,
): Promise<ResultadoCusto> {
  const cotacao = await CotacaoModel.findById(entrada.cotacaoId)
    .select('status chamadoId valorFinal valorFinalPorUserId valorFinalEm')
    .lean();
  if (!cotacao) return { ok: false, error: MENSAGENS_CUSTO.cotacaoNaoEncontrada };
  if (cotacao.status !== 'aprovada')
    return { ok: false, error: MENSAGENS_CUSTO.cotacaoNaoAprovada };

  const chamado = await ChamadoModel.findById(cotacao.chamadoId).select('status').lean();
  if (!chamado) return { ok: false, error: MENSAGENS_CUSTO.chamadoNaoEncontrado };
  if (!custoEditavel(chamado.status)) return { ok: false, error: MENSAGENS_CUSTO.statusTravado };

  const r = await CotacaoModel.updateOne(
    { _id: entrada.cotacaoId, status: 'aprovada' },
    {
      $set: {
        valorFinal: entrada.valorFinal,
        valorFinalPorUserId: new Types.ObjectId(userId),
        valorFinalEm: new Date(),
      },
    },
  );
  if (r.matchedCount === 0) return { ok: false, error: MENSAGENS_CUSTO.cotacaoNaoAprovada };

  await gravarHistoricoOuDesfazer(
    () =>
      historico(
        cotacao.chamadoId,
        userId,
        'cotacao_valor_final',
        `Valor final de ${textoDoValorFinal(cotacao.valorFinal)} para ${textoDoValorFinal(
          entrada.valorFinal,
        )}`,
      ),
    () =>
      CotacaoModel.updateOne(
        { _id: entrada.cotacaoId },
        {
          $set: {
            valorFinal: cotacao.valorFinal ?? null,
            valorFinalPorUserId: cotacao.valorFinalPorUserId ?? null,
            valorFinalEm: cotacao.valorFinalEm ?? null,
          },
        },
      ),
  );
  return { ok: true };
}
