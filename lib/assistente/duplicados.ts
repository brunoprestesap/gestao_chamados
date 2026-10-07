import 'server-only';

import { Types } from 'mongoose';

import type { Viewer } from '@/lib/conversas';
import { AtivoModel } from '@/models/Ativo';
import { ChamadoModel } from '@/models/Chamado';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import {
  CHAMADO_STATUS_EM_ANDAMENTO,
  type ChamadoStatus,
  SERVICO_A_DEFINIR,
} from '@/shared/chamados/chamado.constants';
import {
  type CartaoPayload,
  DECISAO_ROTULO_MAX,
  type DuplicadoDoCartao,
  LOCAL_EXATO_MAX,
} from '@/shared/conversas/conversa.schemas';

import { palavrasDoLocal } from './ativo-do-cartao';
import { DUPLICADOS_CARTAO_MAX, DUPLICADOS_LEITURA_MAX } from './config';

/**
 * O aviso de chamado duplicado (spec 0017, AC-1 a AC-6). Procura chamados em
 * andamento que parecem ser o mesmo problema do cartão: pelo mesmo
 * equipamento, ou pelo mesmo subtipo de serviço na mesma unidade com alguma
 * palavra do local em comum. É só regra: nunca chama o modelo.
 *
 * Nada aqui lança: falha de banco devolve `null`, e o cartão segue sem aviso.
 */

export type CartaoParaDuplicados = Pick<
  CartaoPayload,
  'modo' | 'servico' | 'unidade' | 'localExato' | 'ativo'
>;

type ChamadoLido = {
  _id: Types.ObjectId;
  ticket_number: string;
  solicitanteId: Types.ObjectId;
  assignedToUserId?: Types.ObjectId | null;
  unitId: Types.ObjectId;
  localExato?: string | null;
  catalogServiceId?: Types.ObjectId | null;
  ativoId?: Types.ObjectId | null;
  status: ChamadoStatus;
  createdAt: Date;
};

const PROJECAO = {
  ticket_number: 1,
  solicitanteId: 1,
  assignedToUserId: 1,
  unitId: 1,
  localExato: 1,
  catalogServiceId: 1,
  ativoId: 1,
  status: 1,
  createdAt: 1,
} as const;

/**
 * Os ativos com sinal de identidade (AC-1): todo candidato do código digitado,
 * ou o candidato único da regra. Dois a cinco candidatos da regra são palpite.
 */
export function ativosComIdentidade(ativo: CartaoPayload['ativo']): string[] {
  if (!ativo) return [];
  if (ativo.origem === 'codigo') return ativo.candidatos.map((c) => c.ativoId);
  return ativo.candidatos.length === 1 ? [ativo.candidatos[0].ativoId] : [];
}

/** Ramo do equipamento (AC-1): qualquer modo, sem olhar unidade nem serviço. */
async function porEquipamento(ativoIds: string[]): Promise<ChamadoLido[]> {
  if (ativoIds.length === 0) return [];
  return ChamadoModel.find({
    ativoId: { $in: ativoIds.map((id) => new Types.ObjectId(id)) },
    status: { $in: CHAMADO_STATUS_EM_ANDAMENTO },
  })
    .select(PROJECAO)
    .sort({ createdAt: -1 })
    .limit(DUPLICADOS_LEITURA_MAX)
    .lean<ChamadoLido[]>();
}

/**
 * Ramo da regra (AC-2, AC-3): só cartão `ia` com unidade e local. A leitura
 * pega os mais recentes do mesmo subtipo na unidade, e o filtro de palavras
 * roda aqui, sobre ela (AC-4).
 */
async function porRegra(cartao: CartaoParaDuplicados): Promise<ChamadoLido[]> {
  if (cartao.modo !== 'ia' || !cartao.servico || !cartao.unidade) return [];
  const palavras = palavrasDoLocal(cartao.localExato);
  if (palavras.length === 0) return [];

  const lidos = await ChamadoModel.find({
    unitId: new Types.ObjectId(cartao.unidade.unitId),
    tipoServico: cartao.servico.tipoServico,
    subtypeId: new Types.ObjectId(cartao.servico.subtypeId),
    status: { $in: CHAMADO_STATUS_EM_ANDAMENTO },
  })
    .select(PROJECAO)
    .sort({ createdAt: -1 })
    .limit(DUPLICADOS_LEITURA_MAX)
    .lean<ChamadoLido[]>();

  return lidos.filter((c) => palavrasEmComum(palavras, c.localExato) > 0);
}

function palavrasEmComum(doCartao: readonly string[], local: string | null | undefined): number {
  const doChamado = new Set(palavrasDoLocal(local));
  return doCartao.filter((p) => doChamado.has(p)).length;
}

type Ordenavel = { chamado: ChamadoLido; doEquipamento: boolean; palavras: number };

/**
 * Junta os dois ramos sem repetição e ordena (AC-4): o do equipamento
 * primeiro, depois mais palavras do local em comum, depois o mais recente.
 */
