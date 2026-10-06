'use client';

import { Cpu, Undo2, X } from 'lucide-react';
import { useId } from 'react';

import { cn } from '@/lib/utils';
import type { AtivoDoCartao } from '@/shared/conversas/conversa.schemas';

import {
  CARTAO_EQUIPAMENTO,
  CARTAO_EQUIPAMENTO_DESFAZER,
  CARTAO_EQUIPAMENTO_ESCOLHA,
  CARTAO_EQUIPAMENTO_NAO_SEI,
  CARTAO_EQUIPAMENTO_TIRADO,
  CARTAO_EQUIPAMENTO_TIRAR,
} from '../_constants';

/**
 * A linha Equipamento do cartão resumo (spec 0014, AC-5). Com um candidato,
 * ele já vem marcado e um botão o tira; com vários, uma escolha única com
 * "Não sei" já marcado. Tirar ou "Não sei" mandam `ativoId: null`.
 *
 * No cartão substituído a linha aparece desabilitada, como o resto dele.
 */

type Props = {
  ativo: AtivoDoCartao;
  /** `null` é "sem equipamento" (tirado ou "Não sei"). */
  escolhido: string | null;
  onEscolher: (ativoId: string | null) => void;
  desabilitado: boolean;
};

type Candidato = AtivoDoCartao['candidatos'][number];

function Descricao({ candidato }: { candidato: Candidato }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold break-words text-foreground">
        {candidato.codigo}
        {candidato.descricao ? (
          <span className="font-normal text-foreground"> · {candidato.descricao}</span>
        ) : null}
      </span>
      <span className="block text-xs break-words text-muted-foreground">
        {candidato.caminho ?? '—'}
      </span>
    </span>
  );
}

export function LinhaEquipamento({ ativo, escolhido, onEscolher, desabilitado }: Props) {
  const idBase = useId();
  const tituloId = `${idBase}-titulo`;
  const [unico] = ativo.candidatos.length === 1 ? ativo.candidatos : [];

  if (unico) {
    const tirado = escolhido !== unico.ativoId;
    return (
      <div
        role="group"
        aria-labelledby={tituloId}
        className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/40 px-3 py-3"
      >
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200"
        >
          <Cpu className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p id={tituloId} className="text-xs font-medium text-muted-foreground">
            {CARTAO_EQUIPAMENTO}
          </p>
          {tirado ? (
            <p className="text-sm text-foreground">{CARTAO_EQUIPAMENTO_TIRADO}</p>
          ) : (
            <Descricao candidato={unico} />
          )}
        </div>
        <button
          type="button"
          disabled={desabilitado}
          onClick={() => onEscolher(tirado ? unico.ativoId : null)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          {tirado ? (
            <>
              <Undo2 aria-hidden="true" className="size-3.5" />
              {CARTAO_EQUIPAMENTO_DESFAZER}
            </>
          ) : (
            <>
              <X aria-hidden="true" className="size-3.5" />
              {CARTAO_EQUIPAMENTO_TIRAR}
              <span className="sr-only">: {unico.codigo}</span>
            </>
          )}
        </button>
      </div>
    );
  }

  const opcoes: { valor: string | null; candidato: Candidato | null }[] = [
    ...ativo.candidatos.map((c) => ({ valor: c.ativoId, candidato: c })),
    { valor: null, candidato: null },
  ];

  return (
    <fieldset role="radiogroup" className="flex flex-col gap-2" disabled={desabilitado}>
      <legend className="mb-2 text-sm font-medium text-foreground">
        {CARTAO_EQUIPAMENTO}
        <span className="ml-1.5 font-normal text-muted-foreground">
          {CARTAO_EQUIPAMENTO_ESCOLHA}
        </span>
      </legend>
      <div className="flex flex-col gap-2">
        {opcoes.map(({ valor, candidato }) => {
          const marcado = escolhido === valor;
          return (
            <label
              key={valor ?? 'nao-sei'}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
                'has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50',
                marcado
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-input bg-background hover:bg-muted/50',
                desabilitado && 'pointer-events-none opacity-60',
              )}
            >
              <input
                type="radio"
                name={`${idBase}-ativo`}
                value={valor ?? ''}
                checked={marcado}
                disabled={desabilitado}
                onChange={() => onEscolher(valor)}
                className="size-4 shrink-0 accent-primary"
              />
              {candidato ? (
                <Descricao candidato={candidato} />
              ) : (
                <span className="text-sm text-foreground">{CARTAO_EQUIPAMENTO_NAO_SEI}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
