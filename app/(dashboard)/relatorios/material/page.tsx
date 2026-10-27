import { PageHeader } from '@/components/dashboard/header';
import { hojeEmBelem } from '@/lib/ativos/documentos/situacao';
import { requireAdmin } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { lerRelatorioMaterial } from '@/lib/material/relatorio';
import { PeriodoRelatorioMaterialSchema } from '@/shared/material/cotacao.schemas';
import { TEXTO_RELATORIO } from '@/shared/material/mensagens';
import { ATALHOS_PERIODO, periodosDosAtalhos } from '@/shared/material/relatorio';

import { RelatorioMaterialTela } from './_components/RelatorioMaterialTela';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ inicio?: string; fim?: string; atalho?: string }> };

/**
 * Relatório de material (spec 0019, AC-41). Só Admin; o padrão é o atalho
 * "Mês atual", do dia 1 até hoje em Belém (spec 0021, AC-23).
 */
export default async function RelatorioMaterialPage({ searchParams }: Props) {
  await requireAdmin();
  await dbConnect();
  const agora = new Date();
  const hoje = hojeEmBelem(agora);
  const mesAtual = periodosDosAtalhos(hoje).mes;
  const params = await searchParams;
  const pedido = { inicio: params.inicio ?? mesAtual.inicio, fim: params.fim ?? mesAtual.fim };
  const p = PeriodoRelatorioMaterialSchema.safeParse(pedido);
  const periodo = p.success ? p.data : mesAtual;
  const erro = p.success ? null : (p.error.issues[0]?.message ?? 'Período inválido.');
  const relatorio = await lerRelatorioMaterial(periodo, agora);

  return (
    <div className="space-y-6">
      <PageHeader title={TEXTO_RELATORIO.titulo} subtitle={TEXTO_RELATORIO.subtitulo} />
      <RelatorioMaterialTela
        relatorio={relatorio}
        erroPeriodo={erro}
        pedido={pedido}
        hoje={hoje}
        atalho={ATALHOS_PERIODO.find((a) => a === params.atalho) ?? null}
      />
    </div>
  );
}
