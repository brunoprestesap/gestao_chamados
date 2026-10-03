import { Types } from 'mongoose';

import { listarLocaisAtivos } from '@/lib/ativos/localizacao';
import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { LocalizacaoModel } from '@/models/Localizacao';
import { RecurringTicketModel } from '@/models/RecurringTicket';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
import { ServiceTypeModel } from '@/models/ServiceType';
import { tipoServicoDoNomeDoTipo } from '@/shared/chamados/tipo-servico';

import type { OpcoesPreventiva } from './_components/RecurringTicketDialog';
import { type RecurringItem, RecurringTicketsClient } from './_components/RecurringTicketsClient';

export const dynamic = 'force-dynamic';

type CategoriaLean = {
  _id: Types.ObjectId;
  nome: string;
  isActive?: boolean;
  serviceSubTypeId?: Types.ObjectId | null;
  periodicidadePreventivaDias?: number | null;
};

/**
 * Opções do escopo por categoria (spec 0013, AC-16): a categoria sugere o
 * subtipo (com o tipo de serviço dele) e o intervalo em dias.
 */
async function opcoesPreventiva(categorias: CategoriaLean[]): Promise<OpcoesPreventiva> {
  const subtipoIds = categorias.flatMap((c) => (c.serviceSubTypeId ? [c.serviceSubTypeId] : []));
  const subtipos = subtipoIds.length
    ? await ServiceSubTypeModel.find({ _id: { $in: subtipoIds } })
        .select('typeId')
        .lean<{ _id: Types.ObjectId; typeId?: Types.ObjectId | null }[]>()
    : [];
  const tipoIds = subtipos.flatMap((st) => (st.typeId ? [st.typeId] : []));
  const tipos = tipoIds.length
    ? await ServiceTypeModel.find({ _id: { $in: tipoIds } })
        .select('name')
        .lean<{ _id: Types.ObjectId; name: string }[]>()
    : [];
  const nomeDoTipo = new Map(tipos.map((t) => [String(t._id), t.name]));
  const tipoDoSubtipo = new Map(
    subtipos.map((st) => [
      String(st._id),
      st.typeId ? tipoServicoDoNomeDoTipo(nomeDoTipo.get(String(st.typeId)) ?? '') : null,
    ]),
  );
  const locais = await listarLocaisAtivos();

  return {
    categorias: categorias
      .filter((c) => c.isActive !== false)
      .map((c) => {
        const subtypeId = c.serviceSubTypeId ? String(c.serviceSubTypeId) : null;
        return {
          id: String(c._id),
          nome: c.nome,
          subtypeId,
          tipoServico: subtypeId ? (tipoDoSubtipo.get(subtypeId) ?? null) : null,
          periodicidadeDias: c.periodicidadePreventivaDias ?? null,
        };
      }),
    locais: locais.map((l) => ({ id: l.id, caminho: l.caminho })),
  };
}

export default async function RecurringTicketsPage() {
  await requireManager();
  await dbConnect();

  const [docs, categorias] = await Promise.all([
    RecurringTicketModel.find().sort({ isActive: -1, nextRunAt: 1 }).lean(),
    CategoriaAtivoModel.find()
      .select('nome isActive serviceSubTypeId periodicidadePreventivaDias')
      .sort({ nome: 1 })
      .lean<CategoriaLean[]>(),
  ]);
  const opcoes = await opcoesPreventiva(categorias);

  const nomeDaCategoria = new Map(categorias.map((c) => [String(c._id), c.nome]));
  // Inclui locais desativados: o modelo pode apontar para um que saiu da árvore.
  const localIds = docs.flatMap((d) => (d.localizacaoId ? [d.localizacaoId] : []));
  const caminhos = localIds.length
    ? await LocalizacaoModel.find({ _id: { $in: localIds } })
        .select('caminho')
        .lean<{ _id: Types.ObjectId; caminho: string }[]>()
    : [];
  const caminhoPorId = new Map(caminhos.map((l) => [String(l._id), l.caminho]));

  const items: RecurringItem[] = docs.map((d) => ({
    _id: String(d._id),
    name: d.name ?? '',
    titulo: d.titulo ?? '',
    descricao: d.descricao ?? '',
    tipoServico: d.tipoServico ?? '',
    naturezaAtendimento: d.naturezaAtendimento ?? '',
    grauUrgencia: d.grauUrgencia ?? 'Normal',
    recurrenceType: d.recurrenceType ?? '',
    dayOfWeek: d.dayOfWeek ?? undefined,
    dayOfMonth: d.dayOfMonth ?? undefined,
    intervalDays: d.intervalDays ?? undefined,
    nextRunAt: d.nextRunAt ? new Date(d.nextRunAt).toISOString() : '',
    lastRunAt: d.lastRunAt ? new Date(d.lastRunAt).toISOString() : undefined,
    totalGenerated: d.totalGenerated ?? 0,
    isActive: d.isActive ?? true,
    unitId: d.unitId ? String(d.unitId) : '',
    solicitanteId: d.solicitanteId ? String(d.solicitanteId) : '',
    subtypeId: String(d.subtypeId),
    catalogServiceId: String(d.catalogServiceId),
    escopo: d.escopo === 'categoria_ativo' ? 'categoria_ativo' : 'template',
    categoriaAtivoId: d.categoriaAtivoId ? String(d.categoriaAtivoId) : undefined,
    categoriaNome: d.categoriaAtivoId ? nomeDaCategoria.get(String(d.categoriaAtivoId)) : undefined,
    localizacaoId: d.localizacaoId ? String(d.localizacaoId) : undefined,
    localCaminho: d.localizacaoId ? caminhoPorId.get(String(d.localizacaoId)) : undefined,
    finalPriority: d.finalPriority ?? undefined,
    ultimoLote: d.ultimoLote
      ? {
          situacao: d.ultimoLote.situacao === 'em_andamento' ? 'em_andamento' : 'concluido',
          em: new Date(d.ultimoLote.em).toISOString(),
          gerados: d.ultimoLote.gerados ?? 0,
          pulados: d.ultimoLote.pulados ?? 0,
          semSla: d.ultimoLote.semSla ?? 0,
          erros: d.ultimoLote.erros ?? 0,
          motivo: d.ultimoLote.motivo ?? null,
        }
      : undefined,
  }));

  return <RecurringTicketsClient items={items} opcoes={opcoes} />;
}
