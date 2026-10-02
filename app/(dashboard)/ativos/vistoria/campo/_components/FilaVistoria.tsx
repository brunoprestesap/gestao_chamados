'use client';

import { CloudUpload, Loader2, RefreshCw, Tag, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn, formatDateTime } from '@/lib/utils';
import type { OperacaoGuardada } from '@/lib/vistoria-offline';
import {
  CAMPO_TECNICO_LABELS,
  CAMPOS_TECNICOS,
  ESTADO_OPERACAO_LABELS,
  type EstadoOperacao,
} from '@/shared/vistoria/vistoria.constants';

const COR_ESTADO: Record<EstadoOperacao, string> = {
  pendente: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  enviada: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  ja_conferido: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  recusada: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
};

/** Itens mostrados; a fila inteira continua guardada e sobe toda. */
const LIMITE_LISTA = 40;

/**
 * O código que a tela mostra: o definitivo que o servidor devolveu (o `MNT-`
 * do cadastro interno, AC-12) ou, antes disso, o da operação (o provisório).
 */
export function codigoNaTela(op: OperacaoGuardada): string {
  return op.resultado?.codigo ?? op.rotulo.codigo;
}

/** Interno cadastrado que já subiu: a etiqueta a colar no equipamento (AC-12). */
export function etiquetaParaColar(op: OperacaoGuardada): string | null {
  const interno = op.operacao.tipo === 'cadastro' && op.operacao.origemCodigo === 'interno';
  return interno && op.estado === 'enviada' && op.resultado?.codigo ? op.resultado.codigo : null;
}

/** O que a pessoa informou, para comparar com a conferência que venceu (AC-8). */
function informado(op: OperacaoGuardada): string {
  const partes = [`local ${op.rotulo.local}`];
  for (const campo of CAMPOS_TECNICOS) {
    const v = op.operacao[campo];
    if (v) partes.push(`${CAMPO_TECNICO_LABELS[campo]} ${v}`);
  }
  return partes.join('; ');
}

/**
 * A fila deste aparelho (spec 0012, AC-6 e AC-8): quantas aguardam envio, o
 * botão "Sincronizar" (que não depende de `navigator.onLine`) e o resultado
 * de cada item.
 */
export function FilaVistoria({
  operacoes,
  sincronizando,
  aviso,
  onSincronizar,
  onDescartar,
}: {
  operacoes: OperacaoGuardada[];
  sincronizando: boolean;
  aviso: string | null;
  onSincronizar: () => void;
  onDescartar: (clientOpId: string) => void;
}) {
  const pendentes = operacoes.filter((o) => o.estado === 'pendente').length;
  const recentes = [...operacoes].reverse().slice(0, LIMITE_LISTA);

  return (
    <section
      aria-labelledby="titulo-fila"
      className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-fila" className="flex items-center gap-2.5 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <CloudUpload className="h-4 w-4" aria-hidden />
          </span>
          Neste aparelho
        </h2>
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={onSincronizar}
          disabled={sincronizando}
        >
          {sincronizando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          Sincronizar
        </Button>
      </div>

      <p aria-live="polite" className="mt-3 text-sm">
        {pendentes === 0 ? (
          <span className="text-muted-foreground">Nada aguardando envio.</span>
        ) : (
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {pendentes === 1 ? '1 pendente' : `${pendentes} pendentes`} de envio
          </span>
        )}
      </p>
      {aviso && (
        <p role="status" className="mt-2 text-sm text-destructive">
          {aviso}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Sincronize no mesmo dia: alguns celulares apagam os dados guardados de um site que ficou
        cerca de uma semana sem uso.
      </p>

      {recentes.length > 0 && (
        <ul className="mt-4 divide-y divide-border/60">
          {recentes.map((op) => (
            <li key={op.clientOpId} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    <span className="font-mono">{codigoNaTela(op)}</span> · {op.rotulo.descricao}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{op.rotulo.local}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                    COR_ESTADO[op.estado],
                  )}
                >
                  {ESTADO_OPERACAO_LABELS[op.estado]}
                </span>
              </div>

              {etiquetaParaColar(op) && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <Tag className="h-3.5 w-3.5" aria-hidden />
                  Etiquete como <span className="font-mono">{etiquetaParaColar(op)}</span>
                </p>
              )}

              {op.estado === 'enviada' && op.resultado?.mensagem && (
                <p className="mt-2 text-xs text-sky-700 dark:text-sky-400">
                  {op.resultado.mensagem}
                </p>
              )}

              {op.estado === 'ja_conferido' && op.resultado && (
                <div className="mt-2 rounded-lg bg-sky-500/5 p-2.5 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Já conferido por {op.resultado.conferidoPor ?? 'outra pessoa'}
                    {op.resultado.conferidoEm && ` em ${formatDateTime(op.resultado.conferidoEm)}`}
                  </p>
                  <p className="mt-0.5">Você informou: {informado(op)}</p>
                </div>
              )}

              {op.estado === 'recusada' && (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-destructive">
                    Recusado: {op.resultado?.mensagem ?? 'motivo não informado'}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 text-xs"
                    onClick={() => onDescartar(op.clientOpId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Descartar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
