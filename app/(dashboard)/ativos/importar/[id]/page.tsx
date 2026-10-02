import { ArrowLeft, CircleCheck, CircleSlash } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/dashboard/header';
import { carregarImportacao, type ImportacaoTela } from '@/lib/ativos/importacao/revisao';
import { requireAdmin } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';
import type { GrupoImportacao } from '@/shared/ativos/importacao.constants';

import { RevisaoImportacao } from '../_components/RevisaoImportacao';
import { StatusImportacaoBadge } from '../_components/StatusImportacaoBadge';

const NOME_GRUPO: Record<GrupoImportacao, string> = {
  novo: 'Novo',
  alterado: 'Alterado',
  sumido: 'Sumido',
};

/**
 * Uma importação do SICAM (spec 0012, AC-22 e AC-25): a revisão enquanto
 * `pendente`, o resultado depois de aplicada ou descartada. Só o Admin.
 */
export default async function ImportacaoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  await dbConnect();
  const imp = await carregarImportacao(id);
  if (!imp) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/ativos/importar"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Importações
      </Link>

      <PageHeader
        title={imp.revisao ? 'Revisar importação' : 'Resultado da importação'}
        subtitle={`${imp.arquivoNome}, enviado por ${imp.autorNome} em ${formatDateTime(imp.criadaEm)}.`}
        actions={<StatusImportacaoBadge status={imp.status} />}
      />

      <Contagens imp={imp} />

      {imp.revisao ? (
        <>
          {imp.revisao.jaResolvidos.length > 0 && (
            <p className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200">
              Uma aplicação anterior parou no meio: {imp.revisao.jaResolvidos.length}{' '}
              {imp.revisao.jaResolvidos.length === 1
                ? 'item já foi resolvido'
                : 'itens já foram resolvidos'}{' '}
              e não aparecem abaixo. Aplicar termina o que falta.
            </p>
          )}
          <RevisaoImportacao
            id={imp.id}
            itens={imp.revisao.itens}
            categorias={imp.revisao.categorias}
            muitosSumidos={imp.revisao.muitosSumidos}
          />
        </>
      ) : (
        <Resultado imp={imp} />
      )}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className={destaque ? 'rounded-xl bg-primary/5 p-3' : 'rounded-xl bg-muted/40 p-3'}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}

function Contagens({ imp }: { imp: ImportacaoTela }) {
  const c = imp.contagens;
  return (
    <section
      aria-label="Contagens da importação"
      className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm"
    >
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Numero rotulo="Linhas lidas" valor={c.linhasLidas} />
        <Numero rotulo="Linhas reparadas" valor={c.linhasReparadas} />
        <Numero rotulo="Aceitas (tombadas e presentes)" valor={c.linhasAceitas} />
        <Numero rotulo="Duplicadas" valor={c.linhasDuplicadas} />
        <Numero rotulo="Valores ilegíveis" valor={c.valoresIlegiveis} />
        <Numero rotulo="Novos" valor={c.novos} destaque />
        <Numero rotulo="Alterados" valor={c.alterados} destaque />
        <Numero rotulo="Sumidos" valor={c.sumidos} destaque />
        <Numero rotulo="Continuam ausentes" valor={c.continuamAusentes} />
      </dl>
    </section>
  );
}

function Resultado({ imp }: { imp: ImportacaoTela }) {
  const itens = imp.resultado ?? [];
  const aplicados = itens.filter((i) => i.aplicado);
  const pulados = itens.filter((i) => !i.aplicado);
  const { aplicados: a, pulados: p } = imp.contagens;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">
          {imp.status === 'aplicada' ? 'Aplicada' : 'Descartada'}
          {imp.fechadaPorNome ? ` por ${imp.fechadaPorNome}` : ''}
          {imp.fechadaEm ? ` em ${formatDateTime(imp.fechadaEm)}` : ''}. O detalhe da revisão foi
          apagado; fica o código de cada item e o que aconteceu com ele.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Numero rotulo="Novos aplicados" valor={a.novos} />
          <Numero rotulo="Alterados aplicados" valor={a.alterados} />
          <Numero rotulo="Sumidos marcados" valor={a.sumidos} />
          <Numero rotulo="Novos não aplicados" valor={p.novos} />
          <Numero rotulo="Alterados não aplicados" valor={p.alterados} />
          <Numero rotulo="Sumidos não marcados" valor={p.sumidos} />
        </dl>
      </section>

      <ListaResultado
        titulo="Aplicados"
        icone={<CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden />}
        itens={aplicados}
      />
      <ListaResultado
        titulo="Não aplicados"
        icone={<CircleSlash className="h-4 w-4 text-muted-foreground" aria-hidden />}
        itens={pulados}
      />
    </div>
  );
}

function ListaResultado({
  titulo,
  icone,
  itens,
}: {
  titulo: string;
  icone: ReactNode;
  itens: NonNullable<ImportacaoTela['resultado']>;
}) {
  if (itens.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
      <h2 className="flex items-center gap-2 border-b border-border/50 px-5 py-4 text-base font-semibold">
        {icone}
        {titulo}{' '}
        <span className="font-normal tabular-nums text-muted-foreground">({itens.length})</span>
      </h2>
      <ul className="divide-y divide-border/60">
        {itens.map((i) => (
          <li
            key={`${i.grupo}-${i.codigo}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm"
          >
            <Link
              href={`/ativos?q=${encodeURIComponent(i.codigo)}`}
              className="font-mono font-semibold text-primary underline-offset-4 hover:underline"
            >
              {i.codigo}
            </Link>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{NOME_GRUPO[i.grupo]}</span>
            {i.motivoPulo && <span className="text-muted-foreground">{i.motivoPulo}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
