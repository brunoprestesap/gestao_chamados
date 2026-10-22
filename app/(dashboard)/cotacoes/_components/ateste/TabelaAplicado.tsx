import { FileImage, FileText } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ArquivoDTO, CotacaoDTO } from '@/lib/material/serializar';
import { cn } from '@/lib/utils';
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import { TEXTO_ATESTE as T } from '@/shared/material/mensagens';
import { valorDaLinhaCentavos } from '@/shared/material/valores';

import { CaixaRolavel } from '../detalhe/CaixaRolavel';

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Belem',
    dateStyle: 'short',
    timeStyle: 'short',
  });

function tamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/** A evidência só traz o nome: o tipo sai da extensão (foto ou PDF). */
const ehPdf = (a: ArquivoDTO) => /\.pdf$/i.test(a.nomeOriginal);

/**
 * O autorizado e o aplicado por item, com as evidências da aplicação (spec
 * 0021, AC-9). Autorizado: quantidade e quantidade vezes o preço aplicado;
 * aplicado: a quantidade executada e o `valorExecutadoCentavos` do item.
 */
export function TabelaAplicado({ cotacao: c }: { cotacao: CotacaoDTO }) {
  const itens = c.itens ?? [];
  const evidencias = (c.arquivos ?? []).filter((a) => a.tipo === 'evidencia');
  const autorizado = (i: (typeof itens)[number]) =>
    i.precoAplicadoCentavos != null
      ? valorDaLinhaCentavos(i.quantidade, i.precoAplicadoCentavos)
      : null;
  const totalAutorizado = itens.reduce((soma, i) => soma + (autorizado(i) ?? 0), 0);

  return (
    <section
      aria-labelledby="aplicado-titulo"
      className="overflow-hidden rounded-2xl border border-border/50 bg-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-5 pb-3">
        <h2 id="aplicado-titulo" className="text-base font-semibold">
          {T.tabela}
        </h2>
        {c.executadoEm && (
          <p className="text-[13px] text-muted-foreground">
            {T.informadoEm(dataHora(c.executadoEm))}
          </p>
        )}
      </div>

      {itens.length > 0 && (
        <CaixaRolavel rotulo={T.tabelaRotulo}>
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">{T.colunaItem}</TableHead>
                <TableHead className="text-right">{T.colunaQtdAutorizada}</TableHead>
                <TableHead className="text-right">{T.colunaValorAutorizado}</TableHead>
                <TableHead className="text-right">{T.colunaQtdAplicada}</TableHead>
                <TableHead className="pr-5 text-right">{T.colunaValorAplicado}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((i) => {
                const valor = autorizado(i);
                const diferente =
                  i.quantidadeExecutada != null && i.quantidadeExecutada !== i.quantidade;
                return (
                  <TableRow key={i.id} className="align-top">
                    <TableCell className="max-w-[300px] pl-5 whitespace-normal">
                      <p className="font-medium">{i.descricao}</p>
                      <p className="text-xs text-muted-foreground">{i.unidade}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarQuantidade(i.quantidade)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {valor != null ? (
                        formatarReais(valor)
                      ) : (
                        <span className="text-muted-foreground">{T.semPreco}</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        diferente && 'font-semibold text-indigo-700 dark:text-indigo-300',
                      )}
                    >
                      {formatarQuantidade(i.quantidadeExecutada ?? 0)}
                    </TableCell>
                    <TableCell className="pr-5 text-right tabular-nums">
                      {formatarReais(i.valorExecutadoCentavos ?? 0)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter className="bg-transparent">
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={2} className="pl-5 font-semibold">
                  {T.total}
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">
                  {formatarReais(totalAutorizado)}
                </TableCell>
                <TableCell />
                <TableCell className="pr-5 text-right font-bold tabular-nums">
                  {formatarReais(c.valorExecutadoCentavos ?? 0)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CaixaRolavel>
      )}

      <div className="space-y-2.5 px-5 pt-4 pb-5">
        <h3 className="text-sm font-semibold">{T.evidencias(evidencias.length)}</h3>
        {evidencias.length === 0 ? (
          <p className="text-sm text-muted-foreground">{T.semEvidencias}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {evidencias.map((a) => {
              const Icone = ehPdf(a) ? FileText : FileImage;
              return (
                <li key={a.id}>
                  <a
                    href={`/api/cotacoes/arquivos/${a.id}`}
                    className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                      <Icone className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-primary">
                        {a.nomeOriginal}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {ehPdf(a) ? T.pdf : T.foto} · {tamanho(a.tamanho)}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
