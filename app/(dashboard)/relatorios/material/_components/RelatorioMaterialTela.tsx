import {
  AlertTriangle,
  CalendarRange,
  ChevronRight,
  Clock,
  type LucideIcon,
  RotateCcw,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CaixaRolavel } from '@/app/(dashboard)/cotacoes/_components/detalhe/CaixaRolavel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Fracao, RelatorioMaterial } from '@/lib/material/relatorio';
import { cn } from '@/lib/utils';
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import { formatarYmd } from '@/shared/contratos/janela';
import { RELATORIO_MATERIAL_MAX_DIAS } from '@/shared/material/material.constants';
import {
  ROTULO_SITUACAO,
  TEXTO_RELATORIO as T,
  TEXTO_SEM_COTACOES_NO_PERIODO,
  TEXTO_SEM_ITENS_COM_EQUIVALENTE,
  TEXTO_TENTATIVAS_DESDE_A_FATIA_5,
  textoProjecaoCurta,
} from '@/shared/material/mensagens';
import {
  atalhoDoPeriodo,
  type AtalhoPeriodo,
  ATALHOS_PERIODO,
  periodosDosAtalhos,
} from '@/shared/material/relatorio';

const CARTAO = 'rounded-2xl border border-border/50 bg-card shadow-sm';

