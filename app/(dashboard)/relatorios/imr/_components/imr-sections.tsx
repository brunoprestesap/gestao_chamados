import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  ImrAvaliacao,
  ImrPenalidade,
  ImrSlaCumprimento,
  ImrSlaPorPrioridade,
  ImrVolumePorTipo,
} from '@/lib/imr-service';

/* ─────────────────────── Utilitário de formatação ─────────────────────── */

export function formatTempoMedio(ms: number): string {
  const horas = ms / (1000 * 60 * 60);
  if (horas >= 24) {
    return `${Math.round((horas / 24) * 100) / 100} dia(s)`;
  }
  return `${Math.round(horas * 100) / 100} hora(s)`;
}

/* ─────────────────────── Seções reutilizáveis ─────────────────────── */

export function SectionQuadroResumo({
  totalChamados,
  sla,
  avaliacao,
  chamadosForaSla,
}: {
  totalChamados: number;
  sla: ImrSlaCumprimento;
  avaliacao: ImrAvaliacao;
  chamadosForaSla: number;
}) {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Quadro-resumo (IMR)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-xs text-muted-foreground">Total de chamados</p>
            <p className="text-xl font-semibold">{totalChamados}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">SLA atendido</p>
            <p className="text-xl font-semibold">{sla.percentualDentro}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">SLA descumprido</p>
            <p className="text-xl font-semibold">{sla.percentualFora}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avaliação média</p>
            <p className="text-xl font-semibold">
              {avaliacao.totalAvaliacoes > 0 ? avaliacao.mediaGeral : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Chamados críticos fora do SLA</p>
            <p className="text-xl font-semibold">{chamadosForaSla}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SectionVolume({
  volumePorTipo,
  totalChamados,
}: {
  volumePorTipo: ImrVolumePorTipo[];
  totalChamados: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">1) Volume de atendimentos</CardTitle>
        <p className="text-xs text-muted-foreground">
          Total de chamados encerrados no período por tipo de serviço
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          {volumePorTipo.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum chamado encerrado no período.</p>
          ) : (
            volumePorTipo.map((v) => (
              <div key={v.tipoServico} className="rounded-lg border px-4 py-2">
                <span className="text-sm font-medium">{v.tipoServico}</span>
                <span className="ml-2 text-lg font-semibold">{v.total}</span>
              </div>
            ))
          )}
          {totalChamados > 0 && (
            <div className="rounded-lg border border-primary px-4 py-2">
              <span className="text-sm font-medium">Total</span>
              <span className="ml-2 text-lg font-semibold">{totalChamados}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SectionSla({ sla }: { sla: ImrSlaCumprimento }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Cumprimento de SLA</CardTitle>
        <p className="text-xs text-muted-foreground">
          Dentro do prazo: resolutionBreachedAt nulo ou resolvedAt ≤ resolutionDueAt
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 dark:border-green-800 dark:bg-green-950/20">
            <p className="text-xs text-muted-foreground">Dentro do SLA</p>
            <p className="text-2xl font-semibold">{sla.totalDentro}</p>
            <p className="text-sm">{sla.percentualDentro}%</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-800 dark:bg-red-950/20">
            <p className="text-xs text-muted-foreground">Fora do SLA</p>
            <p className="text-2xl font-semibold">{sla.totalFora}</p>
            <p className="text-sm">{sla.percentualFora}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SectionSlaPorPrioridade({
  slaPorPrioridade,
}: {
  slaPorPrioridade: ImrSlaPorPrioridade[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">SLA por prioridade</CardTitle>
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
            {slaPorPrioridade.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nenhum dado no período.
                </TableCell>
              </TableRow>
            ) : (
              slaPorPrioridade.map((p) => (
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
  );
}

export function SectionTempoMedio({ tempoMedioMs }: { tempoMedioMs: number | null }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tempo médio de atendimento</CardTitle>
        <p className="text-xs text-muted-foreground">
          resolvedAt − createdAt (ou closedAt quando resolvedAt ausente)
        </p>
      </CardHeader>
      <CardContent>
        {tempoMedioMs != null ? (
          <p className="text-lg font-medium">{formatTempoMedio(tempoMedioMs)}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Não há dados para calcular.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function SectionTempoMedioComBreakdown({
  tempoMedioMs,
  tempoMedioPorTipo,
}: {
  tempoMedioMs: number | null;
  tempoMedioPorTipo: { tipoServico: string; tempoMedioMs: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">4) Tempo médio de atendimento</CardTitle>
        <p className="text-xs text-muted-foreground">
          resolvedAt − createdAt (ou closedAt quando resolvedAt ausente)
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {tempoMedioMs != null ? (
            <p className="text-lg font-medium">{formatTempoMedio(tempoMedioMs)}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Não há dados para calcular.</p>
          )}
          {tempoMedioPorTipo.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-4 border-t pt-3">
              {tempoMedioPorTipo.map((t) => (
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
  );
}

export function SectionAvaliacao({ avaliacao }: { avaliacao: ImrAvaliacao }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Avaliação dos usuários</CardTitle>
        <p className="text-xs text-muted-foreground">
          Apenas chamados avaliados (rating 1 a 5). Negativa = rating ≤ 2 com avaliação registrada.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Média geral</p>
            <p className="text-xl font-semibold">
              {avaliacao.totalAvaliacoes > 0 ? avaliacao.mediaGeral : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total de avaliações</p>
            <p className="text-xl font-semibold">{avaliacao.totalAvaliacoes}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avaliações negativas (≤ 2)</p>
            <p className="text-xl font-semibold">
              {avaliacao.totalNegativas} (
              {avaliacao.totalAvaliacoes > 0 ? avaliacao.percentualNegativas : 0}%)
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Chamados não avaliados</p>
            <p className="text-xl font-semibold">
              {avaliacao.totalNaoAvaliados} ({avaliacao.percentualNaoAvaliados}%)
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Não impacta penalidade.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SectionPenalidades({ penalidades }: { penalidades: ImrPenalidade[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Penalidades (base para glosa)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Apenas avaliação negativa explícita (rating ≤ 2). Chamados não avaliados não geram
          penalidade.
        </p>
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
            {penalidades.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Nenhum dado no período.
                </TableCell>
              </TableRow>
            ) : (
              penalidades.map((p) => (
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
  );
}
