import { AlertTriangle, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { RelatorioCampo } from '@/lib/ia-confianca/calibragem';
import { DECISAO_CAMPO_LABELS } from '@/shared/conversas/conversa.constants';
import type { IaConfiancaCampo } from '@/shared/ia-confianca/ia-confianca.schemas';

/**
 * O mesmo aviso fixo de viés de concordância, agora nas duas seções (spec
 * 0007, AC-9): desde a pré-preenchida de prioridade no formulário de
 * classificação (AC-8), o Preposto deixou de julgar prioridade às cegas,
 * igual já acontecia com serviço.
 */
function avisoVies(campo: IaConfiancaCampo): string {
  return `O Preposto vê a sugestão de ${DECISAO_CAMPO_LABELS[campo]} já preenchida antes de classificar. Este número mede concordância, não um acerto independente.`;
}

function formatarPercentual(valor: number | null): string {
  if (valor === null) return '—';
  return `${(valor * 100).toFixed(0)}%`;
}

export function RelatorioCampoCard({ relatorio }: { relatorio: RelatorioCampo }) {
  const label = DECISAO_CAMPO_LABELS[relatorio.campo];

  return (
    <Card className="overflow-hidden rounded-2xl border-border/50">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base capitalize">Acurácia: {label}</CardTitle>
          <span className="text-sm text-muted-foreground">
            {relatorio.totalElegivel} decisão(ões) elegível(is)
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {avisoVies(relatorio.campo)}
        </p>

        {!relatorio.amostraSuficiente ? (
          <p className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Amostra pequena demais para calibrar: {relatorio.totalElegivel} de{' '}
            {relatorio.amostraMinima} decisões elegíveis mínimas.
          </p>
        ) : (
          <>
            {relatorio.sugestao !== null && (
              <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Sugestão: confiança ≥ {relatorio.sugestao.toFixed(2)}
              </Badge>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Corte de confiança</TableHead>
                  <TableHead className="text-right">Decisões</TableHead>
                  <TableHead className="text-right">Acerto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relatorio.cortes.map((linha) => (
                  <TableRow
                    key={linha.corte}
                    className={linha.corte === relatorio.sugestao ? 'bg-primary/5' : undefined}
                  >
                    <TableCell>&ge; {linha.corte.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{linha.total}</TableCell>
                    <TableCell className="text-right">
                      {formatarPercentual(linha.percentualAcerto)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
