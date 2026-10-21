import Link from 'next/link';

import type { DetalheCotacao } from '@/lib/material/leitura';
import { formatarReais } from '@/shared/chamados/custo';
import { type EtapaJornada, situacaoAnteriorDaTrilha } from '@/shared/material/jornada';
import { TEXTO_DETALHE as T, TEXTO_FILA } from '@/shared/material/mensagens';

import { SeloUrgencia } from '../apoio';
import { JornadaCotacao } from '../compartilhado/JornadaCotacao';
import { SituacaoPill } from '../compartilhado/SituacaoPill';

/**
 * O cabeçalho do detalhe (spec 0021, AC-5): número, selo, urgência, chamado,
 * ativo, quem montou e o total, e a jornada de 7 etapas com a data de cada
 * etapa vencida. O técnico vê a jornada sem datas (o serializador não manda).
 */
export function CabecalhoCotacao({
  detalhe,
  linkChamado,
}: {
  detalhe: DetalheCotacao;
  linkChamado: string;
}) {
  const { cotacao: c, chamado } = detalhe;
  const datas: Partial<Record<EtapaJornada, string>> = Object.fromEntries(
    (c.etapas ?? []).map((e) => [e.situacao, e.em]),
  );

  return (
    <div className="space-y-4">
      <nav aria-label={T.trilhaNavegacao} className="text-[13px] text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/cotacoes" className="text-primary hover:underline">
              {TEXTO_FILA.titulo}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-mono">
            {c.numero}
          </li>
        </ol>
      </nav>

      <header className="space-y-5 rounded-2xl border border-border/50 bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight">
                <span className="sr-only">Cotação</span>{' '}
                <span className="font-mono">{c.numero}</span>
              </h1>
              <SituacaoPill situacao={c.situacao} />
              {c.urgencia?.pedida && <SeloUrgencia />}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                {T.chamado}{' '}
                <Link href={linkChamado} className="text-primary hover:underline">
                  {chamado.numero} · {chamado.titulo}
                </Link>
              </span>
              {chamado.ativo && (
                <span>
                  {T.ativo} {chamado.ativo}
                </span>
              )}
              {c.montadoPorNome && (
                <span>
                  {T.montadaPor}{' '}
                  <strong className="font-semibold text-foreground">{c.montadoPorNome}</strong>{' '}
                  {T.daContratada}
                </span>
              )}
            </div>
          </div>
          {c.valorTotalCentavos != null && (
            <div className="flex flex-col items-start gap-0.5 sm:items-end">
              <span className="text-xs text-muted-foreground">{T.total}</span>
              <span className="text-2xl font-bold tracking-tight tabular-nums">
                {formatarReais(c.valorTotalCentavos)}
              </span>
              {c.valorExecutadoCentavos != null && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {T.executado} {formatarReais(c.valorExecutadoCentavos)}
                </span>
              )}
            </div>
          )}
        </div>

        <JornadaCotacao
          variante="grande"
          situacao={c.situacao}
          situacaoAnterior={situacaoAnteriorDaTrilha(c.trilha ?? [])}
          datas={datas}
        />
      </header>
    </div>
  );
}
