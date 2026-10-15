import { PageHeader } from '@/components/dashboard/header';
import { requireAdmin } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { lerPainelMaterial } from '@/lib/material/cadastro';

import { GerirMaterial } from './_components/GerirMaterial';

/** Cadastro do fluxo de material (spec 0019, AC-19, AC-20). Só Admin. */
export default async function MaterialConfigPage() {
  await requireAdmin();
  await dbConnect();
  const painel = await lerPainelMaterial();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material"
        subtitle="Empenhos, faixas de competência e designações do fluxo de cotação de material. Nada aqui se apaga: designação é revogada, faixa é desativada e o empenho recebe reforço ou anulação."
      />
      <GerirMaterial painel={painel} />
    </div>
  );
}
