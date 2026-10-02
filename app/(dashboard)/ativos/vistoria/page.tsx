import { Building2, CalendarCheck2, MapPinned, MapPinOff, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { canManage, requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';
import { campanhaDaCobertura } from '@/lib/vistoria/campanha';
import { calcularCobertura, type CoberturaCampanha } from '@/lib/vistoria/cobertura';
import { CAMPANHA_STATUS_LABELS, podeVistoriar } from '@/shared/vistoria/vistoria.constants';

import { AbrirCampanha, EncerrarCampanha } from './_components/GestaoCampanha';

/**
 * Vistoria em campo (spec 0012, AC-1 e AC-2): a campanha aberta (ou a última
 * encerrada) e a cobertura por prédio. Admin e Preposto abrem e encerram; o
 * Técnico só acompanha e vai para o campo. O Solicitante não chega aqui.
 */
export default async function VistoriaPage() {
  const sessao = await requireSession();
  if (!podeVistoriar(sessao.role)) redirect('/dashboard');
  const gestao = canManage(sessao.role);

  await dbConnect();
  const campanha = await campanhaDaCobertura();
  const cobertura = campanha ? await calcularCobertura(campanha.id) : null;
  const aberta = campanha?.status === 'aberta';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vistoria em campo"
        subtitle="Confira os equipamentos sala por sala, mesmo sem sinal, e acompanhe quanto já foi conferido."
        actions={
          aberta ? (
            <Button
              asChild
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
            >
              <Link href="/ativos/vistoria/campo">
                <Smartphone className="h-4 w-4" aria-hidden />
                Ir para o campo
              </Link>
            </Button>
          ) : null
        }
      />

      {!campanha && (
        <section className="rounded-2xl border border-dashed border-border/70 bg-card p-6 text-center shadow-sm sm:p-10">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPinned className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Nenhuma campanha aberta</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {gestao
              ? 'Abra uma campanha para a equipe começar a conferir os equipamentos em campo.'
              : 'Quando a gestão abrir uma campanha, ela aparece aqui.'}
          </p>
          {gestao && (
            <div className="mx-auto mt-6 max-w-md text-left">
              <AbrirCampanha />
            </div>
          )}
        </section>
      )}

      {campanha && (
        <section
          aria-labelledby="titulo-campanha"
          className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:p-6"
        >
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-500 via-blue-500 to-sky-400"
          />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {aberta ? 'Campanha aberta' : 'Última campanha'}
              </p>
              <h2 id="titulo-campanha" className="mt-1 truncate text-xl font-semibold">
                {campanha.nome}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden />
                  Aberta em {formatDateTime(campanha.abertaEm)}
                </span>
                {campanha.encerradaEm && (
                  <span>Encerrada em {formatDateTime(campanha.encerradaEm)}</span>
                )}
                <span
                  className={
                    aberta
                      ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400'
                      : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium'
                  }
                >
                  {CAMPANHA_STATUS_LABELS[campanha.status]}
                </span>
              </p>
            </div>
            {gestao && aberta && <EncerrarCampanha id={campanha.id} nome={campanha.nome} />}
          </div>

          {cobertura && <Cobertura cobertura={cobertura} />}
        </section>
      )}

      {campanha && !aberta && gestao && (
        <section className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold">Abrir nova campanha</h2>
          <div className="mt-4 max-w-md">
            <AbrirCampanha />
          </div>
        </section>
      )}
    </div>
  );
}

/** Cobertura por prédio e o bloco "Sem local" (AC-2). */
function Cobertura({ cobertura }: { cobertura: CoberturaCampanha }) {
  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-muted/40 p-4">
          <p className="text-2xl font-semibold tabular-nums">
            {cobertura.conferidos}
            <span className="text-base font-normal text-muted-foreground">
              {' '}
              de {cobertura.total}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            ativos com local conferidos nesta campanha
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <MapPinOff className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{cobertura.semLocal}</p>
            <p className="text-sm text-muted-foreground">
              {cobertura.semLocal === 1 ? 'vistoriável sem local' : 'vistoriáveis sem local'}
            </p>
          </div>
        </div>
      </div>

      {cobertura.predios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum prédio cadastrado. Cadastre os prédios em Localizações para ver a cobertura.
        </p>
      ) : (
        <ul aria-label="Cobertura por prédio" className="divide-y divide-border/60">
          {cobertura.predios.map((p) => (
            <li key={p.id} className="py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{p.nome}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {p.conferidos} de {p.total}
                  <span className="ml-2 font-semibold text-foreground">{p.percentual}%</span>
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`Cobertura de ${p.nome}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={p.percentual}
                className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-[width]"
                  style={{ width: `${p.percentual}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
