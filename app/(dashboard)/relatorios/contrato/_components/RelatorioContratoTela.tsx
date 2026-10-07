import Link from 'next/link';
import type { ReactNode } from 'react';

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
import {
  formatarDataHoraBelem,
  formatarPercentual,
  formatarTempo,
  SELO_INFORMATIVO,
  SELO_PARCIAL,
  TEXTO_SEM_CHAMADOS,
} from '@/shared/contratos/formato';
import { formatarYmd } from '@/shared/contratos/janela';
import type {
  EmissaoRelatorioContrato,
  RelatorioContrato,
} from '@/shared/contratos/relatorio.types';

import { BotaoGerarPdf } from './BotaoGerarPdf';

/** O relatório na tela (spec 0016, AC-8 a AC-15 e AC-19). Os mesmos números do PDF. */

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  ajuda,
}: {
  rotulo: string;
  valor: string | number;
  ajuda?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums break-words">{valor}</p>
      {ajuda ? <p className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}

const DIREITA = 'text-right tabular-nums whitespace-nowrap';

export function RelatorioContratoTela({
  dados,
  emissoes,
}: {
  dados: RelatorioContrato;
  emissoes: EmissaoRelatorioContrato[];
}) {
  const { contrato, janela, topo } = dados;
  const vazio = topo.corretivosTotal === 0 && topo.preventivasGeradas === 0;

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-border/50">
        <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">
              Contrato {contrato.numero}
              {contrato.isActive ? null : (
                <span className="ml-2 text-sm font-normal text-muted-foreground">(inativo)</span>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Período de {formatarYmd(janela.inicio)} a {formatarYmd(janela.fim)}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="secondary" className="rounded-full">
                {SELO_INFORMATIVO}
              </Badge>
              {janela.parcial ? (
                <Badge className="rounded-full border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  {SELO_PARCIAL}
                </Badge>
              ) : null}
            </div>
          </div>
          <BotaoGerarPdf contratoId={contrato.id} mes={janela.mes} />
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Empresa">{contrato.empresa}</Campo>
            <Campo rotulo="CNPJ">{contrato.cnpjFormatado}</Campo>
            <Campo rotulo="Processo SEI">{contrato.processoSei}</Campo>
            {contrato.objeto ? <Campo rotulo="Objeto">{contrato.objeto}</Campo> : null}
            {contrato.fiscal ? <Campo rotulo="Fiscal">{contrato.fiscal}</Campo> : null}
            <Campo rotulo="Tipos de serviço">{contrato.tiposServico.join(', ')}</Campo>
            <Campo rotulo="Vigência">
              {formatarYmd(contrato.vigenciaInicio)} a {formatarYmd(contrato.vigenciaFim)}
            </Campo>
            <Campo rotulo="Gerado em">
              {formatarDataHoraBelem(dados.geradoEm)} por {dados.geradoPorNome}
            </Campo>
          </dl>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-violet-300/40 bg-violet-50/40 dark:bg-violet-950/20">
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <Numero
              rotulo="Corretivos"
              valor={topo.corretivosTotal}
              ajuda={`${topo.corretivosComAtivo} com ativo, ${topo.corretivosSemAtivo} sem ativo`}
            />
            <Numero
              rotulo="Cobertura de ativo"
              valor={formatarPercentual(topo.percentualComAtivo)}
              ajuda="corretivos com ativo sobre o total"
            />
            <Numero rotulo="Ativos afetados" valor={topo.ativosAfetados} />
            <Numero
              rotulo="MTBF médio"
              valor={formatarTempo(topo.mtbfMedioMs)}
              ajuda="tempo médio entre falhas"
            />
            <Numero
              rotulo="MTTR médio"
              valor={formatarTempo(topo.mttrMedioMs)}
              ajuda="tempo médio de reparo"
            />
            <Numero
              rotulo="Ativos reincidentes"
              valor={topo.ativosReincidentes}
              ajuda="2 ou mais corretivos em 90 dias"
            />
            <Numero
              rotulo="Preventivas"
              valor={`${topo.preventivasConcluidas} de ${topo.preventivasGeradas}`}
              ajuda="concluídas de geradas"
            />
            <Numero
              rotulo="Cumprimento de SLA"
              valor={formatarPercentual(topo.sla.percentualDentro)}
              ajuda="dentro sobre dentro mais fora"
            />
            <Numero
              rotulo="SLA dentro / fora"
              valor={`${topo.sla.dentro} / ${topo.sla.fora}`}
              ajuda="só corretivos com ativo"
            />
            <Numero
              rotulo="Em andamento / sem SLA"
              valor={`${topo.sla.emAndamento} / ${topo.sla.semSla}`}
            />
          </div>
        </CardContent>
      </Card>

      {vazio ? (
        <Card className="rounded-2xl">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {TEXTO_SEM_CHAMADOS}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Por categoria</CardTitle>
              <p className="text-xs text-muted-foreground">
                &ldquo;Ativos no escopo&rdquo; é o retrato de hoje, não do mês. O total de
                reincidentes do resumo pode ser maior, porque conta também ativo sem chamado no
                período.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Ativos no escopo</TableHead>
                    <TableHead className="text-right">Com chamado</TableHead>
                    <TableHead className="text-right">Corretivos</TableHead>
                    <TableHead className="text-right">MTTR médio</TableHead>
                    <TableHead className="text-right">Reincidentes</TableHead>
                    <TableHead className="text-right">SLA dentro</TableHead>
                    <TableHead className="text-right">SLA fora</TableHead>
                    <TableHead className="text-right">
                      Preventivas (concluídas de geradas)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.categorias.map((c) => (
                    <TableRow key={c.categoriaId ?? 'sem-categoria'}>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell className={DIREITA}>{c.ativosNoEscopo}</TableCell>
                      <TableCell className={DIREITA}>{c.ativosComChamado}</TableCell>
                      <TableCell className={DIREITA}>{c.corretivos}</TableCell>
                      <TableCell className={DIREITA}>{formatarTempo(c.mttrMedioMs)}</TableCell>
                      <TableCell className={DIREITA}>{c.reincidentes}</TableCell>
                      <TableCell className={DIREITA}>{c.slaDentro}</TableCell>
                      <TableCell className={DIREITA}>{c.slaFora}</TableCell>
                      <TableCell className={DIREITA}>
                        {c.preventivasConcluidas} de {c.preventivasGeradas}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Por ativo</CardTitle>
              <p className="text-xs text-muted-foreground">
                {dados.ativos.length} {dados.ativos.length === 1 ? 'ativo' : 'ativos'} com corretivo
                ou preventiva no período.
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
                    <TableHead className="text-right">SLA dentro</TableHead>
                    <TableHead className="text-right">SLA fora</TableHead>
                    <TableHead className="text-right">Em andamento</TableHead>
                    <TableHead className="text-right">
                      Preventivas (concluídas de geradas)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.ativos.map((a) => (
                    <TableRow key={a.ativoId}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <Link
                          href={`/ativos/${a.ativoId}`}
                          className="text-primary underline-offset-4 hover:underline focus-visible:underline"
                        >
                          {a.codigo}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[16rem] break-words whitespace-normal">
                        {a.descricao || '—'}
                      </TableCell>
                      <TableCell>{a.categoria ?? 'Sem categoria'}</TableCell>
                      <TableCell className="max-w-[16rem] break-words whitespace-normal">
                        {a.caminho ?? '—'}
                      </TableCell>
                      <TableCell className={DIREITA}>{a.corretivos}</TableCell>
                      <TableCell className={DIREITA}>{formatarTempo(a.mtbfMs)}</TableCell>
                      <TableCell className={DIREITA}>{formatarTempo(a.mttrMs)}</TableCell>
                      <TableCell className={DIREITA}>
                        {a.corretivos90d}
                        {a.reincidente ? (
                          <Badge variant="destructive" className="ml-2 rounded-full">
                            reincidente
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className={DIREITA}>{a.sla.dentro}</TableCell>
                      <TableCell className={DIREITA}>{a.sla.fora}</TableCell>
                      <TableCell className={DIREITA}>{a.sla.emAndamento}</TableCell>
                      <TableCell className={DIREITA}>
                        {a.preventivasConcluidas} de {a.preventivasGeradas}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Card className="rounded-2xl border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">PDFs emitidos deste mês</CardTitle>
          <p className="text-xs text-muted-foreground">
            O código sai no rodapé do PDF; o hash prova qual arquivo foi anexado ao processo.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {emissoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum PDF emitido para este mês.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gerado em</TableHead>
                  <TableHead>Por</TableHead>
                  <TableHead>Código da emissão</TableHead>
                  <TableHead>Hash (SHA-256)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emissoes.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatarDataHoraBelem(e.geradoEm)}
                    </TableCell>
                    <TableCell>{e.geradoPorNome}</TableCell>
                    <TableCell className="font-mono text-xs">{e.id}</TableCell>
                    <TableCell className="font-mono text-xs" title={e.hashSha256}>
                      {e.hashSha256.slice(0, 12)}…
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
