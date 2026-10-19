import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/dashboard/header';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { type AbaFila, ABAS_FILA, listarFila } from '@/lib/material/leitura';
import { cn } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';

import { SeloPrazoAteste, SituacaoBadge } from './_components/apoio';

const ROTULO_ABA: Record<AbaFila, string> = {
  minhas: 'Minhas ações',
  analise: 'Análise',
  aprovacao: 'Aprovação',
  ateste: 'Ateste',
  todas: 'Todas',
};

const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Belem' }) : '—';

function idade(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return dias === 0 ? 'hoje' : dias === 1 ? '1 dia' : `${dias} dias`;
}

/**
 * A fila das cotações de material (spec 0019). Abre para quem tem
 * designação vigente; o Admin sem designação lê tudo, e só gera o PDF. A
 * contratada tem `Minhas ações`, `Ateste` e `Todas`, e em `Ateste` vê as
 * datas do recebimento e a NF pendente, sem selo de prazo (AC-21). O técnico
 * opera pelo cartão do chamado.
 */
export default async function CotacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const sessao = await requireSession();
  const { aba: abaBruta } = await searchParams;
  const aba = (ABAS_FILA as readonly string[]).includes(abaBruta ?? '')
    ? (abaBruta as AbaFila)
    : 'minhas';
  await dbConnect();
  const fila = await listarFila({ userId: sessao.userId, role: sessao.role }, aba);
  if (!fila) redirect('/dashboard');
  const comRecebimento = fila.aba === 'ateste';
  const colunas = 5 + (fila.trf1 ? 1 : 0) + (comRecebimento ? 1 : 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cotações de material"
        subtitle="O pedido de material do registro do técnico até o ateste, com a etapa de cada papel."
      />

      <nav aria-label="Abas da fila" className="flex flex-wrap gap-2">
        {fila.abas.map((a) => (
          <Link
            key={a}
            href={`/cotacoes?aba=${a}`}
            aria-current={a === fila.aba ? 'page' : undefined}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm transition-colors',
              a === fila.aba
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-muted',
            )}
          >
            {ROTULO_ABA[a]}
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-2xl border border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Chamado</TableHead>
              <TableHead>Ativo</TableHead>
              {fila.trf1 && <TableHead className="text-right">Valor</TableHead>}
              <TableHead>Situação</TableHead>
              {comRecebimento && <TableHead>Recebimento</TableHead>}
              <TableHead>Idade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fila.linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={colunas} className="py-10 text-center text-muted-foreground">
                  Nada nesta aba.
                </TableCell>
              </TableRow>
            )}
            {fila.linhas.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <Link
                    href={`/cotacoes/${l.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {l.numero}
                  </Link>
                </TableCell>
                <TableCell>{l.chamadoNumero}</TableCell>
                <TableCell>{l.ativo ?? '—'}</TableCell>
                {fila.trf1 && (
                  <TableCell className="text-right tabular-nums">
                    {l.valorCentavos != null ? formatarReais(l.valorCentavos) : '—'}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SituacaoBadge situacao={l.situacao} />
                    <SeloPrazoAteste prazo={l.prazoAteste} />
                    {l.notaFiscalPendente && (
                      <Badge
                        variant="outline"
                        className="border-amber-300 text-amber-700 dark:text-amber-300"
                      >
                        Nota fiscal pendente
                      </Badge>
                    )}
                  </div>
                </TableCell>
                {comRecebimento && (
                  <TableCell className="text-xs text-muted-foreground">
                    Provisório {data(l.recebimentoProvisorioEm)}
                    <br />
                    Definitivo {data(l.recebimentoDefinitivoEm)}
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground">{idade(l.atualizadaEm)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
