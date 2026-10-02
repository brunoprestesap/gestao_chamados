import { ArrowLeft, ChevronLeft, ChevronRight, History } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listarImportacoes } from '@/lib/ativos/importacao/pendente';
import { requireAdmin } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';

import { EnviarImportacao } from './_components/EnviarImportacao';
import { StatusImportacaoBadge } from './_components/StatusImportacaoBadge';

/**
 * Importador do SICAM (spec 0012, AC-17, AC-25 e AC-27): só o Admin. Envia o
 * export bruto e lista as importações, da mais recente para a mais antiga.
 */
export default async function ImportarSicamPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string | string[] }>;
}) {
  await requireAdmin();
  const { pagina: bruta } = await searchParams;
  const pedida = Number(Array.isArray(bruta) ? bruta[0] : bruta);
  const pagina = Number.isInteger(pedida) && pedida > 0 ? pedida : 1;

  await dbConnect();
  const lista = await listarImportacoes(pagina);

  return (
    <div className="space-y-6">
      <Link
        href="/ativos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Ativos
      </Link>

      <PageHeader
        title="Importar do SICAM"
        subtitle="Envie o export do patrimônio, veja o que é novo, o que mudou e o que sumiu, e aplique só o que você marcar."
      />

      <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:p-6">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-500 via-blue-500 to-sky-400"
        />
        <div className="max-w-xl">
          <EnviarImportacao />
        </div>
      </section>

      <section
        aria-labelledby="titulo-historico"
        className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm"
      >
        <div className="flex items-center gap-2 border-b border-border/50 px-5 py-4">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 id="titulo-historico" className="text-base font-semibold">
            Importações
          </h2>
        </div>
        {lista.itens.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nenhuma importação ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enviada em</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Por</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Novos</TableHead>
                  <TableHead className="text-right">Alterados</TableHead>
                  <TableHead className="text-right">Sumidos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.itens.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-nowrap">
                      <Link
                        href={`/ativos/importar/${i.id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {formatDateTime(i.criadaEm)}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate">{i.arquivoNome}</TableCell>
                    <TableCell className="whitespace-nowrap">{i.autorNome}</TableCell>
                    <TableCell>
                      <StatusImportacaoBadge status={i.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.novos}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.alterados}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.sumidos}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {lista.paginas > 1 && (
          <nav
            aria-label="Paginação das importações"
            className="flex items-center justify-end gap-2 border-t border-border/50 px-4 py-3 text-sm text-muted-foreground"
          >
            {pagina > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/ativos/importar?pagina=${pagina - 1}`} aria-label="Página anterior">
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled aria-label="Página anterior">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
            )}
            <span className="tabular-nums">
              Página {pagina} de {lista.paginas}
            </span>
            {pagina < lista.paginas ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/ativos/importar?pagina=${pagina + 1}`} aria-label="Próxima página">
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled aria-label="Próxima página">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
