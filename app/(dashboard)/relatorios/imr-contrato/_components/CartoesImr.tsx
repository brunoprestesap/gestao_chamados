import { Sigma } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatarFator } from '@/shared/imr-contrato/formato';
import {
  type Reincidencia,
  TEXTO_REINCIDENCIA_NAO_AVALIADA,
  TEXTO_SEM_REINCIDENCIA,
  TEXTO_SOMA_RN50,
  textoReincidenciaZero,
} from '@/shared/imr-contrato/imr-contrato.constants';

import { type VistaImr } from './apoio';

/** Os cartões dos indicadores e o da soma, na tela do IMR do contrato (spec 0023). */

export function CartaoIndicador({
  numero,
  titulo,
  icone,
  maximo,
  pontos,
  detalhe,
  destaque,
}: {
  numero: number;
  titulo: string;
  icone: ReactNode;
  maximo: number;
  pontos: number | null;
  detalhe: string;
  destaque: string;
}) {
  return (
    <Card className="group relative overflow-hidden rounded-2xl border-border/50 transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r opacity-60 transition-opacity group-hover:opacity-100',
          destaque,
        )}
        aria-hidden="true"
      />
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Indicador {numero}</p>
            <p className="text-sm font-semibold">{titulo}</p>
          </div>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted transition-transform group-hover:scale-105">
            {icone}
          </div>
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {pontos === null ? '—' : pontos}
          <span className="text-sm font-normal text-muted-foreground"> / {maximo} pontos</span>
        </p>
        <p className="text-xs text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  );
}

export function Numero({
  rotulo,
  valor,
  ajuda,
}: {
  rotulo: string;
  valor: number;
  ajuda?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
      {ajuda ? <p className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}

type Contagem = { ocorrencias: number; desconsideradas: number; zeradoPorMarcacao: boolean };

/** O resumo do cartão do indicador: atrasos, desconsiderados e o zero por marcação. */
export function detalheDoCartao(r: Contagem, marca: string): string {
  return [
    r.ocorrencias === 1 ? '1 atraso no mês' : `${r.ocorrencias} atrasos no mês`,
    r.desconsideradas === 0
      ? null
      : r.desconsideradas === 1
        ? '1 desconsiderado'
        : `${r.desconsideradas} desconsiderados`,
    r.zeradoPorMarcacao ? `zerado por ${marca}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function TextoReincidencia({ r }: { r: Reincidencia }) {
  if (!r.avaliada) {
    return (
      <p className="text-sm text-muted-foreground">{TEXTO_REINCIDENCIA_NAO_AVALIADA[r.motivo]}</p>
    );
  }
  if (r.zerados.length === 0) {
    return <p className="text-sm text-muted-foreground">{TEXTO_SEM_REINCIDENCIA}</p>;
  }
  return (
    <ul className="space-y-1">
      {r.zerados.map((n) => (
        <li key={n} className="text-sm font-medium text-rose-700 dark:text-rose-300">
          {textoReincidenciaZero(n)}
        </li>
      ))}
    </ul>
  );
}

/** Soma, faixa e reincidência (AC-1, AC-10, AC-12, AC-17). */
export function CartaoSoma({
  vista,
  i3,
  i4,
  reincidencia,
}: {
  vista: VistaImr;
  i3: number;
  i4: number;
  reincidencia: Reincidencia;
}) {
  return (
    <Card className="rounded-2xl border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sigma className="size-4 text-indigo-600" aria-hidden="true" />
          Soma e faixa de pagamento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {vista.tipo === 'foto' ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Soma dos quatro indicadores</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {vista.total}
                <span className="text-sm font-normal text-muted-foreground"> / 100 pontos</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Faixa de pagamento</dt>
              <dd className="text-2xl font-semibold tabular-nums">{vista.faixa.percentual}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fator</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {formatarFator(vista.faixa.fator)}
              </dd>
            </div>
          </dl>
        ) : (
          <div>
            <p className="text-xs text-muted-foreground">Soma parcial (indicadores 3 e 4)</p>
            <p className="text-2xl font-semibold tabular-nums">
              {i3 + i4}
              <span className="text-sm font-normal text-muted-foreground"> / 40 pontos</span>
            </p>
            <p className="text-xs text-muted-foreground">
              A soma final, a faixa e o fator saem no fechamento, com os pontos dos indicadores 1 e
              2.
            </p>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Reincidência de zero</p>
          <TextoReincidencia r={reincidencia} />
          {vista.tipo === 'previa' && reincidencia.avaliada ? (
            <p className="text-xs text-muted-foreground">
              Na prévia, só os indicadores 3 e 4 são avaliados.
            </p>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{TEXTO_SOMA_RN50}</p>
      </CardContent>
    </Card>
  );
}