function percentual(f: Fracao): string {
  if (f.denominador === 0) return TEXTO_SEM_COTACOES_NO_PERIODO;
  return `${((f.numerador / f.denominador) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function dias(n: number | null): string {
  if (n == null) return TEXTO_SEM_COTACOES_NO_PERIODO;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

/** A largura de uma barra em relação à maior, com um mínimo visível. */
const largura = (parte: number, todo: number) =>
  `${todo > 0 ? Math.max(2, Math.min(100, (parte / todo) * 100)) : 0}%`;

function Secao({
  id,
  titulo,
  descricao,
  cheia = false,
  children,
}: {
  id: string;
  titulo: string;
  descricao?: string;
  /** O conteúdo vai de borda a borda (tabela), sem a margem lateral. */
  cheia?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className={cn(CARTAO, 'scroll-mt-20 space-y-3 overflow-hidden py-4 sm:py-5')}
    >
      <div className="space-y-1 px-4 sm:px-5">
        <h2 id={`${id}-titulo`} className="text-base font-semibold">
          {titulo}
        </h2>
        {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      </div>
      <div className={cn(!cheia && 'px-4 sm:px-5')}>{children}</div>
    </section>
  );
}

/** Um dos quatro números do topo (AC-23): rótulo, valor e ajuda, com o ícone ao lado. */
function Numero({
  title,
  value,
  helper,
  icon: Icone,
}: {
  title: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
}) {
  return (
    <div className={cn(CARTAO, 'flex items-start justify-between gap-3 p-4 sm:p-5')}>
      <div className="min-w-0 space-y-1">
        <p className="text-[13px] font-semibold text-muted-foreground">{title}</p>
        <p
          className={cn(
            'tracking-tight tabular-nums',
            // A frase de vazio vai em letra menor; número e dinheiro, grandes.
            value === TEXTO_SEM_COTACOES_NO_PERIODO
              ? 'pt-1 text-sm font-medium'
              : 'text-2xl font-bold',
          )}
        >
          {value}
        </p>
        {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
      </div>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
        <Icone className="h-5 w-5" aria-hidden="true" />
      </span>
    </div>
  );
}

function Vazio({ texto = TEXTO_SEM_COTACOES_NO_PERIODO }: { texto?: string }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{texto}</p>;
}

/**
 * A tela do relatório de material (spec 0019, AC-41), repaginada na spec 0021
 * (AC-23): atalhos de período, os quatro números, o custo por equipamento em
 * barras, os empenhos com saldo e projeção e os pontos de atenção. Só
 * leitura, montada no servidor.
 */
export function RelatorioMaterialTela({
  relatorio: r,
  erroPeriodo,
  pedido,
  hoje,
  atalho = null,
}: {
  relatorio: RelatorioMaterial;
  erroPeriodo: string | null;
  pedido: { inicio: string; fim: string };
  /** O dia de hoje em Belém, `YYYY-MM-DD`. */
  hoje: string;
  /** O atalho do endereço: desempata quando dois atalhos dão as mesmas datas. */
  atalho?: AtalhoPeriodo | null;
}) {
  const atalhos = periodosDosAtalhos(hoje);
  const atual = erroPeriodo ? null : atalhoDoPeriodo(r.periodo, hoje, atalho);
  const maiorCusto = r.custoPorAtivo.ativos[0]?.valorCentavos ?? 0;
  const pesquisaPendente = r.urgencias.filter((u) => !u.pesquisaCompleta).length;
  const acima = r.consumoAnexoV.filter((l) => l.acima).length;
  const pontos = [
    {
      ancora: '#urgencias',
      titulo: T.atencao.urgencias(r.urgencias.length),
      ajuda: T.atencao.urgenciasAjuda(pesquisaPendente),
      n: r.urgencias.length,
    },
    {
      ancora: '#fracionamento',
      titulo: T.atencao.fracionamento(r.fracionamento.length),
      ajuda: T.atencao.fracionamentoAjuda,
      n: r.fracionamento.length,
    },
    { ancora: '#consumo', titulo: T.atencao.acima(acima), ajuda: T.atencao.acimaAjuda, n: acima },
  ].filter((p) => p.n > 0);

  return (
    <div className="space-y-6">
      <section aria-label={T.periodo.grupo} className="space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <ul className="flex flex-wrap gap-1 rounded-xl border border-border/50 bg-card p-1">
            {ATALHOS_PERIODO.map((a) => (
              <li key={a}>
                <Link
                  href={`?atalho=${a}&inicio=${atalhos[a].inicio}&fim=${atalhos[a].fim}`}
                  aria-current={atual === a ? 'true' : undefined}
                  className={cn(
                    'inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    atual === a
                      ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200'
                      : 'text-foreground/80 hover:bg-muted',
                  )}
                >
                  {T.periodo.atalho[a]}
                </Link>
              </li>
            ))}
          </ul>
          <details
            open={atual == null}
            className="group min-w-0 rounded-xl border border-border/50 bg-card"
          >
            <summary
              aria-current={atual == null ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-medium',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                atual == null
                  ? 'text-indigo-800 dark:text-indigo-200'
                  : 'text-foreground/80 hover:bg-muted',
              )}
            >
              <CalendarRange className="h-4 w-4" aria-hidden="true" />
              {T.periodo.outro}
            </summary>
            <form
              method="get"
              className="flex flex-wrap items-end gap-3 border-t border-border/50 p-3"
              aria-describedby={erroPeriodo ? 'erro-periodo' : 'ajuda-periodo'}
            >
              <div className="space-y-1.5">
                <Label htmlFor="inicio">{T.periodo.de}</Label>
                <Input
                  id="inicio"
                  name="inicio"
                  type="date"
                  defaultValue={pedido.inicio}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fim">{T.periodo.ate}</Label>
                <Input id="fim" name="fim" type="date" defaultValue={pedido.fim} required />
              </div>
              <Button type="submit" variant="gradiente">
                {T.periodo.ver}
              </Button>
              <p id="ajuda-periodo" className="w-full text-xs text-muted-foreground">
                {T.periodo.ajuda(RELATORIO_MATERIAL_MAX_DIAS)}
              </p>
            </form>
          </details>
        </div>
        <p className="text-xs text-muted-foreground">
          {T.periodo.mostrando(formatarYmd(r.periodo.inicio), formatarYmd(r.periodo.fim))}
        </p>
        {erroPeriodo && (
          <p id="erro-periodo" role="alert" className="text-sm text-destructive">
            {T.periodo.erro(erroPeriodo)}
          </p>
        )}
      </section>

      <section aria-label={T.numeros.rotulo} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          title={T.numeros.tempo}
          value={dias(r.tempoAutorizacao.mediaDias)}
          helper={
            r.tempoAutorizacao.quantidade
              ? T.numeros.tempoAjuda(
                  dias(r.tempoAutorizacao.medianaDias),
                  r.tempoAutorizacao.quantidade,
                )
              : undefined
          }
          icon={Clock}
        />
        <Numero
          title={T.numeros.devolvidas}
          value={percentual(r.devolvidas)}
          helper={
            r.devolvidas.denominador
              ? T.numeros.devolvidasAjuda(r.devolvidas.numerador, r.devolvidas.denominador)
              : undefined
          }
          icon={RotateCcw}
        />
        <Numero
          title={T.numeros.impedimento}
          value={percentual(r.impedimentoPrimeiraTentativa)}
          helper={TEXTO_TENTATIVAS_DESDE_A_FATIA_5}
          icon={ShieldAlert}
        />
        <Numero
          title={T.numeros.divergencia}
          value={
            r.divergencia.cotacoes
              ? formatarReais(r.divergencia.diferencaCentavos)
              : TEXTO_SEM_COTACOES_NO_PERIODO
          }
          helper={
            r.divergencia.cotacoes
              ? T.numeros.divergenciaAjuda(r.divergencia.comDiferenca, r.divergencia.cotacoes)
              : undefined
          }
          icon={Scale}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Secao
          id="custo-ativo"
          titulo={T.custo.titulo}
          descricao={T.custo.descricao(
            formatarReais(r.custoPorAtivo.totalCentavos),
            formatarReais(r.custoPorAtivo.semAtivoCentavos),
          )}
        >
          {r.custoPorAtivo.ativos.length === 0 ? (
            <Vazio texto={T.custo.vazio} />
          ) : (
            <ol className="space-y-2.5">
              {r.custoPorAtivo.ativos.map((a) => (
                <li
                  key={a.ativoId}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
                >
                  <Link
                    href={`/ativos/${a.ativoId}`}
                    className="truncate font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                    title={a.rotulo}
                  >
                    {a.rotulo}
                  </Link>
                  <span
                    aria-hidden="true"
                    className="order-last col-span-2 h-3 overflow-hidden rounded bg-muted sm:order-none sm:col-span-1"
                  >
                    <span
                      className="block h-full rounded bg-indigo-600 dark:bg-indigo-400"
                      style={{ width: largura(a.valorCentavos, maiorCusto) }}
                    />
                  </span>
                  <span className="text-right tabular-nums">
                    {formatarReais(a.valorCentavos)}
                    <span className="block text-xs text-muted-foreground">
                      {T.custo.cotacoes(a.cotacoes)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Secao>

        <Secao id="empenhos" titulo={T.empenhos.titulo} descricao={T.empenhos.descricao}>
          {r.empenhos.length === 0 ? (
            <Vazio texto={T.empenhos.vazio} />
          ) : (
            <ul className="divide-y divide-border/50">
              {r.empenhos.map((e) => (
                <li key={e.empenhoId} className="space-y-1 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-mono font-semibold">
                      {e.numero} ({e.exercicio})
                    </span>
                    <span>{textoProjecaoCurta(e)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {T.empenhos.linha(
                      formatarReais(e.saldoCentavos),
                      e.mediaDiariaCentavos != null ? formatarReais(e.mediaDiariaCentavos) : null,
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao id="anexo-sinapi" titulo={T.tabela.titulo} descricao={T.tabela.descricao}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-indigo-50/70 p-3 dark:bg-indigo-950/30">
              <p className="text-xs text-muted-foreground">{T.tabela.diferenca}</p>
              <p
                className={cn(
                  'tabular-nums',
                  r.anexoVSinapi.itensComEquivalente
                    ? 'text-xl font-bold'
                    : 'py-1 text-sm font-medium',
                )}
              >
                {r.anexoVSinapi.itensComEquivalente
                  ? formatarReais(r.anexoVSinapi.diferencaCentavos)
                  : TEXTO_SEM_ITENS_COM_EQUIVALENTE}
              </p>
              <p className="text-xs text-muted-foreground">
                {T.tabela.diferencaAjuda(r.anexoVSinapi.itensComEquivalente)}
              </p>
            </div>
            <div className="rounded-xl bg-orange-50/80 p-3 dark:bg-orange-950/30">
              <p className="text-xs text-muted-foreground">{T.tabela.semEquivalente}</p>
              <p className="text-xl font-bold tabular-nums">
                {formatarReais(r.anexoVSinapi.semEquivalenteCentavos)}
              </p>
              <p className="text-xs text-muted-foreground">
                {T.tabela.semEquivalenteAjuda(r.anexoVSinapi.itensSemEquivalente)}
                {r.anexoVSinapi.itensSemEquivalente > 0 && (
                  <>
                    {' · '}
                    <Link
                      href="/configuracoes/material?secao=anexo-v"
                      className="text-indigo-700 hover:underline dark:text-indigo-300"
                    >
                      {T.tabela.ligar}
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>
        </Secao>

        <Secao id="atencao" titulo={T.atencao.titulo}>
          {pontos.length === 0 ? (
            <Vazio texto={T.atencao.nada} />
          ) : (
            <ul className="space-y-2">
              {pontos.map((p) => (
                <li key={p.ancora}>
                  <a
                    href={p.ancora}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>
                      <strong className="font-semibold">{p.titulo}</strong>
                      <span className="text-muted-foreground"> · {p.ajuda}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Secao
          id="urgencias"
          titulo={T.urgencias.titulo(r.urgencias.length)}
          descricao={T.urgencias.descricao}
          cheia
        >
          {r.urgencias.length === 0 ? (
            <Vazio />
          ) : (
            <CaixaRolavel rotulo={T.urgencias.titulo(r.urgencias.length)}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-5">{T.urgencias.cotacao}</TableHead>
                    <TableHead>{T.urgencias.chamado}</TableHead>
                    <TableHead>{T.urgencias.decisao}</TableHead>
                    <TableHead>{T.urgencias.pesquisa}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.urgencias.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="pl-4 sm:pl-5">
                        <Link
                          href={`/cotacoes/${u.id}`}
                          className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                        >
                          {u.numero}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {ROTULO_SITUACAO[u.situacao]}
                        </span>
                      </TableCell>
                      <TableCell>{u.chamado ? `#${u.chamado}` : '—'}</TableCell>
                      <TableCell>
                        {u.decisao === 'aceita'
                          ? T.urgencias.aceita
                          : u.decisao === 'recusada'
                            ? T.urgencias.recusada
                            : T.urgencias.semDecisao}
                      </TableCell>
                      <TableCell>
                        {u.pesquisaCompleta ? T.urgencias.completa : T.urgencias.pendente}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CaixaRolavel>
          )}
        </Secao>

        <Secao
          id="fracionamento"
          titulo={T.fracionamento.titulo(r.fracionamento.length)}
          descricao={T.fracionamento.descricao}
        >
          {r.fracionamento.length === 0 ? (
            <Vazio />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {r.fracionamento.map((c) => (
                <li key={c.id}>
                  <Link href={`/cotacoes/${c.id}`} className="rounded-md">
                    <Badge variant="outline" className="font-mono hover:bg-muted">
                      {c.numero}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>

      <Secao id="consumo" titulo={T.consumo.titulo} descricao={T.consumo.descricao} cheia>
        {r.consumoAnexoV.length === 0 ? (
          <Vazio texto={T.consumo.vazio} />
        ) : (
          <CaixaRolavel rotulo={T.consumo.titulo}>
            <Table className="min-w-[40rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-5">{T.consumo.item}</TableHead>
                  <TableHead>{T.consumo.contrato}</TableHead>
                  <TableHead className="w-1/4">{T.consumo.consumo}</TableHead>
                  <TableHead className="text-right">{T.consumo.usado}</TableHead>
                  <TableHead>{T.consumo.situacao}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.consumoAnexoV.map((l) => (
                  <TableRow key={`${l.contrato}-${l.numero}`}>
                    <TableCell className="pl-4 whitespace-normal sm:pl-5">
                      <span className="font-mono text-[13px]">{l.numero}</span> · {l.descricao}
                    </TableCell>
                    <TableCell>{l.contrato}</TableCell>
                    <TableCell>
                      <span
                        aria-hidden="true"
                        className="block h-2 overflow-hidden rounded-full bg-muted"
                      >
                        <span
                          className={cn(
                            'block h-full rounded-full',
                            l.acima ? 'bg-orange-600' : 'bg-indigo-600 dark:bg-indigo-400',
                          )}
                          style={{ width: largura(l.consumida, l.estimada) }}
                        />
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarQuantidade(l.consumida)} / {formatarQuantidade(l.estimada)}{' '}
                      {l.unidade}
                    </TableCell>
                    <TableCell>
                      {l.acima ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200"
                        >
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          {T.consumo.acima}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">{T.consumo.dentro}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CaixaRolavel>
        )}
      </Secao>
    </div>
  );
}
