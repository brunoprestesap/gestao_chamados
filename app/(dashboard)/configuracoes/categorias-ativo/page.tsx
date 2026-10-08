import { PageHeader } from '@/components/dashboard/header';
import { requireAdmin } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { AtivoModel } from '@/models/Ativo';
import { CategoriaAtivoModel } from '@/models/CategoriaAtivo';
import { ServiceSubTypeModel } from '@/models/ServiceSubType';
import { ServiceTypeModel } from '@/models/ServiceType';
import { TipoDocumentoModel } from '@/models/TipoDocumento';
import type { Criticidade } from '@/shared/ativos/ativo.constants';

import { type CategoriaLinha, GerirCategorias } from './_components/GerirCategorias';

export default async function CategoriasAtivoPage() {
  await requireAdmin();
  await dbConnect();

  const [categorias, contagens, subtipos, tipos, tiposDocumento] = await Promise.all([
    CategoriaAtivoModel.find().sort({ isActive: -1, nome: 1 }).lean(),
    AtivoModel.aggregate<{ _id: unknown; total: number }>([
      { $group: { _id: '$categoriaId', total: { $sum: 1 } } },
    ]),
    ServiceSubTypeModel.find({ isActive: { $ne: false } })
      .select('name typeId')
      .lean(),
    ServiceTypeModel.find().select('name').lean(),
    TipoDocumentoModel.find().select('chave nome isActive').sort({ nome: 1 }).lean(),
  ]);

  const totalPorCategoria = new Map(contagens.map((c) => [String(c._id), c.total]));
  const nomeTipo = new Map(tipos.map((t) => [String(t._id), String(t.name)]));

  const linhas: CategoriaLinha[] = categorias.map((c) => ({
    id: String(c._id),
    chave: c.chave,
    nome: c.nome,
    criticidadePadrao: c.criticidadePadrao as Criticidade,
    periodicidadePreventivaDias: c.periodicidadePreventivaDias ?? null,
    exigeDocumento: c.exigeDocumento ?? [],
    vidaUtilAnos: c.vidaUtilAnos ?? null,
    limiteCorretivos12m: c.limiteCorretivos12m ?? null,
    limiteReincidencia90d: c.limiteReincidencia90d ?? null,
    limiteCustoPercentual12m: c.limiteCustoPercentual12m ?? null,
    serviceSubTypeId: c.serviceSubTypeId ? String(c.serviceSubTypeId) : null,
    isActive: c.isActive !== false,
    totalAtivos: totalPorCategoria.get(String(c._id)) ?? 0,
  }));

  const opcoesSubtipo = subtipos
    .map((s) => ({
      id: String(s._id),
      rotulo: `${nomeTipo.get(String(s.typeId)) ?? 'Sem tipo'} / ${s.name}`,
    }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias de ativo"
        subtitle="Agrupam os equipamentos, dão a criticidade inicial e ligam cada tipo de equipamento a um serviço do catálogo."
      />
      <GerirCategorias
        categorias={linhas}
        subtipos={opcoesSubtipo}
        tiposDocumento={tiposDocumento.map((t) => ({
          chave: t.chave,
          nome: t.nome,
          isActive: t.isActive !== false,
        }))}
      />
    </div>
  );
}
