import 'server-only';

import { Types } from 'mongoose';

import { ehChaveDuplicada, falha, type Resultado } from '@/lib/ativos/erros';
import { ContratoModel } from '@/models/Contrato';
import { RelatorioContratoEmissaoModel } from '@/models/RelatorioContratoEmissao';
import type { ContratoValidado } from '@/shared/contratos/contrato.schemas';
import { formatarMes, formatarYmd, janelaDoMes } from '@/shared/contratos/janela';

/**
 * Regras de escrita do cadastro de contratos (spec 0016, AC-2 a AC-4). Quem
 * chama já conferiu o perfil (Admin), validou com Zod e conectou ao banco.
 * Nunca lança para regra de negócio; erro inesperado sobe para a action.
 */

type Periodo = { tiposServico: readonly string[]; vigenciaInicio: string; vigenciaFim: string };

type ContratoLido = Periodo & { _id: Types.ObjectId; numero: string; isActive: boolean };

/**
 * Outro contrato (ativo ou inativo) com um tipo em comum e vigência que se
 * cruza (`inicioA <= fimB` e `inicioB <= fimA`). A corrida entre dois Admins
 * salvando ao mesmo tempo é aceita (spec 0016, Decision).
 */
export async function conferirSobreposicao(
  dados: Periodo,
  ignorarId?: string,
): Promise<string | null> {
  const outro = await ContratoModel.findOne({
    ...(ignorarId ? { _id: { $ne: new Types.ObjectId(ignorarId) } } : {}),
    tiposServico: { $in: [...dados.tiposServico] },
    vigenciaInicio: { $lte: dados.vigenciaFim },
    vigenciaFim: { $gte: dados.vigenciaInicio },
  })
    .select('numero tiposServico vigenciaInicio vigenciaFim')
    .lean<ContratoLido | null>();
  if (!outro) return null;
  const tipo = outro.tiposServico.find((t) => dados.tiposServico.includes(t)) ?? '';
  return `O contrato ${outro.numero} já cobre ${tipo} de ${formatarYmd(outro.vigenciaInicio)} a ${formatarYmd(outro.vigenciaFim)}.`;
}

/**
 * A trava dos meses já emitidos (AC-3): tirar um tipo, ou estreitar a janela
 * de um mês que tem emissão, é recusado. Estender e acrescentar tipo passam.
 */
export function conferirMesesEmitidos(
  antes: Periodo,
  depois: Periodo,
  mesesEmitidos: readonly string[],
): string | null {
  const mensagem = (mes: string) =>
    `Já há relatório emitido para ${formatarMes(mes)}; a vigência e os tipos desse período não podem mudar.`;
  const ordenados = [...mesesEmitidos].sort();
  if (ordenados.length === 0) return null;

  const perdeuTipo = antes.tiposServico.some((t) => !depois.tiposServico.includes(t));
  if (perdeuTipo) return mensagem(ordenados[0]!);

  for (const mes of ordenados) {
    const velha = janelaDoMes(mes, antes.vigenciaInicio, antes.vigenciaFim);
    const coberto =
      depois.vigenciaInicio.slice(0, 7) <= mes && depois.vigenciaFim.slice(0, 7) >= mes;
    if (!coberto) return mensagem(mes);
    const nova = janelaDoMes(mes, depois.vigenciaInicio, depois.vigenciaFim);
    if (nova.inicioYmd > velha.inicioYmd || nova.fimYmd < velha.fimYmd) return mensagem(mes);
  }
  return null;
}

function camposGravados(d: ContratoValidado) {
  return {
    numero: d.numero,
    numeroNormalizado: d.numero.toLowerCase(),
    empresa: d.empresa,
    cnpj: d.cnpj,
    processoSei: d.processoSei,
    objeto: d.objeto,
    fiscal: d.fiscal,
    tiposServico: d.tiposServico,
    vigenciaInicio: d.vigenciaInicio,
    vigenciaFim: d.vigenciaFim,
  };
}

const numeroRepetido = (numero: string) => falha(`Já existe um contrato com o número ${numero}.`);

export async function criarContrato(d: ContratoValidado): Promise<Resultado<{ id: string }>> {
  const sobreposto = await conferirSobreposicao(d);
  if (sobreposto) return falha(sobreposto);
  try {
    const criado = await ContratoModel.create({ ...camposGravados(d), isActive: true });
    return { ok: true, id: String(criado._id) };
  } catch (e) {
    if (ehChaveDuplicada(e)) return numeroRepetido(d.numero);
    throw e;
  }
}

export async function editarContrato(id: string, d: ContratoValidado): Promise<Resultado> {
  const atual = await ContratoModel.findById(id)
    .select('numero tiposServico vigenciaInicio vigenciaFim isActive')
    .lean<ContratoLido | null>();
  if (!atual) return falha('Contrato não encontrado.');

  const mesesEmitidos: string[] = await RelatorioContratoEmissaoModel.distinct('mes', {
    contratoId: atual._id,
  });
  const travado = conferirMesesEmitidos(atual, d, mesesEmitidos);
  if (travado) return falha(travado);

  const sobreposto = await conferirSobreposicao(d, id);
  if (sobreposto) return falha(sobreposto);

  try {
    await ContratoModel.updateOne({ _id: atual._id }, { $set: camposGravados(d) });
    return { ok: true };
  } catch (e) {
    if (ehChaveDuplicada(e)) return numeroRepetido(d.numero);
    throw e;
  }
}

/** Inativar nunca é barrado; reativar passa pela checagem de sobreposição (AC-3 e AC-4). */
export async function alterarSituacaoContrato(id: string, isActive: boolean): Promise<Resultado> {
  const atual = await ContratoModel.findById(id)
    .select('numero tiposServico vigenciaInicio vigenciaFim isActive')
    .lean<ContratoLido | null>();
  if (!atual) return falha('Contrato não encontrado.');
  if (isActive && !atual.isActive) {
    const sobreposto = await conferirSobreposicao(atual, id);
    if (sobreposto) return falha(sobreposto);
  }
  await ContratoModel.updateOne({ _id: atual._id }, { $set: { isActive } });
  return { ok: true };
}
