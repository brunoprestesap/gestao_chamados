import { PageHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calcularCustosAtivos, type CustosAtivos } from '@/lib/ativos/custo';
import { calcularIndicadoresAtivos, type IndicadoresAtivos } from '@/lib/ativos/indicadores';
import { listarSituacoesSubstituicao, type SituacoesSubstituicao } from '@/lib/ativos/substituicao';
import { requireAdmin } from '@/lib/dal';
import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { computeImrReport, endOfDay, startOfDay } from '@/lib/imr-service';
import { formatDate, formatTime } from '@/lib/utils';

import { ImrTipoServicoTabs } from './_components/imr-tipo-servico-tabs';

function getCurrentMonthBounds(): { dataInicial: Date; dataFinal: Date } {
  const now = new Date();
  const dataInicial = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const dataFinal = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
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
  return getCurrentMonthBounds();
}

type PageProps = { searchParams: Promise<{ dataInicial?: string; dataFinal?: string }> };

export default async function ImrPage({ searchParams }: PageProps) {
  const session = await requireAdmin();
  const params = await searchParams;

  const { dataInicial, dataFinal } = parseDateRange(params.dataInicial, params.dataFinal);

  const fim = endOfDay(dataFinal);
  const [result, ativos, substituicao, custos] = await Promise.all([
    computeImrReport({ dataInicial, dataFinal }),
    // Os indicadores de equipamento (spec 0014) são só informativos: uma falha
    // aqui mostra o aviso na aba Ativos e nunca derruba o relatório.
    calcularIndicadoresAtivos({
      inicio: startOfDay(dataInicial),
      fim,
      fimReincidencia: fim,
    }).catch((err: unknown): IndicadoresAtivos | null => {
      console.error(
        '[imr]',
        JSON.stringify({
          operacao: 'calcularIndicadoresAtivos',
          error: err instanceof Error ? err.message : 'unknown',
        }),
      );
      return null;
    }),
    // Candidatos à substituição (spec 0015, AC-7 e AC-8): sempre até hoje, sem
    // depender do período escolhido, e com a mesma falha isolada.
    listarSituacoesSubstituicao().catch((err: unknown): SituacoesSubstituicao | null => {
      console.error(
        '[imr]',
        JSON.stringify({
          operacao: 'listarSituacoesSubstituicao',
          error: err instanceof Error ? err.message : 'unknown',
        }),
      );
      return null;
    }),
    // Custo por ativo no período (spec 0018, AC-12 e AC-19): falha isolada.
    calcularCustosAtivos({ inicio: startOfDay(dataInicial), fim }).catch(
      (err: unknown): CustosAtivos | null => {
        console.error(
          '[imr]',
          JSON.stringify({
            operacao: 'calcularCustosAtivos',
            error: err instanceof Error ? err.message : 'unknown',
          }),
        );
        return null;
      },
    ),
  ]);
  const dataGeracao = new Date();
  const expediente = await getBusinessCalendarConfig();
  const tzOpt = { timeZone: expediente.timezone };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório IMR — Índice de Medição de Resultados"
        subtitle="Indicadores de desempenho dos atendimentos encerrados no período. Uso gerencial e auditoria."
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Período de apuração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form method="GET" action="/relatorios/imr" className="flex flex-wrap items-end gap-4">
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
              Período analisado: {formatDate(result.periodo.dataInicial, tzOpt)} a{' '}
              {formatDate(result.periodo.dataFinal, tzOpt)}
            </span>
            <span>
              Data de geração do relatório: {formatDate(dataGeracao, tzOpt)} às{' '}
              {formatTime(dataGeracao, tzOpt)}
            </span>
            <span>Responsável (Admin): {session?.username ?? '—'}</span>
          </div>
        </CardContent>
      </Card>

      <ImrTipoServicoTabs
        resumoGeral={result.resumoGeral}
        porTipoServico={result.porTipoServico}
        ativos={ativos}
        substituicao={substituicao}
        custos={custos}
      />
    </div>
  );
}
