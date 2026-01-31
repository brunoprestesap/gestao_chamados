import { requireAdmin } from '@/lib/dal';
import { formatDate, formatTime } from '@/lib/utils';
import { computeImrReport } from '@/lib/imr-service';
import { PageHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Retorna primeiro e último dia do mês atual (UTC). */
function getCurrentMonthBounds(): { dataInicial: Date; dataFinal: Date } {
  const now = new Date();
  const dataInicial = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const dataFinal = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { dataInicial, dataFinal };
}

function formatDateInput(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Converte ms em texto: horas ou dias se > 24h */
function formatTempoMedio(ms: number): string {
  const horas = ms / (1000 * 60 * 60);
  if (horas >= 24) {
    const dias = Math.round((horas / 24) * 100) / 100;
    return `${dias} dia(s)`;
  }
  const h = Math.round(horas * 100) / 100;
  return `${h} hora(s)`;
}

type PageProps = { searchParams: Promise<{ dataInicial?: string; dataFinal?: string }> };

export default async function ImrPage({ searchParams }: PageProps) {
  const session = await requireAdmin();
  const params = await searchParams;

  let dataInicial: Date;
  let dataFinal: Date;
  const sIni = params.dataInicial;
  const sFim = params.dataFinal;
  if (sIni && sFim) {
    dataInicial = new Date(sIni + 'T00:00:00.000Z');
    dataFinal = new Date(sFim + 'T23:59:59.999Z');
    if (Number.isNaN(dataInicial.getTime()) || Number.isNaN(dataFinal.getTime()) || dataInicial > dataFinal) {
      const bounds = getCurrentMonthBounds();
      dataInicial = bounds.dataInicial;
      dataFinal = bounds.dataFinal;
    }
  } else {
    const bounds = getCurrentMonthBounds();
    dataInicial = bounds.dataInicial;
    dataFinal = bounds.dataFinal;
  }

  const result = await computeImrReport({ dataInicial, dataFinal });
  const dataGeracao = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório IMR — Índice de Medição de Resultados"
        subtitle="Indicadores de desempenho dos atendimentos encerrados no período. Uso gerencial e auditoria."
      />

      {/* Período e metadados */}
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
            <span>Período analisado: {formatDate(result.periodo.dataInicial)} a {formatDate(result.periodo.dataFinal)}</span>
            <span>Data de geração do relatório: {formatDate(dataGeracao)} às {formatTime(dataGeracao)}</span>
            <span>Responsável (Admin): {session?.username ?? '—'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Quadro-resumo (destaque) */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Quadro-resumo (IMR)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="text-xs text-muted-foreground">Total de chamados</p>
              <p className="text-xl font-semibold">{result.totalChamados}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">SLA atendido</p>
              <p className="text-xl font-semibold">{result.sla.percentualDentro}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">SLA descumprido</p>
              <p className="text-xl font-semibold">{result.sla.percentualFora}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avaliação média</p>
              <p className="text-xl font-semibold">{result.avaliacao.totalAvaliacoes > 0 ? result.avaliacao.mediaGeral : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Chamados críticos fora do SLA</p>
              <p className="text-xl font-semibold">{result.chamadosForaSla}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 1) Volume por tipo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">1) Volume de atendimentos</CardTitle>
          <p className="text-xs text-muted-foreground">Total de chamados encerrados no período por tipo de serviço</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {result.volumePorTipo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum chamado encerrado no período.</p>
            ) : (
              result.volumePorTipo.map((v) => (
                <div key={v.tipoServico} className="rounded-lg border px-4 py-2">
                  <span className="text-sm font-medium">{v.tipoServico}</span>
                  <span className="ml-2 text-lg font-semibold">{v.total}</span>
                </div>
              ))
            )}
            {result.totalChamados > 0 && (
              <div className="rounded-lg border border-primary px-4 py-2">
                <span className="text-sm font-medium">Total</span>
                <span className="ml-2 text-lg font-semibold">{result.totalChamados}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2) Cumprimento de SLA */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">2) Cumprimento de SLA</CardTitle>
          <p className="text-xs text-muted-foreground">Dentro do prazo: resolutionBreachedAt nulo ou resolvedAt ≤ resolutionDueAt</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 dark:border-green-800 dark:bg-green-950/20">
              <p className="text-xs text-muted-foreground">Dentro do SLA</p>
              <p className="text-2xl font-semibold">{result.sla.totalDentro}</p>
              <p className="text-sm">{result.sla.percentualDentro}%</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-800 dark:bg-red-950/20">
              <p className="text-xs text-muted-foreground">Fora do SLA</p>
              <p className="text-2xl font-semibold">{result.sla.totalFora}</p>
              <p className="text-sm">{result.sla.percentualFora}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3) SLA por prioridade */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">3) SLA por prioridade</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prioridade</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">% dentro SLA</TableHead>
                <TableHead className="text-right">% fora SLA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.slaPorPrioridade.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Nenhum dado no período.
                  </TableCell>
                </TableRow>
              ) : (
                result.slaPorPrioridade.map((p) => (
                  <TableRow key={p.prioridade}>
                    <TableCell>{p.prioridade}</TableCell>
                    <TableCell className="text-right">{p.total}</TableCell>
                    <TableCell className="text-right">{p.percentualDentro}%</TableCell>
                    <TableCell className="text-right">{p.percentualFora}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 4) Tempo médio de atendimento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">4) Tempo médio de atendimento</CardTitle>
          <p className="text-xs text-muted-foreground">resolvedAt − createdAt (ou closedAt quando resolvedAt ausente)</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {result.tempoMedioMs != null ? (
              <p className="text-lg font-medium">{formatTempoMedio(result.tempoMedioMs)}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Não há dados para calcular.</p>
            )}
            {result.tempoMedioPorTipo.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-4 border-t pt-3">
                {result.tempoMedioPorTipo.map((t) => (
                  <div key={t.tipoServico} className="rounded border px-3 py-1 text-sm">
                    <span className="text-muted-foreground">{t.tipoServico}:</span>{' '}
                    {formatTempoMedio(t.tempoMedioMs)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 5) Avaliação dos usuários */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">5) Avaliação dos usuários</CardTitle>
          <p className="text-xs text-muted-foreground">Apenas chamados avaliados (rating 1 a 5). Negativa = rating ≤ 2 com avaliação registrada.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Média geral</p>
              <p className="text-xl font-semibold">{result.avaliacao.totalAvaliacoes > 0 ? result.avaliacao.mediaGeral : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total de avaliações</p>
              <p className="text-xl font-semibold">{result.avaliacao.totalAvaliacoes}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avaliações negativas (≤ 2)</p>
              <p className="text-xl font-semibold">{result.avaliacao.totalNegativas} ({result.avaliacao.totalAvaliacoes > 0 ? result.avaliacao.percentualNegativas : 0}%)</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Chamados não avaliados</p>
              <p className="text-xl font-semibold">{result.avaliacao.totalNaoAvaliados} ({result.avaliacao.percentualNaoAvaliados}%)</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Não impacta penalidade.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 6) Penalidades */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">6) Penalidades (base para glosa)</CardTitle>
          <p className="text-xs text-muted-foreground">Apenas avaliação negativa explícita (rating ≤ 2). Chamados não avaliados não geram penalidade.</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">% sobre total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.penalidades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Nenhum dado no período.
                  </TableCell>
                </TableRow>
              ) : (
                result.penalidades.map((p) => (
                  <TableRow key={p.motivo}>
                    <TableCell>{p.motivo}</TableCell>
                    <TableCell className="text-right">{p.quantidade}</TableCell>
                    <TableCell className="text-right">{p.percentualSobreTotal}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
