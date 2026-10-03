import { PageHeader } from '@/components/dashboard/header';
import type { TipoDocumentoLinha } from '@/lib/ativos/documentos/tipos';
import { requireAdmin } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { DocumentoAtivoModel } from '@/models/DocumentoAtivo';
import { TipoDocumentoModel } from '@/models/TipoDocumento';

import { GerirTiposDocumento } from './_components/GerirTiposDocumento';

export default async function TiposDocumentoPage() {
  await requireAdmin();
  await dbConnect();

  const [tipos, contagens] = await Promise.all([
    TipoDocumentoModel.find().sort({ isActive: -1, nome: 1 }).lean(),
    DocumentoAtivoModel.aggregate<{ _id: string; total: number }>([
      { $match: { situacao: 'vigente' } },
      { $group: { _id: '$tipo', total: { $sum: 1 } } },
    ]),
  ]);
  const totalPorTipo = new Map(contagens.map((c) => [c._id, c.total]));

  const linhas: TipoDocumentoLinha[] = tipos.map((t) => ({
    id: String(t._id),
    chave: t.chave,
    nome: t.nome,
    isActive: t.isActive !== false,
    totalVigentes: totalPorTipo.get(t.chave) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tipos de documento"
        subtitle="Laudos e certificados que os ativos e os locais podem ter, como PMOC, AVCB e ART. As categorias de ativo escolhem quais exigem."
      />
      <GerirTiposDocumento tipos={linhas} />
    </div>
  );
}
