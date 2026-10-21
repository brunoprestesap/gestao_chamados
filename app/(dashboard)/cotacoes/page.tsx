import { ChevronRight } from 'lucide-react';
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
import { requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import {
  ABAS_DE_TRAMITE,
  type Fila,
  type LinhaFila,
  listarFila,
  resumoDaFila,
} from '@/lib/material/leitura';
import { cn } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';
import type { PapelEvento } from '@/shared/material/material.constants';
import {
  ROTULO_PAPEL,
  TEXTO_FILA as T,
  textoNaEtapaHa,
  textoPaginaFila,
  textoQuantidadeItens,
} from '@/shared/material/mensagens';

import { JornadaCotacao } from './_components/compartilhado/JornadaCotacao';
import { SinaisCotacao } from './_components/compartilhado/SinaisCotacao';
import { SituacaoPill } from './_components/compartilhado/SituacaoPill';
import { BarraFila } from './_components/fila/BarraFila';
import { hrefFila } from './_components/fila/endereco';
import { ResumoFila } from './_components/fila/ResumoFila';

/** Acima disto, "na etapa há" ganha destaque (spec 0021, AC-4). */
const DIAS_DE_DESTAQUE = 5;

/**
 * A fila das cotações de material (specs 0019 e 0021). Abre para quem tem
 * designação vigente; o Admin sem designação lê tudo. A contratada tem
 * `Minhas ações`, `Ateste` e `Todas`, sem valor. Busca, "Só urgentes" e
 * página vão no endereço; no celular cada linha vira um cartão.
 */
export default async function CotacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; q?: string; urgente?: string; pagina?: string }>;
}) {
  const sessao = await requireSession();
  const params = await searchParams;
  await dbConnect();
  const quem = { userId: sessao.userId, role: sessao.role };
  const [fila, resumo] = await Promise.all([
    listarFila(quem, {
      aba: params.aba,
      q: params.q,
      urgente: params.urgente === '1',
      pagina: Number(params.pagina) || 1,
    }),
    resumoDaFila(quem),
  ]);
  if (!fila) redirect('/dashboard');

  // A gestão abre o chamado no sheet; o técnico responsável técnico não tem essa tela.
  const hrefChamado =
    sessao.role === 'Admin' || sessao.role === 'Preposto'
      ? (id: string) => `/gestao?chamado=${id}`
      : null;
  const papeis = fila.papeis.map((p) => ROTULO_PAPEL[p as PapelEvento] ?? p);
  const comFiltro = !!fila.q || fila.urgente;
  const vazio = comFiltro ? T.vazioComFiltro : T.vazio[fila.aba];

  return (
    <div className="space-y-6">
      <PageHeader
        title={T.titulo}
        subtitle={T.subtitulo}
        actions={
          <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/50 bg-card px-3 text-sm text-muted-foreground">
            {T.voceAtuaComo}
            <strong className="font-semibold text-foreground">
              {papeis.length ? papeis.join(', ') : T.somenteLeitura}
            </strong>
          </span>
        }
      />

      <ResumoFila resumo={resumo} />

      <section className="overflow-hidden rounded-2xl border border-border/50 bg-card">
        <BarraFila
          key={`${fila.q}|${fila.urgente}`}
          aba={fila.aba}
          abas={fila.abas}
          contagens={fila.contagens}
          q={fila.q}
          urgente={fila.urgente}
          ordemDeTramite={ABAS_DE_TRAMITE.includes(fila.aba)}
        >
          {fila.linhas.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">{vazio}</p>
          ) : (
            <>
              <TabelaFila fila={fila} hrefChamado={hrefChamado} />
              <CartoesFila fila={fila} />
            </>
          )}
          <Paginacao fila={fila} />
        </BarraFila>
      </section>
    </div>
  );
}

function NaEtapa({ dias }: { dias: number }) {
  return (
    <span
      className={cn(
        'tabular-nums whitespace-nowrap',
        dias > DIAS_DE_DESTAQUE
          ? 'font-semibold text-orange-800 dark:text-orange-200'
          : 'text-muted-foreground',
      )}
    >
      {textoNaEtapaHa(dias)}
    </span>
  );
}

function sinais(l: LinhaFila) {
  return (
    <SinaisCotacao
      urgente={l.urgente}
      notaFiscalPendente={l.notaFiscalPendente}
      pesquisaPendente={l.pesquisaPendente}
      prazoAteste={l.prazoAteste}
    />
  );
}

