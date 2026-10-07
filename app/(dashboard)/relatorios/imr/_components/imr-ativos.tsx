'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { IndicadoresAtivos, IndicadoresDoFiltro } from '@/lib/ativos/indicadores';
import type { SituacoesSubstituicao } from '@/lib/ativos/substituicao';
import { cn } from '@/lib/utils';
import { formatarTempoIndicador as tempo } from '@/shared/ativos/indicadores-formato';
import { plural, textoDoMotivo } from '@/shared/ativos/substituicao.constants';
import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';
import type { TipoServico } from '@/shared/chamados/tipo-servico';

import { DialogoDispensaSubstituicao } from '../../../ativos/_components/DialogoDispensaSubstituicao';

/**
 * A aba Ativos do IMR (spec 0014, AC-15 a AC-19). Só informativa: nenhum
 * número daqui entra no Resumo Geral, nas abas por tipo nem nas penalidades.
 * O servidor já manda "Todos" e cada tipo; o seletor só troca a vista.
 */

type Filtro = 'todos' | TipoServico;

function percentual(valor: number | null): string {
  return valor === null ? '—' : `${valor.toLocaleString('pt-BR')}%`;
}

function Numero({ rotulo, valor, ajuda }: { rotulo: string; valor: string; ajuda?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold break-words">{valor}</p>
      {ajuda ? <p className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}

function VistaDoFiltro({ dados }: { dados: IndicadoresDoFiltro }) {
  const { topo, ranking } = dados;

  if (topo.corretivosComAtivo === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nenhum corretivo com equipamento vinculado neste período e filtro.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-violet-300/40 bg-violet-50/40 dark:bg-violet-950/20">
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Numero rotulo="Corretivos com equipamento" valor={String(topo.corretivosComAtivo)} />
            <Numero
              rotulo="Corretivos com equipamento (%)"
              valor={percentual(topo.percentualComAtivo)}
              ajuda="do total de corretivos do período"
            />
            <Numero rotulo="Equipamentos afetados" valor={String(topo.ativosAfetados)} />
            <Numero
              rotulo="MTBF médio"
              valor={tempo(topo.mtbfMedioMs)}
              ajuda="tempo médio entre falhas"
            />
            <Numero
              rotulo="MTTR médio"
              valor={tempo(topo.mttrMedioMs)}
              ajuda="tempo médio de reparo"
            />
            <Numero
              rotulo="Reincidentes"
              valor={String(topo.ativosReincidentes)}
              ajuda="2 ou mais corretivos em 90 dias"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Equipamentos com mais corretivos</CardTitle>
          <p className="text-xs text-muted-foreground">
            Até {ranking.length} equipamentos, ordenados por corretivos no período e, no empate,
            pelo tempo total de reparo.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Local</TableHead>
                <TableHead className="text-right">Corretivos</TableHead>
                <TableHead className="text-right">MTBF</TableHead>
                <TableHead className="text-right">MTTR médio</TableHead>
                <TableHead className="text-right">Em 90 dias</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.map((linha) => (
                <TableRow key={linha.ativoId}>
                  <TableCell className="font-medium whitespace-nowrap">
                    <Link
                      href={`/ativos/${linha.ativoId}`}
                      className="text-primary underline-offset-4 hover:underline focus-visible:underline"
                    >
                      {linha.codigo}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[16rem] break-words whitespace-normal">
                    {linha.descricao || '—'}
                  </TableCell>
                  <TableCell>{linha.categoria ?? '—'}</TableCell>
                  <TableCell className="max-w-[16rem] break-words whitespace-normal">
                    {linha.caminho ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{linha.corretivos}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {tempo(linha.mtbfMs)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {tempo(linha.mttrMs)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{linha.corretivos90d}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Candidatos à substituição (spec 0015, AC-8): sempre até hoje, sem depender
 * do período. O servidor manda a lista plana com o tipo de cada linha; o
 * seletor da aba só filtra. Categoria sem subtipo aparece só em "Todos".
 */
function CandidatosSubstituicao({
  dados,
  filtro,
}: {
  dados: SituacoesSubstituicao | null;
  filtro: Filtro;
}) {
  if (!dados) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Candidatos à substituição</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Não foi possível calcular os candidatos agora.
        </CardContent>
      </Card>
    );
  }

  const doFiltro = (linhas: SituacoesSubstituicao['candidatos']) =>
    filtro === 'todos' ? linhas : linhas.filter((l) => l.tipoServico === filtro);
  const candidatos = doFiltro(dados.candidatos);
  const dispensados = doFiltro(dados.dispensados).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Candidatos à substituição</CardTitle>
        <p className="text-xs text-muted-foreground">
          Equipamentos Tier A e B que passaram da vida útil da categoria ou quebram demais, contados
          até hoje (12 meses e 90 dias), independente do período acima. Só informativo: nada muda no
          ativo nem nos chamados.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {candidatos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhum equipamento sinalizado para substituição.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Motivos</TableHead>
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidatos.map((linha) => (
                  <TableRow key={linha.ativoId}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <Link
                        href={`/ativos/${linha.ativoId}`}
                        className="text-primary underline-offset-4 hover:underline focus-visible:underline"
                      >
                        {linha.codigo}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[16rem] break-words whitespace-normal">
                      {linha.descricao || '—'}
                    </TableCell>
                    <TableCell>{linha.categoria}</TableCell>
                    <TableCell className="max-w-[14rem] break-words whitespace-normal">
                      {linha.caminho ?? 'Sem local'}
                    </TableCell>
                    <TableCell className="min-w-[14rem] whitespace-normal">
                      <ul className="space-y-0.5 text-sm">
                        {linha.motivos.map((m) => (
                          <li key={m.criterio}>{textoDoMotivo(m)}</li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell className="text-right">
                      <DialogoDispensaSubstituicao ativoId={linha.ativoId} codigo={linha.codigo} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {dispensados > 0 && (
          <p className="text-sm text-muted-foreground">
            <Link
              href="/ativos?substituicao=dispensados"
              className="text-primary underline-offset-4 hover:underline focus-visible:underline"
            >
              {plural(dispensados, 'dispensado', 'dispensados')}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ImrAtivos({
  ativos,
  substituicao,
}: {
  ativos: IndicadoresAtivos | null;
  /** Ausente nos testes antigos; `null` quando a leitura falhou (spec 0015, AC-8). */
  substituicao?: SituacoesSubstituicao | null;
}) {
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const opcoes: { valor: Filtro; rotulo: string }[] = [
    { valor: 'todos', rotulo: 'Todos' },
    ...TIPO_SERVICO_OPTIONS.map((tipo) => ({ valor: tipo, rotulo: tipo })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge
          variant="outline"
          className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          Informativo, sem efeito contratual
        </Badge>
        <div
          role="group"
          aria-label="Filtrar por tipo de serviço"
          className="inline-flex flex-wrap gap-1 rounded-xl border border-border/60 bg-muted/40 p-1"
        >
          {opcoes.map((opcao) => {
            const marcado = filtro === opcao.valor;
            return (
              <button
                key={opcao.valor}
                type="button"
                aria-pressed={marcado}
                onClick={() => setFiltro(opcao.valor)}
                className={cn(
                  'min-h-9 rounded-lg px-3 text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  marcado
                    ? 'bg-background font-semibold text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opcao.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Corretivo é o chamado com equipamento, aberto no período, que não veio de preventiva e não
        foi cancelado nem recusado. O MTTR desconta as pausas e só conta chamados já resolvidos.
      </p>

      {ativos ? (
        <VistaDoFiltro dados={filtro === 'todos' ? ativos.geral : ativos.porTipo[filtro]} />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Não foi possível calcular os indicadores de equipamento agora. Tente de novo em
            instantes.
          </CardContent>
        </Card>
      )}

      {substituicao !== undefined && (
        <CandidatosSubstituicao dados={substituicao} filtro={filtro} />
      )}
    </div>
  );
}
