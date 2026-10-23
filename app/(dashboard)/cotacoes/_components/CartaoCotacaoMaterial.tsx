'use client';

import { ArrowRight, Hammer, Package, PackagePlus, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { Acoes, CartaoCotacao } from '@/lib/material/leitura';
import type { CotacaoDTO } from '@/lib/material/serializar';
import { cn } from '@/lib/utils';
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import { situacaoAnteriorDaTrilha } from '@/shared/material/jornada';
import {
  type AcaoDaVez,
  FASES_SOLICITANTE,
  ROTULO_FASE_SOLICITANTE,
  ROTULO_PAPEL,
  ROTULO_SITUACAO,
  TEXTO_ACAO_DA_VEZ,
  TEXTO_CARTAO as T,
  TEXTO_FASE_SOLICITANTE,
  TEXTO_SUA_VEZ,
  textoDoMotivo,
} from '@/shared/material/mensagens';

import { SeloUrgencia } from './apoio';
import { JornadaCotacao } from './compartilhado/JornadaCotacao';
import { acaoPrincipal } from './compartilhado/PainelSuaVez';
import { SituacaoPill } from './compartilhado/SituacaoPill';
import { DialogExecucao } from './DialogExecucao';
import { DialogMaterial } from './DialogMaterial';

/** Itens do técnico mostrados no cartão antes do "+N itens". */
const ITENS_NO_CARTAO = 3;

/** As ações que o técnico faz no próprio cartão; as outras moram no detalhe da cotação. */
const ACOES_NO_CARTAO: readonly AcaoDaVez[] = ['executar', 'editarDiagnostico'];

type Dialogo = 'criar' | 'editar' | 'executar' | null;

/**
 * O cartão da cotação de material no chamado (spec 0021, AC-16). A versão sai
 * de `cotacao.visao`, nunca do perfil de quem lê: TRF1, contratada, técnico ou
 * solicitante. O que cada versão mostra já vem filtrado do servidor.
 */
export function CartaoCotacaoMaterial({
  chamadoId,
  onAlterado,
}: {
  chamadoId: string;
  onAlterado?: () => void;
}) {
  const [cartao, setCartao] = useState<CartaoCotacao | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/chamados/${chamadoId}/cotacao-material`, { cache: 'no-store' });
      setCartao(res.ok ? ((await res.json()) as CartaoCotacao) : null);
    } catch {
      setCartao(null);
    }
  }, [chamadoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const depois = useCallback(() => {
    void carregar();
    onAlterado?.();
  }, [carregar, onAlterado]);

  if (!cartao || (!cartao.cotacao && !cartao.podeCriar)) return null;
  const cot = cartao.cotacao;

  if (cot?.visao === 'solicitante') return <CartaoSolicitante cotacao={cot} />;

  const tituloId = `material-${chamadoId}`;
  return (
    <section
      data-cartao-material
      aria-labelledby={tituloId}
      className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={tituloId}
          className="flex items-center gap-2 text-base font-semibold text-foreground"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
            <Package className="size-3.5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          </span>
          {T.titulo}
        </h2>
        {cot && (
          <div className="flex items-center gap-2">
            {cot.urgencia?.pedida && <SeloUrgencia />}
            <SituacaoPill situacao={cot.situacao} />
          </div>
        )}
      </div>

      {cot?.visao === 'tecnico' ? (
        <CorpoTecnico cotacao={cot} acoes={cartao.acoes} onDialogo={setDialogo} />
      ) : cot ? (
        <CorpoGestaoOuContratada cotacao={cot} acoes={cartao.acoes} />
      ) : (
        <p className="text-sm text-muted-foreground">{T.registrarMaterialAjuda}</p>
      )}

      {cartao.podeCriar && (
        <Button
          variant="gradiente"
          className="min-h-11 w-full gap-2 sm:w-auto"
          onClick={() => setDialogo('criar')}
        >
          <PackagePlus className="size-4" aria-hidden="true" />
          {T.registrarMaterial}
        </Button>
      )}

      {cot && <LinkDaCotacao cotacao={cot} />}

      {dialogo === 'criar' && (
        <DialogMaterial
          modo="criar"
          chamadoId={chamadoId}
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          onSalvo={depois}
        />
      )}
      {dialogo === 'editar' && cot?.itens && (
        <DialogMaterial
          modo="editar"
          cotacaoId={cot.id}
          versao={cot.versao}
          itens={cot.itens}
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          onSalvo={depois}
        />
      )}
      {dialogo === 'executar' && cot?.itens && (
        <DialogExecucao
          cotacaoId={cot.id}
          versao={cot.versao}
          itens={cot.itens}
          evidencias={(cot.arquivos ?? []).filter((a) => a.tipo === 'evidencia')}
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          // Só o cartão: recarregar a tela do técnico desmonta o diálogo aberto.
          onArquivos={() => void carregar()}
          onAlterado={depois}
        />
      )}
    </section>
  );
}

/** O motivo do último devolver ou reprovar, para quem vê a trilha. */
function Motivo({ cotacao: c }: { cotacao: CotacaoDTO }) {
  const motivo = textoDoMotivo(c.ultimoMotivo);
  if (!motivo || (c.situacao !== 'devolvida' && c.situacao !== 'reprovada')) return null;
  return (
    <p className="text-sm text-muted-foreground">{T.motivo(ROTULO_SITUACAO[c.situacao], motivo)}</p>
  );
}

/** "Agora é a vez de: Fiscal (nome)": o nome só chega na visão TRF1. */
function QuemAge({ cotacao: c }: { cotacao: CotacaoDTO }) {
  const quem = c.quemAgeAgora;
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full border-2 border-indigo-600 dark:border-indigo-400"
      />
      {quem ? TEXTO_SUA_VEZ.vezDe(ROTULO_PAPEL[quem.papel], quem.nome) : T.semVez}
    </p>
  );
}

/** A próxima ação de quem lê, com a dica; o botão vem de fora. */
function ProximaAcao({ acao, children }: { acao: AcaoDaVez; children?: React.ReactNode }) {
  const dica = T.dica[acao];
  return (
    <div className="space-y-3 rounded-xl bg-indigo-50/70 p-3.5 dark:bg-indigo-950/30">
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-foreground">{TEXTO_ACAO_DA_VEZ[acao].titulo}</p>
        {dica && <p className="text-sm text-muted-foreground">{dica}</p>}
      </div>
      {children}
    </div>
  );
}

function CorpoTecnico({
  cotacao: c,
  acoes,
  onDialogo,
}: {
  cotacao: CotacaoDTO;
  acoes: Acoes | null;
  onDialogo: (d: Dialogo) => void;
}) {
  const itens = c.itens ?? [];
  const acao = acoes ? ACOES_NO_CARTAO.find((a) => acoes[a]) : undefined;
  return (
    <>
      <JornadaCotacao
        situacao={c.situacao}
        situacaoAnterior={situacaoAnteriorDaTrilha(c.trilha ?? [])}
        className="w-full [&>span]:flex-1"
      />
      {acao ? (
        <ProximaAcao acao={acao}>
          <div className="flex flex-wrap gap-2">
            {acoes?.executar && (
              <Button
                variant="gradiente"
                className="min-h-11 gap-2"
                onClick={() => onDialogo('executar')}
              >
                <Hammer className="size-4" aria-hidden="true" />
                {TEXTO_ACAO_DA_VEZ.executar.botao}
              </Button>
            )}
            {acoes?.editarDiagnostico && (
              <Button
                variant={acoes.executar ? 'outline' : 'gradiente'}
                className="min-h-11 gap-2"
                onClick={() => onDialogo('editar')}
              >
                <Pencil className="size-4" aria-hidden="true" />
                {TEXTO_ACAO_DA_VEZ.editarDiagnostico.botao}
              </Button>
            )}
          </div>
        </ProximaAcao>
      ) : (
        <QuemAge cotacao={c} />
      )}
      <Motivo cotacao={c} />
      {itens.length > 0 && (
        <ul className="space-y-2 text-sm">
          {itens.slice(0, ITENS_NO_CARTAO).map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{i.descricao}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {formatarQuantidade(i.quantidade)} {i.unidade}
              </span>
            </li>
          ))}
          {itens.length > ITENS_NO_CARTAO && (
            <li className="text-muted-foreground">{T.maisItens(itens.length - ITENS_NO_CARTAO)}</li>
          )}
        </ul>
      )}
    </>
  );
}

/**
 * TRF1 e contratada: quantidade de itens, valor e quem age agora. A contratada
 * vê também a próxima ação dela, que mora no detalhe da cotação.
 */
function CorpoGestaoOuContratada({
  cotacao: c,
  acoes,
}: {
  cotacao: CotacaoDTO;
  acoes: Acoes | null;
}) {
  const qtd = c.itens?.length ?? 0;
  const acao = c.visao === 'contratada' && acoes ? acaoPrincipal(acoes) : null;
  return (
    <>
      <dl className="grid grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <dt className="text-xs text-muted-foreground">{T.itens}</dt>
          <dd className="text-lg font-semibold tabular-nums">{qtd}</dd>
        </div>
        {!!c.valorTotalCentavos && (
          <div className="space-y-0.5">
            <dt className="text-xs text-muted-foreground">{T.valor}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatarReais(c.valorTotalCentavos)}
            </dd>
          </div>
        )}
      </dl>
      {acao && (
        <ProximaAcao acao={acao}>
          <Button asChild variant="gradiente" className="min-h-11 gap-2">
            <Link href={`/cotacoes/${c.id}`}>
              {TEXTO_ACAO_DA_VEZ[acao].botao}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </ProximaAcao>
      )}
      <QuemAge cotacao={c} />
      <Motivo cotacao={c} />
    </>
  );
}

function LinkDaCotacao({ cotacao: c }: { cotacao: CotacaoDTO }) {
  if (c.visao === 'tecnico') {
    return (
      <Link
        href={`/cotacoes/${c.id}`}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="font-mono tabular-nums">{c.numero}</span>
        <span>· {T.verCotacao}</span>
      </Link>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
      <span className="font-mono text-sm tabular-nums text-muted-foreground">{c.numero}</span>
      <Button asChild variant="outline" className="min-h-11">
        <Link href={`/cotacoes/${c.id}`}>{T.abrirCotacao}</Link>
      </Button>
    </div>
  );
}

/**
 * O solicitante vê uma frase fixa por fase e a barra de três fases, sem valor
 * e sem nomes. A fase encerrada mostra só a frase.
 */
function CartaoSolicitante({ cotacao: c }: { cotacao: CotacaoDTO }) {
  const fase = c.fase ?? 'pedido';
  const texto = TEXTO_FASE_SOLICITANTE[fase];
  const atual = fase === 'encerrada' ? -1 : FASES_SOLICITANTE.indexOf(fase);
  return (
    <section
      data-cartao-material
      aria-label={T.titulo}
      data-fase={fase}
      className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">
          <Package className="size-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{texto.titulo}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{texto.frase}</p>
        </div>
      </div>
      {atual >= 0 && (
        <ol aria-label={T.fases} className="grid grid-cols-3 gap-1">
          {FASES_SOLICITANTE.map((f, i) => (
            <li
              key={f}
              aria-current={i === atual ? 'step' : undefined}
              className="flex flex-col gap-1.5"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-1.5 rounded-full',
                  i <= atual ? 'bg-violet-600 dark:bg-violet-400' : 'bg-muted-foreground/20',
                )}
              />
              <span
                className={cn(
                  'text-xs',
                  i === atual
                    ? 'font-semibold text-violet-800 dark:text-violet-200'
                    : 'text-muted-foreground',
                  i === 1 && 'text-center',
                  i === 2 && 'text-right',
                )}
              >
                {ROTULO_FASE_SOLICITANTE[f]}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
