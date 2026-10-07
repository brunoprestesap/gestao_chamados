import { PageHeader } from '@/components/dashboard/header';
import { listarContratos } from '@/lib/contratos/relatorio';
import { requireAdmin } from '@/lib/dal';

import { GerirContratos } from './_components/GerirContratos';

/** Cadastro de contratos de manutenção (spec 0016, AC-1). Só Admin. */
export default async function ContratosPage() {
  await requireAdmin();
  const contratos = await listarContratos();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contratos"
        subtitle="Contratos de manutenção, com a vigência e os tipos de serviço que cada um cobre. O chamado pertence ao contrato pelo tipo de serviço e pela data de abertura."
      />
      <GerirContratos contratos={contratos} />
    </div>
  );
}
