import {
  AlertTriangle,
  CalendarRange,
  Clock,
  Landmark,
  RotateCcw,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { KpiCard } from '@/components/dashboard/kpi-card';
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
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import { formatarYmd } from '@/shared/contratos/janela';
import {
  ROTULO_SITUACAO,
  TEXTO_SEM_COTACOES_NO_PERIODO,
  TEXTO_SEM_ITENS_COM_EQUIVALENTE,
  TEXTO_SITUACAO_PROJECAO,
  TEXTO_TENTATIVAS_DESDE_A_FATIA_5,
} from '@/shared/material/mensagens';

function percentual(f: Fracao): string {
  if (f.denominador === 0) return TEXTO_SEM_COTACOES_NO_PERIODO;
  return `${((f.numerador / f.denominador) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function dias(n: number | null): string {
  if (n == null) return TEXTO_SEM_COTACOES_NO_PERIODO;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

function Secao({
  id,
  titulo,
  descricao,
  children,
}: {
  id: string;
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-base font-semibold">
        {titulo}
      </h2>
      {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      {children}
    </section>
  );
}

function Vazio({
  colSpan,
  texto = TEXTO_SEM_COTACOES_NO_PERIODO,
}: {
  colSpan: number;
  texto?: string;
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-6 text-center text-muted-foreground">
        {texto}
      </TableCell>
    </TableRow>
  );
}

/** A tela do relatório de material (spec 0019, AC-41). Só leitura, montada no servidor. */
export function RelatorioMaterialTela({
  relatorio: r,
  erroPeriodo,
  pedido,
}: {
  relatorio: RelatorioMaterial;
  erroPeriodo: string | null;
  pedido: { inicio: string; fim: string };
}) {
  return (
    <div className="space-y-8">
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/50 p-4"
        aria-describedby={erroPeriodo ? 'erro-periodo' : undefined}
      >
        <div className="space-y-1.5">
          <Label htmlFor="inicio">De</Label>
          <Input id="inicio" name="inicio" type="date" defaultValue={pedido.inicio} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fim">Até</Label>
          <Input id="fim" name="fim" type="date" defaultValue={pedido.fim} required />
        </div>
        <Button type="submit" className="gap-2">
          <CalendarRange className="h-4 w-4" aria-hidden="true" />
          Ver período
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          Mostrando {formatarYmd(r.periodo.inicio)} a {formatarYmd(r.periodo.fim)} (dias de Belém,
          até 366 dias). Cada número entra pela data do próprio fato: a autorização, o primeiro
          envio, a execução ou o pedido de urgência.
        </p>
        {erroPeriodo && (
          <p id="erro-periodo" role="alert" className="w-full text-sm text-destructive">
            {erroPeriodo} Mostrando o mês corrente.
          </p>
        )}
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Do envio à autorização (média)"
          value={dias(r.tempoAutorizacao.mediaDias)}
          helper={
            r.tempoAutorizacao.quantidade
              ? `Mediana ${dias(r.tempoAutorizacao.medianaDias)} em ${r.tempoAutorizacao.quantidade} cotações autorizadas`
              : undefined
          }
          icon={Clock}
        />
        <KpiCard
          title="Devolvidas"
          value={percentual(r.devolvidas)}
          helper={
            r.devolvidas.denominador
              ? `${r.devolvidas.numerador} de ${r.devolvidas.denominador} enviadas pela primeira vez no período`
              : undefined
          }
          icon={RotateCcw}
        />
        <KpiCard
          title="Impedimento na primeira tentativa"
          value={percentual(r.impedimentoPrimeiraTentativa)}
          helper={TEXTO_TENTATIVAS_DESDE_A_FATIA_5}
          icon={ShieldAlert}
        />
        <KpiCard
          title="Divergência autorizado e executado"
          value={
            r.divergencia.cotacoes
              ? formatarReais(r.divergencia.diferencaCentavos)
              : TEXTO_SEM_COTACOES_NO_PERIODO
          }
          helper={
            r.divergencia.cotacoes
              ? `${r.divergencia.comDiferenca} de ${r.divergencia.cotacoes} executadas com diferença`
              : undefined
          }
          icon={Scale}
        />
      </div>

      <Secao
        id="anexo-sinapi"
        titulo="Anexo V e SINAPI"
        descricao="Itens do Anexo V nas cotações autorizadas no período, a preço do Anexo V menos o equivalente SINAPI, qualquer que seja a base aplicada."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <KpiCard
            title="Diferença para o SINAPI"
            value={
              r.anexoVSinapi.itensComEquivalente
                ? formatarReais(r.anexoVSinapi.diferencaCentavos)
                : TEXTO_SEM_ITENS_COM_EQUIVALENTE
            }
            helper={`${r.anexoVSinapi.itensComEquivalente} itens com equivalente SINAPI`}
            icon={Scale}
          />
          <KpiCard
            title="Sem equivalente SINAPI"
            value={formatarReais(r.anexoVSinapi.semEquivalenteCentavos)}
            helper={`${r.anexoVSinapi.itensSemEquivalente} itens, a preço do Anexo V`}
            icon={AlertTriangle}
          />
        </div>
      </Secao>

      <Secao
        id="custo-ativo"
        titulo="Custo de material por equipamento"
        descricao={`Valor executado no período: ${formatarReais(r.custoPorAtivo.totalCentavos)} no total, ${formatarReais(r.custoPorAtivo.semAtivoCentavos)} sem equipamento. Os 20 equipamentos de maior valor.`}
      >
        <div className="overflow-x-auto rounded-2xl border border-border/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipamento</TableHead>
                <TableHead className="text-right">Cotações</TableHead>
                <TableHead className="text-right">Valor executado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.custoPorAtivo.ativos.length === 0 && <Vazio colSpan={3} />}
              {r.custoPorAtivo.ativos.map((a) => (
                <TableRow key={a.ativoId}>
                  <TableCell>
                    <Link
                      href={`/ativos/${a.ativoId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {a.rotulo}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.cotacoes}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarReais(a.valorCentavos)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Secao>

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao
          id="urgencias"
          titulo={`Cotações por exceção de urgência (${r.urgencias.length})`}
          descricao="Pela data do pedido de urgência (RN-36)."
        >
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cotação</TableHead>
                  <TableHead>Chamado</TableHead>
                  <TableHead>Decisão</TableHead>
                  <TableHead>Pesquisa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.urgencias.length === 0 && <Vazio colSpan={4} />}
                {r.urgencias.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Link
                        href={`/cotacoes/${u.id}`}
                        className="font-medium text-primary hover:underline"
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
                        ? 'Aceita'
                        : u.decisao === 'recusada'
                          ? 'Recusada'
                          : 'Sem decisão'}
                    </TableCell>
                    <TableCell>{u.pesquisaCompleta ? 'Completa' : 'Pendente'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Secao>

        <Secao
          id="fracionamento"
          titulo={`Advertências de fracionamento (${r.fracionamento.length})`}
          descricao="Cotações com a advertência em algum ato do período."
        >
          {r.fracionamento.length === 0 ? (
            <p className="rounded-2xl border border-border/50 p-4 text-sm text-muted-foreground">
              {TEXTO_SEM_COTACOES_NO_PERIODO}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2 rounded-2xl border border-border/50 p-4">
              {r.fracionamento.map((c) => (
                <li key={c.id}>
                  <Link href={`/cotacoes/${c.id}`}>
                    <Badge variant="outline" className="hover:bg-muted">
                      {c.numero}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>

      <Secao
        id="consumo"
        titulo="Consumo por item do Anexo V"
        descricao="Acumulado do contrato, sem período: executado das cotações executadas e atestadas mais o autorizado ainda não executado, contra a quantidade estimada do item vigente."
      >
        <div className="overflow-x-auto rounded-2xl border border-border/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contrato</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Consumido</TableHead>
                <TableHead className="text-right">Estimado</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.consumoAnexoV.length === 0 && (
                <Vazio colSpan={5} texto="Nenhum item do Anexo V consumido até agora." />
              )}
              {r.consumoAnexoV.map((l) => (
                <TableRow key={`${l.contrato}-${l.numero}`}>
                  <TableCell>{l.contrato}</TableCell>
                  <TableCell>
                    <span className="font-medium">{l.numero}</span> · {l.descricao}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarQuantidade(l.consumida)} {l.unidade}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarQuantidade(l.estimada)} {l.unidade}
                  </TableCell>
                  <TableCell>
                    {l.acima ? (
                      <Badge
                        variant="outline"
                        className="border-amber-300 text-amber-800 dark:text-amber-200"
                      >
                        Acima do estimado
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Dentro</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Secao>

      <Secao
        id="empenhos"
        titulo="Saldo e projeção dos empenhos"
        descricao="Hoje, sem período. O consumo médio vem das reservas e liberações dos últimos 90 dias; reforço e anulação não entram."
      >
        <div className="overflow-x-auto rounded-2xl border border-border/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empenho</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Consumo médio por dia</TableHead>
                <TableHead>Projeção</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.empenhos.length === 0 && (
                <Vazio colSpan={4} texto="Nenhum empenho ativo cadastrado." />
              )}
              {r.empenhos.map((e) => (
                <TableRow key={e.empenhoId}>
                  <TableCell className="font-medium">
                    <Landmark
                      className="mr-1 inline h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {e.numero} ({e.exercicio})
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarReais(e.saldoCentavos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.mediaDiariaCentavos != null ? formatarReais(e.mediaDiariaCentavos) : '—'}
                  </TableCell>
                  <TableCell>
                    {e.situacao === 'estimada' && e.dataEstimada
                      ? `Esgota por volta de ${formatarYmd(e.dataEstimada)}`
                      : TEXTO_SITUACAO_PROJECAO[e.situacao]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Secao>
    </div>
  );
}
