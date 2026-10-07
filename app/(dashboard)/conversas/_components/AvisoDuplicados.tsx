'use client';

import { AlertCircle, Copy, Eye, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, useSyncExternalStore } from 'react';

import { cn } from '@/lib/utils';
import { CHAMADO_STATUS_LABELS } from '@/shared/chamados/chamado.constants';
import type { DuplicadoDoCartao } from '@/shared/conversas/conversa.schemas';

import {
  DUPLICADOS_ACOMPANHANDO,
  DUPLICADOS_ACOMPANHAR,
  DUPLICADOS_DICA,
  DUPLICADOS_PROPRIO,
  DUPLICADOS_TITULO,
  DUPLICADOS_VER,
  DUPLICADOS_VER_MEU,
  FALHA_REDE,
  fraseDoAcompanhar,
} from '../_constants';
import { acompanharChamadoAction } from '../actions';
import { abertoHa } from './tempo';

/**
 * O aviso de chamado duplicado no cartão resumo (spec 0017, AC-7). Mostra até
 * três chamados em andamento que parecem ser o mesmo problema, sem nenhum dado
 * de quem os abriu. Confirmar o cartão continua sendo o "abrir mesmo assim":
 * este bloco nunca impede a abertura.
 *
 * Item de outra pessoa tem "Acompanhar este"; item próprio diz que a pessoa já
 * o abriu; quem já enxerga o chamado (gestão, técnico atribuído) só navega.
 */

type Props = {
  duplicados: DuplicadoDoCartao[];
  conversaId: string | null;
  cartaoId: string;
  /** Cartão substituído: o bloco aparece desabilitado, como o resto dele. */
  atual: boolean;
  /** O cartão está confirmando ou esperando resposta. */
  bloqueado: boolean;
  /** O servidor disse que este cartão não vale mais. */
  onDesatualizado: () => void;
};

const nadaParaAssinar = () => () => undefined;

/**
 * `true` só no navegador, depois de hidratar. A idade do chamado depende do
 * relógio e do fuso de quem lê: o HTML do servidor sai sem ela, e o navegador
 * a acrescenta logo em seguida, sem divergência na hidratação.
 */
function useNoNavegador(): boolean {
  return useSyncExternalStore(
    nadaParaAssinar,
    () => true,
    () => false,
  );
}

function linhaDoItem(item: DuplicadoDoCartao, comIdade: boolean): string {
  return [
    `#${item.ticketNumber}`,
    item.rotuloServico,
    item.localExato,
    item.ativoCodigo,
    CHAMADO_STATUS_LABELS[item.status],
    comIdade ? abertoHa(item.abertoEm) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const LINK =
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

export function AvisoDuplicados({
  duplicados,
  conversaId,
  cartaoId,
  atual,
  bloqueado,
  onDesatualizado,
}: Props) {
  const router = useRouter();
  const noNavegador = useNoNavegador();
  const idBase = useId();
  const tituloId = `${idBase}-titulo`;
  const falhaId = `${idBase}-falha`;
  const [acompanhando, setAcompanhando] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  const inativo = !atual || bloqueado || acompanhando !== null || !conversaId;

  async function acompanhar(chamadoId: string) {
    if (inativo || !conversaId) return;
    setFalha(null);
    setAcompanhando(chamadoId);
    try {
      const resultado = await acompanharChamadoAction({ conversaId, cartaoId, chamadoId });
      if (resultado.ok) {
        router.push(`/conversas/${resultado.chamadoId}`);
        return;
      }
      setFalha(fraseDoAcompanhar(resultado.reason));
      if (resultado.reason === 'cartao_desatualizado') onDesatualizado();
    } catch {
      setFalha(FALHA_REDE);
    }
    setAcompanhando(null);
  }

  return (
    <section
      aria-labelledby={tituloId}
      className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 dark:border-amber-800/60 dark:bg-amber-950/30"
    >
      <div className="flex items-start gap-2">
        <Copy
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
        />
        <div className="min-w-0">
          <h4 id={tituloId} className="text-sm font-semibold text-foreground">
            {DUPLICADOS_TITULO}
          </h4>
          {atual ? <p className="text-xs text-muted-foreground">{DUPLICADOS_DICA}</p> : null}
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {duplicados.map((item) => (
          <li
            key={item.chamadoId}
            className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm break-words text-foreground">
                {linhaDoItem(item, noNavegador)}
              </p>
              {item.proprio ? (
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                  {DUPLICADOS_PROPRIO}
                </p>
              ) : null}
            </div>

            {item.proprio || item.jaTemAcesso ? (
              atual ? (
                <Link href={`/conversas/${item.chamadoId}`} className={LINK}>
                  <Eye aria-hidden="true" className="size-4" />
                  {item.proprio ? DUPLICADOS_VER_MEU : DUPLICADOS_VER}
                  <span className="sr-only"> #{item.ticketNumber}</span>
                </Link>
              ) : null
            ) : (
              <button
                type="button"
                onClick={() => acompanhar(item.chamadoId)}
                disabled={inativo}
                aria-describedby={falha ? falhaId : undefined}
                className={cn(LINK, 'disabled:pointer-events-none disabled:opacity-50')}
              >
                {acompanhando === item.chamadoId ? (
                  <>
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    {DUPLICADOS_ACOMPANHANDO}
                  </>
                ) : (
                  <>
                    <Eye aria-hidden="true" className="size-4" />
                    {DUPLICADOS_ACOMPANHAR}
                    <span className="sr-only"> #{item.ticketNumber}</span>
                  </>
                )}
              </button>
            )}
          </li>
        ))}
      </ul>

      {falha ? (
        <p
          id={falhaId}
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {falha}
        </p>
      ) : null}
    </section>
  );
}