function TabelaFila({
  fila,
  hrefChamado,
}: {
  fila: Fila;
  hrefChamado: ((id: string) => string) | null;
}) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="px-4">{T.colunaCotacao}</TableHead>
            <TableHead className="px-4">{T.colunaChamado}</TableHead>
            <TableHead className="px-4">{T.colunaSituacao}</TableHead>
            <TableHead className="px-4">{T.colunaSinais}</TableHead>
            {fila.trf1 && <TableHead className="px-4 text-right">{T.colunaValor}</TableHead>}
            <TableHead className="px-4 text-right">{T.colunaNaEtapa}</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">{T.abrir}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fila.linhas.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="px-4 py-3.5 align-middle">
                <Link
                  href={`/cotacoes/${l.id}`}
                  className="font-mono text-[13px] font-semibold text-primary hover:underline"
                >
                  {l.numero}
                </Link>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {textoQuantidadeItens(l.quantidadeItens)}
                </div>
              </TableCell>
              <TableCell className="max-w-80 px-4 py-3.5 whitespace-normal">
                {hrefChamado ? (
                  <Link
                    href={hrefChamado(l.chamadoId)}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    #{l.chamadoNumero} · {l.chamadoTitulo}
                  </Link>
                ) : (
                  <span className="font-medium">
                    #{l.chamadoNumero} · {l.chamadoTitulo}
                  </span>
                )}
                {(l.ativo || l.local) && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {l.ativo && l.ativoId && (
                      <Link
                        href={`/ativos/${l.ativoId}`}
                        className="font-mono hover:text-primary hover:underline"
                      >
                        {l.ativo}
                      </Link>
                    )}
                    {l.ativo && l.local && ' · '}
                    {l.local}
                  </div>
                )}
              </TableCell>
              <TableCell className="px-4 py-3.5">
                <SituacaoPill situacao={l.situacao} />
                <JornadaCotacao
                  situacao={l.situacao}
                  situacaoAnterior={l.situacaoAnterior}
                  className="mt-2"
                />
              </TableCell>
              <TableCell className="px-4 py-3.5 whitespace-normal">{sinais(l)}</TableCell>
              {fila.trf1 && (
                <TableCell className="px-4 py-3.5 text-right font-medium tabular-nums">
                  {l.valorCentavos != null ? formatarReais(l.valorCentavos) : '—'}
                </TableCell>
              )}
              <TableCell className="px-4 py-3.5 text-right">
                <NaEtapa dias={l.naEtapaDias} />
              </TableCell>
              <TableCell className="py-3.5 pr-3">
                {/* Atalho de mouse: o link do número já leva ao mesmo lugar pelo teclado. */}
                <Button asChild variant="ghost" size="icon-sm">
                  <Link href={`/cotacoes/${l.id}`} tabIndex={-1} aria-hidden="true">
                    <ChevronRight />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** No celular (AC-4): número, selo, título do chamado, sinais e "na etapa há". */
function CartoesFila({ fila }: { fila: Fila }) {
  return (
    <ul className="divide-y divide-border/50 md:hidden">
      {fila.linhas.map((l) => (
        <li key={l.id} className="relative space-y-2 px-4 py-3.5 hover:bg-muted/40">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/cotacoes/${l.id}`}
              className="font-mono text-[13px] font-semibold text-primary after:absolute after:inset-0 hover:underline"
            >
              {l.numero}
            </Link>
            <SituacaoPill situacao={l.situacao} />
          </div>
          <p className="text-sm font-medium">
            #{l.chamadoNumero} · {l.chamadoTitulo}
          </p>
          <div className="flex items-end justify-between gap-2">
            {sinais(l)}
            <span className="shrink-0 text-xs">
              <NaEtapa dias={l.naEtapaDias} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Paginacao({ fila }: { fila: Fila }) {
  const ultima = Math.max(1, Math.ceil(fila.total / fila.porPagina));
  const href = (pagina: number) =>
    hrefFila({ aba: fila.aba, q: fila.q, urgente: fila.urgente, pagina });
  return (
    <nav
      aria-label="Páginas da fila"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-4 py-3 text-sm text-muted-foreground"
    >
      <span>{textoPaginaFila(fila)}</span>
      {ultima > 1 && (
        <div className="flex gap-2">
          {fila.pagina > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href(fila.pagina - 1)}>{T.anterior}</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              {T.anterior}
            </Button>
          )}
          {fila.pagina < ultima ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href(fila.pagina + 1)}>{T.proxima}</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              {T.proxima}
            </Button>
          )}
        </div>
      )}
    </nav>
  );
}
