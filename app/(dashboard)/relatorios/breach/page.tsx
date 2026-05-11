import { PageHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requireManager } from '@/lib/dal';
import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { computeBreachReport } from '@/lib/sla-breach-report';
import { formatDate, formatTime } from '@/lib/utils';

import { BreachCsvExport } from './_components/BreachCsvExport';
import { BreachTabs } from './_components/BreachTabs';

function getLast3MonthsBounds(): { dataInicial: Date; dataFinal: Date } {
  const now = new Date();
  const dataFinal = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
  const dataInicial = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1, 0, 0, 0, 0),
  );
  return { dataInicial, dataFinal };
}

function formatDateInput(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateRange(sIni?: string, sFim?: string): { dataInicial: Date; dataFinal: Date } {
  if (sIni && sFim) {
    const dataInicial = new Date(sIni + 'T00:00:00.000Z');
    const dataFinal = new Date(sFim + 'T23:59:59.999Z');
    if (
      !Number.isNaN(dataInicial.getTime()) &&
      !Number.isNaN(dataFinal.getTime()) &&
      dataInicial <= dataFinal
    ) {
      return { dataInicial, dataFinal };
    }
  }
  return getLast3MonthsBounds();
}

type PageProps = { searchParams: Promise<{ dataInicial?: string; dataFinal?: string }> };

export default async function BreachReportPage({ searchParams }: PageProps) {
  const session = await requireManager();
  const params = await searchParams;

  const { dataInicial, dataFinal } = parseDateRange(params.dataInicial, params.dataFinal);

  const report = await computeBreachReport(dataInicial, dataFinal);
  const dataGeracao = new Date();
  const expediente = await getBusinessCalendarConfig();
  const tzOpt = { timeZone: expediente.timezone };
  const periodLabel = `${formatDateInput(dataInicial)}_${formatDateInput(dataFinal)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório de Breaches de SLA"
        subtitle="Análise de estouros de SLA por técnico, unidade e prioridade — identifique gargalos e tome ações corretivas."
        actions={
          <BreachCsvExport
            byTechnician={report.byTechnician}
            byUnit={report.byUnit}
            periodLabel={periodLabel}
          />
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Período de apuração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form method="GET" action="/relatorios/breach" className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="dataInicial" className="text-xs">
                Data inicial
              </Label>
              <Input
                id="dataInicial"
                name="dataInicial"
                type="date"
                defaultValue={formatDateInput(dataInicial)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataFinal" className="text-xs">
                Data final
              </Label>
              <Input
                id="dataFinal"
                name="dataFinal"
                type="date"
                defaultValue={formatDateInput(dataFinal)}
                className="w-[160px]"
              />
            </div>
            <Button type="submit">Aplicar período</Button>
          </form>
          <div className="flex flex-wrap gap-4 border-t pt-3 text-xs text-muted-foreground">
            <span>
              Período analisado: {formatDate(dataInicial, tzOpt)} a {formatDate(dataFinal, tzOpt)}
            </span>
            <span>
              Gerado em: {formatDate(dataGeracao, tzOpt)} às {formatTime(dataGeracao, tzOpt)}
            </span>
            <span>Responsável: {session?.username ?? '—'}</span>
          </div>
        </CardContent>
      </Card>

      <BreachTabs report={report} />
    </div>
  );
}
