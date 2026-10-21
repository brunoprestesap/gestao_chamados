import { Paperclip } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CotacaoDTO } from '@/lib/material/serializar';
import { cn } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';
import { formatarCnpj } from '@/shared/contratos/cnpj';
import { ROTULO_FASE_ORCAMENTO, TEXTO_DETALHE as T } from '@/shared/material/mensagens';

/**
 * A aba Orçamentos do detalhe (spec 0021, AC-7): a grade de itens por
 * fornecedor, com o menor preço de cada item destacado. Só os orçamentos do
 * envio disputam o menor preço; o complemento da urgência nunca entra no
 * preço aplicado (spec 0019). O cabeçalho de cada coluna diz a validade, se
 * venceu (`vencidos`, lido pelo servidor na análise) e se é complemento.
 */

const dataBr = (ymd: string) => ymd.split('-').reverse().join('/');

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Belem',
    dateStyle: 'short',
    timeStyle: 'short',
  });

export function AbaOrcamentos({
  cotacao: c,
  vencidos,
}: {
  cotacao: CotacaoDTO;
  vencidos: ReadonlySet<string>;
}) {
  const orcamentos = c.orcamentos ?? [];
  if (!orcamentos.length) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{T.semOrcamentos}</p>;
  }
  const preco = new Map(
    orcamentos.flatMap((o) =>
      o.precos.map((p) => [`${o.id}:${p.itemId}`, p.valorUnitarioCentavos]),
    ),
  );
  const itens = (c.itens ?? []).filter((i) => orcamentos.some((o) => preco.has(`${o.id}:${i.id}`)));
  const menor = new Map(
    itens.map((i) => {
      const valores = orcamentos
        .filter((o) => o.fase === 'envio')
        .map((o) => preco.get(`${o.id}:${i.id}`))
        .filter((v): v is number => v != null);
      return [i.id, valores.length ? Math.min(...valores) : null];
    }),
  );
  const confirmacao = new Map((c.confirmacoesVencido ?? []).map((x) => [x.orcamentoId, x]));

  return (
    <div className="space-y-3 pt-4">
      <p className="px-5 text-[13px] text-muted-foreground">{T.orcamentosAjuda}</p>
      <div className="overflow-x-auto">
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5 align-bottom">{T.colunaItem}</TableHead>
              {orcamentos.map((o) => {
                const conf = confirmacao.get(o.id);
                return (
                  <TableHead
                    key={o.id}
                    scope="col"
                    className="h-auto py-2.5 text-right align-bottom whitespace-normal last:pr-5"
                  >
                    <span className="block font-semibold text-foreground">{o.fornecedor}</span>
                    <span className="block text-xs font-normal">
                      {formatarCnpj(o.cnpj)} ·{' '}
                      {o.validade ? T.validade(dataBr(o.validade)) : T.semValidade}
                    </span>
                    {conf ? (
                      <span className="block text-xs font-normal text-orange-800 dark:text-orange-300">
                        {T.vencidaConfirmada(conf.porNome, dataHora(conf.em))}
                      </span>
                    ) : (
                      vencidos.has(o.id) && (
                        <span className="block text-xs font-semibold text-orange-800 dark:text-orange-300">
                          {T.validadeVencida}
                        </span>
                      )
                    )}
                    {o.fase === 'complemento' && (
                      <span className="block text-xs font-normal">
                        {ROTULO_FASE_ORCAMENTO.complemento}
                      </span>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="max-w-[260px] pl-5 whitespace-normal">
                  {i.descricao}
                </TableCell>
                {orcamentos.map((o) => {
                  const v = preco.get(`${o.id}:${i.id}`);
                  const ehMenor = v != null && o.fase === 'envio' && v === menor.get(i.id);
                  return (
                    <TableCell key={o.id} className="text-right tabular-nums last:pr-5">
                      {v == null ? (
                        <span className="text-muted-foreground">{T.naoCotou}</span>
                      ) : (
                        <span
                          className={cn(
                            ehMenor &&
                              'rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100',
                          )}
                        >
                          {formatarReais(v)}
                          {ehMenor && <span className="sr-only"> ({T.menorPreco})</span>}
                        </span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 pb-4 text-[13px]">
        {orcamentos.map((o) => (
          <li key={o.id}>
            <a
              href={`/api/cotacoes/arquivos/${o.arquivoId}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Paperclip className="size-3.5" aria-hidden="true" />
              {T.arquivoDoOrcamento(o.fornecedor)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
