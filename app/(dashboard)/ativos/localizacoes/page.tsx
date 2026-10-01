import { PageHeader } from '@/components/dashboard/header';
import { listarLocaisAtivos } from '@/lib/ativos/localizacao';
import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { UnitModel } from '@/models/unit';

import { GerirLocalizacoes } from './_components/GerirLocalizacoes';

export default async function LocalizacoesPage() {
  await requireManager();
  await dbConnect();
  const [nos, unidades] = await Promise.all([
    listarLocaisAtivos(),
    UnitModel.find({ isActive: { $ne: false } })
      .sort({ name: 1 })
      .select('name')
      .lean(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Localizações"
        subtitle="A árvore física dos equipamentos: prédio, andar, sala e área técnica."
      />
      <GerirLocalizacoes
        nos={nos}
        unidades={unidades.map((u) => ({ id: String(u._id), nome: u.name }))}
      />
    </div>
  );
}
