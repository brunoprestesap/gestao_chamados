import {
  ArrowLeft,
  Building2,
  ClipboardList,
  History,
  Landmark,
  Pencil,
  Plus,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { carregarFicha, LIMITE_CHAMADOS_FICHA, LIMITE_HISTORICO_FICHA } from '@/lib/ativos/ficha';
import { canManage, requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import {
  ATIVO_HISTORY_ACAO_LABELS,
  ORIGEM_CODIGO_LABELS,
  TIERS_VINCULAVEIS,
} from '@/shared/ativos/ativo.constants';

import { STATUS_BADGE } from '../../meus-chamados/_constants';
import { AcoesGestaoAtivo } from '../_components/AcoesGestaoAtivo';
import {
  CriticidadeBadge,
  StatusAtivoBadge,
  StatusCadastroBadge,
} from '../_components/ativo-badges';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </dt>
      <dd className="mt-1 break-words text-sm text-foreground">{valor ?? '—'}</dd>
    </div>
  );
}

function CardSecao({
  titulo,
  icone: Icone,
  children,
  acao,
  className,
}: {
  titulo: string;
  icone: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('gap-4 overflow-hidden rounded-2xl border-border/50 py-5', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-5">
        <CardTitle className="flex items-center gap-2.5 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icone className="h-4 w-4" aria-hidden />
          </span>
          {titulo}
        </CardTitle>
        {acao}
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

export default async function FichaAtivoPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requireSession();
  const { id } = await params;
  await dbConnect();
  const ficha = await carregarFicha(id, sessao);
  if (!ficha) notFound();

  const gestao = canManage(sessao.role);
  // As mesmas regras do seletor (AC-14): só Tier A ou B e não baixado recebem chamado.
  const tierRecebeChamado = TIERS_VINCULAVEIS.includes(ficha.tierManutencao);
  const recebeChamado = ficha.status !== 'baixado' && tierRecebeChamado;
  const p = ficha.camposPatrimoniais;

  return (
    <div className="space-y-6">
      <Link
        href="/ativos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Ativos
      </Link>

      <header className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:p-6">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-500 via-blue-500 to-sky-400"
        />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-primary/10 px-2.5 py-1 font-mono text-sm font-semibold text-primary">
                {ficha.codigo}
              </span>
              <StatusAtivoBadge status={ficha.status} />
              <StatusCadastroBadge status={ficha.statusCadastro} />
              <CriticidadeBadge criticidade={ficha.criticidade} />
              <Badge variant="outline" className="rounded-full">
                Tier {ficha.tierManutencao}
              </Badge>
            </div>
            <h1 className="line-clamp-3 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {ficha.descricao}
            </h1>
            {!tierRecebeChamado && ficha.status !== 'baixado' && (
              <p className="text-sm text-muted-foreground">
                Equipamento Tier {ficha.tierManutencao}: fica só no cadastro e não recebe chamado.
              </p>
            )}
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4 shrink-0" aria-hidden />
              {ficha.local ? ficha.local.caminho : 'Sem local definido'}
              <span aria-hidden>·</span>
              {ficha.categoria.nome}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {recebeChamado && (
              <Button
                asChild
                className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
              >
                <Link href={`/meus-chamados?ativo=${ficha.id}`}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Abrir chamado deste ativo
                </Link>
              </Button>
            )}
            {gestao && (
              <Button asChild variant="outline">
                <Link href={`/ativos/${ficha.id}/editar`}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Editar
                </Link>
              </Button>
            )}
          </div>
        </div>
        {gestao && (
          <AcoesGestaoAtivo
            id={ficha.id}
            status={ficha.status}
            statusCadastro={ficha.statusCadastro}
            temLocal={!!ficha.local}
          />
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <CardSecao titulo="Dados técnicos" icone={Wrench} className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            <Campo rotulo="Origem do código" valor={ORIGEM_CODIGO_LABELS[ficha.origemCodigo]} />
            <Campo rotulo="Tombamento" valor={ficha.tombamento} />
            <Campo rotulo="Categoria" valor={ficha.categoria.nome} />
            <Campo rotulo="Fabricante" valor={ficha.fabricante} />
            <Campo rotulo="Modelo" valor={ficha.modelo} />
            <Campo rotulo="Número de série" valor={ficha.numeroSerie} />
            <Campo
              rotulo="Instalação"
              valor={ficha.dataInstalacao ? formatDate(ficha.dataInstalacao) : null}
            />
            <Campo
              rotulo="Validação"
              valor={
                ficha.validadoEm
                  ? `${formatDate(ficha.validadoEm)}${ficha.validadoPorNome ? `, por ${ficha.validadoPorNome}` : ''}`
                  : 'Ainda não validado'
              }
            />
          </dl>
        </CardSecao>

        {p ? (
          <CardSecao titulo="Patrimônio (SICAM)" icone={Landmark}>
            <dl className="grid gap-4">
              <Campo rotulo="Lotação" valor={p.lotacao} />
              <Campo rotulo="Setor" valor={p.setor} />
              <Campo
                rotulo="Responsável pelo termo"
                valor={
                  p.responsavelNome
                    ? `${p.responsavelNome}${p.responsavelMatricula ? ` (${p.responsavelMatricula})` : ''}`
                    : null
                }
              />
              <Campo rotulo="Data do tombo" valor={p.dataTombo ? formatDate(p.dataTombo) : null} />
              <Campo
                rotulo="Garantia"
                valor={
                  p.garantiaInicio || p.garantiaFim
                    ? `${p.garantiaInicio ? formatDate(p.garantiaInicio) : '?'} até ${p.garantiaFim ? formatDate(p.garantiaFim) : '?'}`
                    : null
                }
              />
              <Campo
                rotulo="Valor histórico"
                valor={p.valorHistorico !== undefined ? moeda.format(p.valorHistorico) : null}
              />
              <Campo rotulo="Fornecedor" valor={p.fornecedor} />
              <Campo rotulo="Código do material" valor={p.codigoMaterial} />
              {p.importadoEm && (
                <p className="text-xs text-muted-foreground">
                  Importado em {formatDateTime(p.importadoEm)}. Só leitura no Sigma.
                </p>
              )}
            </dl>
          </CardSecao>
        ) : (
          <CardSecao titulo="Local" icone={Building2}>
            <p className="text-sm text-muted-foreground">
              {ficha.local
                ? ficha.local.caminho
                : 'Este equipamento ainda não tem local. A vistoria em campo define onde ele fica.'}
            </p>
          </CardSecao>
        )}
      </div>

      <CardSecao
        titulo="Chamados deste equipamento"
        icone={ClipboardList}
        acao={
          <span className="text-sm text-muted-foreground">
            {ficha.chamados.length === LIMITE_CHAMADOS_FICHA
              ? `Os ${LIMITE_CHAMADOS_FICHA} mais recentes`
              : `${ficha.chamados.length} no total`}
          </span>
        }
      >
        {ficha.chamados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 px-4 py-10 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium text-foreground">Nenhum chamado ainda</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Quando alguém abrir um chamado apontando para este equipamento, ele aparece aqui.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Serviço</TableHead>
                  {gestao && <TableHead>Solicitante</TableHead>}
                  <TableHead>Aberto em</TableHead>
                  <TableHead>Encerrado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ficha.chamados.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">
                      {c.href ? (
                        <Link
                          href={c.href}
                          className="font-semibold text-primary underline-offset-4 hover:underline"
                        >
                          #{c.numero}
                        </Link>
                      ) : (
                        `#${c.numero}`
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('rounded-full', STATUS_BADGE[c.status])}
                      >
                        {c.statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[16rem]">
                      <span className="line-clamp-2">{c.servico}</span>
                      {c.descricao && (
                        <span className="line-clamp-1 text-xs text-muted-foreground">
                          {c.descricao}
                        </span>
                      )}
                    </TableCell>
                    {gestao && <TableCell>{c.solicitanteNome ?? '—'}</TableCell>}
                    <TableCell className="whitespace-nowrap">{formatDate(c.abertoEm)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {c.encerradoEm ? formatDate(c.encerradoEm) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardSecao>

      <CardSecao
        titulo="Linha do tempo do cadastro"
        icone={History}
        acao={
          ficha.historico.length === LIMITE_HISTORICO_FICHA ? (
            <span className="text-sm text-muted-foreground">
              Os {LIMITE_HISTORICO_FICHA} registros mais recentes
            </span>
          ) : undefined
        }
      >
        {ficha.historico.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem registros.</p>
        ) : (
          <ol className="relative space-y-5 border-l border-border/70 pl-6">
            {ficha.historico.map((h) => (
              <li key={h.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[1.85rem] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary"
                />
                <p className="text-sm font-medium text-foreground">
                  {ATIVO_HISTORY_ACAO_LABELS[h.acao]}
                  {(h.de || h.para) && (
                    <span className="font-normal text-muted-foreground">
                      {': '}
                      {h.de ?? '—'} → {h.para ?? '—'}
                    </span>
                  )}
                </p>
                {h.observacao && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{h.observacao}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {h.autor} · {formatDateTime(h.em)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardSecao>
    </div>
  );
}
