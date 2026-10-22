'use client';

import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { BarraEmpenhoDTO } from '@/lib/material/serializar';
import { cn } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';
import {
  ROTULO_FECHAR_DIALOGO,
  TEXTO_APROVAR as T,
  textoProjecaoCurta,
} from '@/shared/material/mensagens';

import { BarraSaldoEmpenho } from '../compartilhado/BarraSaldoEmpenho';

/**
 * O diálogo Aprovar (spec 0021, AC-10): uma barra por empenho elegível com o
 * saldo depois da reserva, o destaque no empenho em que a cotação consome a
 * parcela relevante do saldo e a faixa de quem aprova. As barras e o destaque
 * vêm prontos do servidor; o servidor confere o saldo e a faixa de novo.
 */
export function DialogAprovar({
  numero,
  valorCentavos,
  barras,
  relevantes,
  faixa,
  pendente,
  onFechar,
  onConfirmar,
}: {
  numero: string;
  valorCentavos: number;
  /** As barras do bloco Empenho em aprovação: saldo depois = saldo menos o valor. */
  barras: BarraEmpenhoDTO[];
  /** Os empenhos em que o valor consome a parcela relevante do saldo. */
  relevantes: ReadonlySet<string>;
  faixa: { nome: string | null; limiteCentavos: number } | null;
  pendente: boolean;
  onFechar: () => void;
  onConfirmar: (empenhoId: string) => void;
}) {
  const rotuloEmpenho = useId();
  const comSaldo = barras.filter((b) => b.saldoDepoisCentavos >= 0);
  const [empenhoId, setEmpenhoId] = useState(comSaldo.length === 1 ? comSaldo[0]!.empenhoId : '');
  // Depois de um refresh, a escolha pode ter perdido o saldo: sem ela, o botão trava.
  const escolhaValida = comSaldo.some((b) => b.empenhoId === empenhoId);

  return (
    <Dialog open onOpenChange={(o) => !o && !pendente && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>{T.titulo(numero)}</DialogTitle>
          <DialogDescription>{T.descricao(formatarReais(valorCentavos))}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          <p
            id={rotuloEmpenho}
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {T.empenho}
          </p>
          {barras.length === 0 ? (
            <p className="text-sm text-muted-foreground">{T.semElegivel}</p>
          ) : (
            <RadioGroup
              value={empenhoId}
              onValueChange={setEmpenhoId}
              aria-labelledby={rotuloEmpenho}
              className="gap-2.5"
            >
              {barras.map((b) => {
                const cabe = b.saldoDepoisCentavos >= 0;
                const destaque = cabe && relevantes.has(b.empenhoId);
                const esta = b.estaCotacaoCentavos ?? valorCentavos;
                const saldo = b.saldoDepoisCentavos + esta;
                const usa = saldo > 0 ? Math.round((esta * 100) / saldo) : 100;
                const linha = cabe
                  ? [
                      T.depois(formatarReais(b.saldoDepoisCentavos)),
                      destaque ? T.usaria(usa) : null,
                      b.projecao ? textoProjecaoCurta(b.projecao) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : T.semSaldo;
                const id = `aprovar-${b.empenhoId}`;
                return (
                  <label
                    key={b.empenhoId}
                    htmlFor={id}
                    className={cn(
                      'flex gap-3 rounded-xl border border-border/70 p-3.5 transition-colors',
                      cabe ? 'cursor-pointer hover:bg-muted/40' : 'cursor-not-allowed opacity-70',
                      empenhoId === b.empenhoId &&
                        'border-indigo-400 bg-indigo-50/70 ring-1 ring-indigo-400 dark:bg-indigo-950/30',
                    )}
                  >
                    <RadioGroupItem
                      id={id}
                      value={b.empenhoId}
                      disabled={!cabe}
                      className="mt-0.5"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-2">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-mono text-[13px] font-semibold">{b.numero}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {T.saldo(formatarReais(saldo))}
                        </span>
                      </span>
                      <BarraSaldoEmpenho barra={b} variante="compacta" destaque={destaque} />
                      <span
                        className={cn(
                          'text-xs tabular-nums',
                          !cabe
                            ? 'font-medium text-rose-700 dark:text-rose-300'
                            : destaque
                              ? 'font-medium text-orange-800 dark:text-orange-300'
                              : 'text-muted-foreground',
                        )}
                      >
                        {linha}
                      </span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          )}
          {faixa && (
            <p className="rounded-xl bg-indigo-50 px-3.5 py-3 text-[13px] text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
              {T.suaFaixa}{' '}
              <strong className="font-semibold">
                {T.faixa(faixa.nome, formatarReais(faixa.limiteCentavos))}
              </strong>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pendente}>
            {ROTULO_FECHAR_DIALOGO}
          </Button>
          <Button
            variant="gradiente"
            disabled={pendente || !escolhaValida}
            onClick={() => onConfirmar(empenhoId)}
          >
            {T.botao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