export function juntarEOrdenar(
  doEquipamento: readonly ChamadoLido[],
  daRegra: readonly ChamadoLido[],
  localDoCartao: string | null,
): ChamadoLido[] {
  const palavras = palavrasDoLocal(localDoCartao);
  const porId = new Map<string, Ordenavel>();
  for (const chamado of doEquipamento) {
    porId.set(String(chamado._id), {
      chamado,
      doEquipamento: true,
      palavras: palavrasEmComum(palavras, chamado.localExato),
    });
  }
  for (const chamado of daRegra) {
    if (porId.has(String(chamado._id))) continue;
    porId.set(String(chamado._id), {
      chamado,
      doEquipamento: false,
      palavras: palavrasEmComum(palavras, chamado.localExato),
    });
  }

  return [...porId.values()]
    .sort(
      (a, b) =>
        Number(b.doEquipamento) - Number(a.doEquipamento) ||
        b.palavras - a.palavras ||
        b.chamado.createdAt.getTime() - a.chamado.createdAt.getTime(),
    )
    .map((o) => o.chamado);
}

async function rotulosDosServicos(chamados: readonly ChamadoLido[]): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      chamados
        .map((c) => c.catalogServiceId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  if (ids.length === 0) return new Map();
  const servicos = await ServiceCatalogModel.find({ _id: { $in: ids } })
    .select('name')
    .lean<{ _id: Types.ObjectId; name: string }[]>();
  return new Map(servicos.map((s) => [String(s._id), s.name]));
}

async function codigosDosAtivos(chamados: readonly ChamadoLido[]): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      chamados
        .map((c) => c.ativoId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  if (ids.length === 0) return new Map();
  const ativos = await AtivoModel.find({ _id: { $in: ids } })
    .select('codigo')
    .lean<{ _id: Types.ObjectId; codigo: string }[]>();
  return new Map(ativos.map((a) => [String(a._id), a.codigo]));
}

function paraItem(params: {
  chamado: ChamadoLido;
  viewer: Viewer;
  unidadeDoCartao: string | null;
  rotulos: Map<string, string>;
  codigos: Map<string, string>;
}): DuplicadoDoCartao {
  const { chamado, viewer, unidadeDoCartao, rotulos, codigos } = params;
  const proprio = String(chamado.solicitanteId) === viewer.userId;
  const gestao = viewer.role === 'Admin' || viewer.role === 'Preposto';
  const tecnico = chamado.assignedToUserId
    ? String(chamado.assignedToUserId) === viewer.userId
    : false;

  // O local digitado por alguém de outra unidade não aparece (AC-6).
  const mesmaUnidade = unidadeDoCartao !== null && String(chamado.unitId) === unidadeDoCartao;
  const local = (chamado.localExato ?? '').trim();
  const localExato = (proprio || mesmaUnidade) && local ? local.slice(0, LOCAL_EXATO_MAX) : null;

  const rotulo = chamado.catalogServiceId ? rotulos.get(String(chamado.catalogServiceId)) : null;

  return {
    chamadoId: String(chamado._id),
    ticketNumber: chamado.ticket_number,
    rotuloServico: (rotulo || SERVICO_A_DEFINIR).slice(0, DECISAO_ROTULO_MAX),
    localExato,
    ativoCodigo: chamado.ativoId ? (codigos.get(String(chamado.ativoId)) ?? null) : null,
    status: chamado.status,
    abertoEm: chamado.createdAt.toISOString(),
    proprio,
    jaTemAcesso: !proprio && (gestao || tecnico),
  };
}

export async function buscarDuplicados(params: {
  conversaId: string;
  viewer: Viewer;
  cartao: CartaoParaDuplicados;
}): Promise<DuplicadoDoCartao[] | null> {
  const { conversaId, viewer, cartao } = params;
  try {
    const [doEquipamento, daRegra] = await Promise.all([
      porEquipamento(ativosComIdentidade(cartao.ativo)),
      porRegra(cartao),
    ]);
    const escolhidos = juntarEOrdenar(doEquipamento, daRegra, cartao.localExato).slice(
      0,
      DUPLICADOS_CARTAO_MAX,
    );
    if (escolhidos.length === 0) return null;

    const [rotulos, codigos] = await Promise.all([
      rotulosDosServicos(escolhidos),
      codigosDosAtivos(escolhidos),
    ]);
    const unidadeDoCartao = cartao.unidade?.unitId ?? null;
    return escolhidos.map((chamado) =>
      paraItem({ chamado, viewer, unidadeDoCartao, rotulos, codigos }),
    );
  } catch (err) {
    // Nunca número, local nem texto no log (AC-20).
    console.error(
      '[assistente]',
      JSON.stringify({
        operacao: 'buscarDuplicados',
        conversaId,
        error: err instanceof Error ? err.name : 'unknown',
      }),
    );
    return null;
  }
}
