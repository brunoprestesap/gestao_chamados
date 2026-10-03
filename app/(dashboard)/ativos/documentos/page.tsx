import { ChevronLeft, ChevronRight, Download, FileBadge, FileCheck2 } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

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
import { mapaDeNomesDeTipo } from '@/lib/ativos/documentos/ficha';
import {
  listarDocumentosPainel,
  listarFaltando,
  type Pagina,
  prediosDoMapa,
  TAMANHO_PAGINA_DOCUMENTOS,
} from '@/lib/ativos/documentos/painel';
import { podeVerDocumentos } from '@/lib/ativos/documentos/permissao';
import { listarLocaisAtivos, mapaDeLocais } from '@/lib/ativos/localizacao';
import { canManage, requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { cn } from '@/lib/utils';
import { FiltroPainelDocumentosSchema } from '@/shared/ativos/documento.schemas';

import { FiltrosDocumentos } from './_components/FiltrosDocumentos';
import { NovoDocumentoDialog } from './_components/NovoDocumentoDialog';
import { SituacaoDocumentoBadge } from './_components/SituacaoDocumentoBadge';

type Busca = Record<string, string | string[] | undefined>;

function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function linkCom(busca: Busca, mudancas: Record<string, string | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(busca)) {
    const valor = primeiro(v);
    if (valor && k !== 'pagina') p.set(k, valor);
  }
  for (const [k, v] of Object.entries(mudancas)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  const qs = p.toString();
  return qs ? `/ativos/documentos?${qs}` : '/ativos/documentos';
}

function Paginacao({ pagina, busca }: { pagina: Pagina<unknown>; busca: Busca }) {
  const inicio = pagina.total === 0 ? 0 : (pagina.pagina - 1) * TAMANHO_PAGINA_DOCUMENTOS + 1;
  const fim = Math.min(pagina.pagina * TAMANHO_PAGINA_DOCUMENTOS, pagina.total);
  const link = (n: number) => linkCom(busca, { pagina: n > 1 ? String(n) : null });
  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-4 py-3 text-sm text-muted-foreground"
    >
      <span>
        {pagina.total === 0 ? 'Nenhum resultado' : `${inicio} a ${fim} de ${pagina.total}`}
      </span>
      <div className="flex items-center gap-2">
        {pagina.pagina > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={link(pagina.pagina - 1)} aria-label="Página anterior">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled aria-label="Página anterior">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
        )}
        <span className="tabular-nums">
          Página {pagina.pagina} de {pagina.paginas}
        </span>
        {pagina.pagina < pagina.paginas ? (
          <Button asChild variant="outline" size="sm">
            <Link href={link(pagina.pagina + 1)} aria-label="Próxima página">
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
  );
}

function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <FileCheck2 className="h-8 w-8 text-muted-foreground/60" aria-hidden />
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

/** Painel de documentos (spec 0013, AC-9 e AC-10): Admin, Preposto e Técnico. */
export default async function DocumentosPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const sessao = await requireSession();
  if (!podeVerDocumentos(sessao.role)) redirect('/dashboard');

  const busca = await searchParams;
  const filtro = FiltroPainelDocumentosSchema.parse({
    visao: primeiro(busca.visao),
    tipo: primeiro(busca.tipo) || undefined,
    situacao: primeiro(busca.situacao) || undefined,
    predio: primeiro(busca.predio) || undefined,
    pagina: primeiro(busca.pagina),
  });
  const gestao = canManage(sessao.role);

  await dbConnect();
  const [nomes, locais, arvore, documentos, faltando] = await Promise.all([
    mapaDeNomesDeTipo(),
    mapaDeLocais(),
    gestao ? listarLocaisAtivos() : Promise.resolve([]),
    filtro.visao === 'documentos' ? listarDocumentosPainel(filtro) : Promise.resolve(null),
    filtro.visao === 'faltando' ? listarFaltando(filtro) : Promise.resolve(null),
  ]);

  const tiposAtivos = [...nomes.entries()]
    .filter(([, t]) => t.isActive)
    .map(([chave, t]) => ({ chave, nome: t.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  // O filtro mostra também os desativados: os documentos deles continuam valendo.
  const tiposFiltro = [...nomes.entries()]
    .map(([chave, t]) => ({ chave, nome: t.isActive ? t.nome : `${t.nome} (desativado)` }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const predios = prediosDoMapa(locais);

  const abas = [
    { valor: 'documentos', rotulo: 'Documentos' },
    { valor: 'faltando', rotulo: 'Faltando' },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentos"
        subtitle="Laudos e certificados dos equipamentos e dos locais: o que vence, o que venceu e o que falta."
        actions={
          gestao && tiposAtivos.length > 0 ? (
            <NovoDocumentoDialog
              tipos={tiposAtivos}
              locais={arvore.map((l) => ({ id: l.id, caminho: l.caminho }))}
            />
          ) : undefined
        }
      />

      <nav aria-label="Visões do painel" className="flex gap-1 rounded-xl bg-muted/60 p-1 sm:w-fit">
        {abas.map((a) => {
          const atual = filtro.visao === a.valor;
          return (
            <Link
              key={a.valor}
              href={linkCom(
                { tipo: busca.tipo, predio: busca.predio },
                { visao: a.valor === 'faltando' ? 'faltando' : null },
              )}
              aria-current={atual ? 'page' : undefined}
              className={cn(
                'flex-1 rounded-lg px-4 py-1.5 text-center text-sm font-medium transition sm:flex-none',
                atual
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {a.rotulo}
            </Link>
          );
        })}
      </nav>

      <FiltrosDocumentos visao={filtro.visao} tipos={tiposFiltro} predios={predios} />

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
        {documentos &&
          (documentos.itens.length === 0 ? (
            <Vazio titulo="Nenhum documento" texto="Nenhum documento vigente com estes filtros." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento de</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Arquivo</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documentos.itens.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="max-w-[18rem]">
                        {d.alvo.tipo === 'ativo' ? (
                          <>
                            <Link
                              href={`/ativos/${d.alvo.id}`}
                              className="font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline"
                            >
                              {d.alvo.codigo}
                            </Link>
                            <span className="line-clamp-1 text-xs text-muted-foreground">
                              {d.alvo.descricao}
                            </span>
                          </>
                        ) : (
                          <span className="line-clamp-2 text-sm">{d.alvo.caminho}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{d.tipoNome}</TableCell>
                      <TableCell>{d.numero ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {d.validadeAteTexto ?? '—'}
                      </TableCell>
                      <TableCell>
                        <SituacaoDocumentoBadge situacao={d.situacao} texto={d.situacaoTexto} />
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm">
                          <a
                            href={d.href}
                            target="_blank"
                            rel="noopener"
                            aria-label={`Abrir o arquivo do ${d.tipoNome}`}
                          >
                            <Download className="h-4 w-4" aria-hidden />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}

        {faltando &&
          (faltando.itens.length === 0 ? (
            <Vazio
              titulo="Nada faltando"
              texto="Todo equipamento tem os documentos que a categoria exige, nele ou nos locais acima."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipamento</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Falta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faltando.itens.map((f) => (
                    <TableRow key={`${f.ativoId}-${f.tipo}`}>
                      <TableCell className="max-w-[18rem]">
                        <Link
                          href={`/ativos/${f.ativoId}`}
                          className="font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline"
                        >
                          {f.codigo}
                        </Link>
                        <span className="line-clamp-1 text-xs text-muted-foreground">
                          {f.descricao}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[16rem]">
                        <span className="line-clamp-2 text-sm">{f.caminho ?? 'Sem local'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <FileBadge className="h-4 w-4 text-amber-600" aria-hidden />
                          {f.tipoNome}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}

        <Paginacao pagina={(documentos ?? faltando)!} busca={busca} />
      </div>
    </div>
  );
}
