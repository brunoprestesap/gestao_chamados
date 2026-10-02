'use client';

import { Clock, Tag, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OperacaoCadastroEnviada, OperacaoGuardada } from '@/lib/vistoria-offline';
import { ESTADO_OPERACAO_LABELS } from '@/shared/vistoria/vistoria.constants';

import { codigoNaTela, etiquetaParaColar } from './FilaVistoria';

/**
 * Um equipamento cadastrado em campo, aberto pela lista da sala ou lendo o
 * mesmo código de novo (spec 0012, AC-11): mostra o item da fila em vez de
 * oferecer outro cadastro. Depois de subir, troca o provisório pelo `MNT-`
 * definitivo e pede para etiquetar (AC-12).
 */
export function ItemCadastrado({
  operacao,
  onFechar,
}: {
  operacao: OperacaoGuardada & { operacao: OperacaoCadastroEnviada };
  onFechar: () => void;
}) {
  const etiqueta = etiquetaParaColar(operacao);
  const provisorio = operacao.operacao.origemCodigo === 'interno' && !operacao.resultado?.codigo;

  return (
    <section
      aria-labelledby="titulo-item-cadastrado"
      className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-card p-5 shadow-lg shadow-emerald-500/5 sm:p-6"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-400"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm text-muted-foreground">{codigoNaTela(operacao)}</p>
          <h2 id="titulo-item-cadastrado" className="mt-0.5 text-lg font-semibold leading-snug">
            {operacao.rotulo.descricao}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Local: {operacao.rotulo.local}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={onFechar}>
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <p
        className={cn(
          'mt-4 inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
          operacao.estado === 'pendente'
            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            : operacao.estado === 'recusada'
              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        )}
      >
        Cadastrado por você · {ESTADO_OPERACAO_LABELS[operacao.estado]}
      </p>

      <div aria-live="polite" className="mt-4 space-y-2 text-sm">
        {etiqueta && (
          <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-100">
            <Tag className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              Etiquete como <span className="font-mono text-base">{etiqueta}</span>
            </span>
          </p>
        )}
        {provisorio && operacao.estado === 'pendente' && (
          <p className="flex items-start gap-2 text-muted-foreground">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Código provisório. O código MNT definitivo sai quando o aparelho sincronizar; só então
            etiquete o equipamento.
          </p>
        )}
        {operacao.resultado?.mensagem && (
          <p
            className={
              operacao.estado === 'recusada' ? 'text-destructive' : 'text-sky-700 dark:text-sky-400'
            }
          >
            {operacao.estado === 'recusada' ? 'Recusado: ' : ''}
            {operacao.resultado.mensagem}
          </p>
        )}
      </div>
    </section>
  );
}
