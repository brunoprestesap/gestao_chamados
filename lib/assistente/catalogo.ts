import 'server-only';

import { Types } from 'mongoose';

import { dbConnect } from '@/lib/db';
import { ServiceCatalogModel } from '@/models/ServiceCatalog';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
import { ServiceTypeModel } from '@/models/ServiceType';
import { type TipoServico, tipoServicoDoNomeDoTipo } from '@/shared/chamados/tipo-servico';
import { DECISAO_ROTULO_MAX } from '@/shared/conversas/conversa.schemas';

import { CATALOGO_DESCRICAO_MAX, CATALOGO_PROMPT_MAX_CARACTERES } from './config';

/**
 * O catálogo ativo como o modelo o lê, e o caminho de volta do código para os
 * ids (spec 0004, AC-2 e AC-3). É lido do banco a cada chamada: serviço
 * desativado some do prompt na mensagem seguinte.
 */

export type ServicoDoCatalogo = {
  code: string;
  catalogServiceId: string;
  subtypeId: string;
  /** Nulo quando o nome do tipo não corresponde a nenhuma opção fixa: o código não vale. */
  tipoServico: TipoServico | null;
  nome: string;
  subtipo: string;
};

export type CatalogoParaPrompt = {
  /** As linhas do prompt. Nulo quando o catálogo está vazio ou acima do teto. */
  bloco: string | null;
  /** Tamanho do bloco montado, mesmo quando ele não vai no prompt. */
  tamanho: number;
  acimaDoTeto: boolean;
  porCodigo: Map<string, ServicoDoCatalogo>;
  /** De `catalogServiceId` para `code`, para devolver a proposta atual ao prompt. */
  codigoPorId: Map<string, string>;
};

/** Uma linha só, sem quebras, para o modelo não confundir um serviço com o seguinte. */
function limpar(texto: unknown): string {
  return String(texto ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** O código como o catálogo guarda: maiúsculo e sem espaço. */
export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

export async function lerCatalogoParaPrompt(): Promise<CatalogoParaPrompt> {
  await dbConnect();

  const [servicos, subtipos, tipos] = await Promise.all([
    ServiceCatalogModel.find({ isActive: true })
      .select('code name description subtypeId typeId')
      .sort({ code: 1 })
      .lean(),
    ServiceSubTypeModel.find({ isActive: true }).select('name').lean(),
    ServiceTypeModel.find({ isActive: true }).select('name').lean(),
  ]);

  const nomeDoSubtipo = new Map(subtipos.map((s) => [String(s._id), limpar(s.name)]));
  const nomeDoTipo = new Map(tipos.map((t) => [String(t._id), limpar(t.name)]));

  const linhas: string[] = [];
  const porCodigo = new Map<string, ServicoDoCatalogo>();
  const codigoPorId = new Map<string, string>();

  for (const servico of servicos) {
    const subtipo = nomeDoSubtipo.get(String(servico.subtypeId));
    const tipo = nomeDoTipo.get(String(servico.typeId));
    // Só entra serviço cujo subtipo e tipo também estão ativos.
    if (subtipo === undefined || tipo === undefined) continue;

    const code = normalizarCodigo(String(servico.code));
    const nome = limpar(servico.name);
    const descricao = limpar(servico.description).slice(0, CATALOGO_DESCRICAO_MAX);

    linhas.push([code, nome, subtipo, tipo, descricao].join(' | '));
    porCodigo.set(code, {
      code,
      catalogServiceId: String(servico._id),
      subtypeId: String(servico.subtypeId),
      tipoServico: tipoServicoDoNomeDoTipo(tipo),
      nome,
      subtipo,
    });
    codigoPorId.set(String(servico._id), code);
  }

  const bloco = linhas.join('\n');
  const acimaDoTeto = bloco.length > CATALOGO_PROMPT_MAX_CARACTERES;

  return {
    bloco: bloco && !acimaDoTeto ? bloco : null,
    tamanho: bloco.length,
    acimaDoTeto,
    // Acima do teto o modelo não viu o catálogo: nenhum código pode valer.
    porCodigo: acimaDoTeto ? new Map() : porCodigo,
    codigoPorId,
  };
}

export type ServicoAtivo = {
  catalogServiceId: string;
  subtypeId: string;
  tipoServico: TipoServico;
  rotuloServico: string;
  rotuloSubtipo: string;
};

/**
 * O serviço ainda vale? Ativo, com subtipo e tipo ativos, do subtipo informado
 * e com o tipo reconhecido como opção fixa. Devolve os rótulos lidos do banco,
 * que são os únicos que o cartão e o título mostram (AC-5, AC-10).
 */
export async function lerServicoAtivo(
  catalogServiceId: string,
  subtypeId: string,
): Promise<ServicoAtivo | null> {
  if (!Types.ObjectId.isValid(catalogServiceId) || !Types.ObjectId.isValid(subtypeId)) return null;

  await dbConnect();

  const servico = await ServiceCatalogModel.findOne({ _id: catalogServiceId, isActive: true })
    .select('name subtypeId typeId')
    .lean();
  if (!servico || String(servico.subtypeId) !== subtypeId) return null;

  const [subtipo, tipo] = await Promise.all([
    ServiceSubTypeModel.findOne({ _id: servico.subtypeId, isActive: true }).select('name').lean(),
    ServiceTypeModel.findOne({ _id: servico.typeId, isActive: true }).select('name').lean(),
  ]);
  if (!subtipo || !tipo) return null;

  const tipoServico = tipoServicoDoNomeDoTipo(String(tipo.name));
  if (!tipoServico) return null;

  return {
    catalogServiceId,
    subtypeId,
    tipoServico,
    rotuloServico: limpar(servico.name).slice(0, DECISAO_ROTULO_MAX),
    rotuloSubtipo: limpar(subtipo.name).slice(0, DECISAO_ROTULO_MAX),
  };
}
