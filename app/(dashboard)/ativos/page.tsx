import { ChevronLeft, ChevronRight, MapPinned, PackageSearch, Plus, ScanLine } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

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
import { ITENS_POR_PAGINA, listarAtivos, listarPredios } from '@/lib/ativos/lista';
import { listarCategoriasAtivas } from '@/lib/ativos/opcoes';
import { canManage, requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { SEM_LOCAL } from '@/shared/ativos/ativo.constants';
import { FiltrosListaAtivosSchema } from '@/shared/ativos/ativo.schemas';

import { StatusAtivoBadge, StatusCadastroBadge } from './_components/ativo-badges';
import { FiltrosAtivos } from './_components/FiltrosAtivos';

type Busca = Record<string, string | string[] | undefined>;

function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function linkPagina(busca: Busca, pagina: number): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(busca)) {
    const valor = primeiro(v);
    if (valor && k !== 'pagina') p.set(k, valor);
  }
  if (pagina > 1) p.set('pagina', String(pagina));
  const qs = p.toString();
  return qs ? `/ativos?${qs}` : '/ativos';
}

export default async function AtivosPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const sessao = await requireSession();
  const busca = await searchParams;
  const filtros = FiltrosListaAtivosSchema.parse({
    q: primeiro(busca.q),
    local: primeiro(busca.local),
    categoria: primeiro(busca.categoria),
    status: primeiro(busca.status),
    cadastro: primeiro(busca.cadastro),
    pagina: primeiro(busca.pagina),
  });

  await dbConnect();
  const [pagina, predios, categorias] = await Promise.all([
    listarAtivos(filtros),
    listarPredios(),
    listarCategoriasAtivas(),
  ]);
  const gestao = canManage(sessao.role);
  const inicio = pagina.total === 0 ? 0 : (pagina.pagina - 1) * ITENS_POR_PAGINA + 1;
  const fim = Math.min(pagina.pagina * ITENS_POR_PAGINA, pagina.total);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ativos"
        subtitle="Os equipamentos que a manutenção acompanha. Abra a ficha para ver o histórico e os chamados de cada um."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/ativos/ler">
                <ScanLine className="h-4 w-4" aria-hidden />
                Ler etiqueta
              </Link>
            </Button>
            {gestao && (
              <>
                <Button asChild variant="outline">
                  <Link href="/ativos/localizacoes">
                    <MapPinned className="h-4 w-4" aria-hidden />
                    Localizações
                  </Link>
                </Button>
                <Button
                  asChild
                  className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
                >
                  <Link href="/ativos/novo">
                    <Plus className="h-4 w-4" aria-hidden />
                    Cadastrar
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      <Suspense>
        <FiltrosAtivos predios={predios} categorias={categorias} />
      </Suspense>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        {pagina.itens.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <PackageSearch className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-medium">Nenhum ativo encontrado</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Ajuste a busca ou os filtros. O código busca pelo começo (11997, MNT-0001); a
              descrição, por qualquer trecho.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cadastro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagina.itens.map((a) => (
                  <TableRow key={a.id} className="group">
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={`/ativos/${a.id}`}
                        className="font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        {a.codigo}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[22rem]">
                      <span className="line-clamp-2 text-sm">{a.descricao}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{a.categoriaNome}</TableCell>
                    <TableCell className="max-w-[14rem]">
                      {a.caminho ? (
                        <span className="line-clamp-2 text-sm">{a.caminho}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">{SEM_LOCAL}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusAtivoBadge status={a.status} />
                    </TableCell>
                    <TableCell>
                      <StatusCadastroBadge status={a.statusCadastro} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <nav
          aria-label="Paginação dos ativos"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-4 py-3 text-sm text-muted-foreground"
        >
          <span>
            {pagina.total === 0 ? 'Nenhum resultado' : `${inicio} a ${fim} de ${pagina.total}`}
          </span>
          <div className="flex items-center gap-2">
            {pagina.pagina > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={linkPagina(busca, pagina.pagina - 1)} aria-label="Página anterior">
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled aria-label="Página anterior">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
            )}
            <span className="tabular-nums">
              Página {pagina.pagina} de {pagina.totalPaginas}
            </span>
            {pagina.pagina < pagina.totalPaginas ? (
              <Button asChild variant="outline" size="sm">
                <Link href={linkPagina(busca, pagina.pagina + 1)} aria-label="Próxima página">
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled aria-label="Próxima página">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}
