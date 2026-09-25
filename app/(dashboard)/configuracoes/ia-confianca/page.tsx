import { PageHeader } from '@/components/dashboard/header';
import { requireAdmin } from '@/lib/dal';
import { medirCalibragem } from '@/lib/ia-confianca/calibragem';
import { lerConfig } from '@/lib/ia-confianca/config';

import { IaConfiancaForm } from './_components/IaConfiancaForm';
import { RelatorioCampoCard } from './_components/RelatorioCampoCard';

export default async function IaConfiancaPage() {
  await requireAdmin();

  const config = await lerConfig();
  const relatorio = await medirCalibragem({
    servico: config.servico.amostraMinima,
    prioridade: config.prioridade.amostraMinima,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calibração da confiança da IA"
        subtitle="Mede se a sugestão da IA bate com o que o Preposto decidiu, e define o que a IA pode fazer sozinha: o limite de confiança, a autonomia e a atribuição automática de técnico."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <RelatorioCampoCard relatorio={relatorio.servico} />
        <RelatorioCampoCard relatorio={relatorio.prioridade} />
      </div>

      <IaConfiancaForm
        config={config}
        sugestoes={{
          servico: relatorio.servico.sugestao,
          prioridade: relatorio.prioridade.sugestao,
        }}
      />
    </div>
  );
}
