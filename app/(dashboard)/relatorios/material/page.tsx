import { PageHeader } from '@/components/dashboard/header';
import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import { requireAdmin } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { lerRelatorioMaterial } from '@/lib/material/relatorio';
import { limitesDoMes } from '@/shared/contratos/janela';
import { PeriodoRelatorioMaterialSchema } from '@/shared/material/cotacao.schemas';

import { RelatorioMaterialTela } from './_components/RelatorioMaterialTela';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ inicio?: string; fim?: string }> };

/** Relatório de material (spec 0019, AC-41). Só Admin; padrão, o mês corrente em Belém. */
export default async function RelatorioMaterialPage({ searchParams }: Props) {
  await requireAdmin();
  await dbConnect();
  const agora = new Date();
  const { primeiro, ultimo } = limitesDoMes(hojeEmBelem(agora).slice(0, 7));
  const params = await searchParams;
  const pedido = { inicio: params.inicio ?? primeiro, fim: params.fim ?? ultimo };
  const p = PeriodoRelatorioMaterialSchema.safeParse(pedido);
  const periodo = p.success ? p.data : { inicio: primeiro, fim: ultimo };
  const erro = p.success ? null : (p.error.issues[0]?.message ?? 'Período inválido.');
  const relatorio = await lerRelatorioMaterial(periodo, agora);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório de material"
        subtitle="Cotações de material no período: tempo até a autorização, devoluções, impedimentos, custo por equipamento, urgências, fracionamento, consumo do Anexo V, a diferença para o SINAPI e o saldo dos empenhos."
      />
      <RelatorioMaterialTela relatorio={relatorio} erroPeriodo={erro} pedido={pedido} />
    </div>
  );
}
