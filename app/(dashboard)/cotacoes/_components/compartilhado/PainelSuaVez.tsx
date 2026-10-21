import { AlertTriangle, CircleCheck, Loader2, OctagonX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { Acoes } from '@/lib/material/leitura';
import type { QuemAgeDTO } from '@/lib/material/serializar';
import { cn } from '@/lib/utils';
import {
  type AcaoDaVez,
  ACOES_DA_VEZ,
  type CodigoControle,
  ROTULO_PAPEL,
  TEXTO_ACAO_DA_VEZ,
  TEXTO_SUA_VEZ as T,
  textoDoControleSemRotulo,
  TITULO_CONTROLE,
} from '@/shared/material/mensagens';

/**
 * O painel "Sua vez" (spec 0021, AC-6): o papel de quem lê, a ação principal
 * e as secundárias, os impedimentos e as advertências, cada um com título.
 * Sem ação para quem lê, mostra quem age agora. Nunca decide permissão: só
 * mostra o que `acoesDisponiveis` liberou.
 */

/** A primeira ação da vez liberada para quem lê, na ordem de `ACOES_DA_VEZ`. */
export function acaoPrincipal(acoes: Acoes): AcaoDaVez | null {
  return ACOES_DA_VEZ.find((a) => acoes[a]) ?? null;
}

export type PontoDoPainel = { codigo: CodigoControle; detalhe?: string };

export type AcaoDoPainel = {
  chave: string;
  rotulo: string;
  destrutiva?: boolean;
  onClick?: () => void;
  /** A ação mora numa seção da página: o botão vira link para ela. */
  href?: string;
};

function Ponto({ ponto, tipo }: { ponto: PontoDoPainel; tipo: 'impedimento' | 'advertencia' }) {
  const Icone = tipo === 'impedimento' ? OctagonX : AlertTriangle;
  return (
    <li className="flex items-start gap-2.5">
      <Icone
        aria-hidden="true"
        className={cn(
          'mt-0.5 size-4 shrink-0',
          tipo === 'impedimento'
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-amber-600 dark:text-amber-400',
        )}
      />
      <span>
        <strong className="font-semibold">{TITULO_CONTROLE[ponto.codigo] ?? ponto.codigo}</strong>
        <span className="text-muted-foreground">
          {' '}
          {ponto.detalhe ?? textoDoControleSemRotulo(ponto.codigo)}
        </span>
      </span>
    </li>
  );
}

function Lista({
  titulo,
  pontos,
  tipo,
}: {
  titulo: string;
  pontos: PontoDoPainel[];
  tipo: 'impedimento' | 'advertencia';
}) {
  if (!pontos.length) return null;
  return (
    <div className="space-y-2" role={tipo === 'impedimento' ? 'alert' : undefined}>
      <h3 className="text-xs font-semibold text-muted-foreground">{titulo}</h3>
      <ul className="space-y-2 text-[13.5px]">
        {pontos.map((p) => (
          <Ponto key={`${p.codigo}-${p.detalhe ?? ''}`} ponto={p} tipo={tipo} />
        ))}
      </ul>
    </div>
  );
}

function BotaoDoPainel({
  acao,
  variante,
  pendente,
  className,
}: {
  acao: AcaoDoPainel;
  variante: 'gradiente' | 'outline';
  pendente: boolean;
  className?: string;
}) {
  const cor = acao.destrutiva
    ? 'border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40'
    : undefined;
  if (acao.href) {
    return (
      <Button asChild variant={variante} className={cn('h-11 rounded-xl', cor, className)}>
        <a href={acao.href}>{acao.rotulo}</a>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant={variante}
      disabled={pendente}
      onClick={acao.onClick}
      className={cn('h-11 rounded-xl', cor, className)}
    >
      {acao.rotulo}
    </Button>
  );
}

export function PainelSuaVez({
  papel,
  principal,
  secundarias,
  impedimentos,
  pontos,
  advertencias,
  quemAge,
  pendente,
}: {
  /** O papel de quem lê, já em texto; `null` para quem não tem papel aqui. */
  papel: string | null;
  principal: { acao: AcaoDaVez; onClick?: () => void; href?: string } | null;
  secundarias: AcaoDoPainel[];
  impedimentos: PontoDoPainel[];
  /** O que o encaminhar vai pedir (vencido, variação, base, conferência, urgência). */
  pontos: PontoDoPainel[];
  advertencias: PontoDoPainel[];
  quemAge: QuemAgeDTO | null | undefined;
  pendente: boolean;
}) {
  const texto = principal ? TEXTO_ACAO_DA_VEZ[principal.acao] : null;
  return (
    <section
      aria-labelledby="sua-vez-titulo"
      className={cn(
        'space-y-4 rounded-2xl border bg-card p-5',
        principal
          ? 'border-indigo-200 shadow-lg shadow-indigo-500/10 dark:border-indigo-500/40'
          : 'border-border/50',
      )}
    >
      <div className="space-y-1">
        <p className="text-xs font-semibold tracking-wide text-indigo-700 uppercase dark:text-indigo-300">
          {principal ? T.rotulo : T.rotuloOutros}
        </p>
        <h2 id="sua-vez-titulo" className="text-lg font-semibold tracking-tight">
          {texto
            ? texto.titulo
            : quemAge
              ? T.vezDe(ROTULO_PAPEL[quemAge.papel], quemAge.nome)
              : T.ninguem}
        </h2>
        {papel && <p className="text-[13px] text-muted-foreground">{T.voceAtuaComo(papel)}</p>}
      </div>

      {principal && !impedimentos.length && (
        <p className="flex items-center gap-2.5 text-[13.5px]">
          <CircleCheck
            aria-hidden="true"
            className="size-4 text-emerald-600 dark:text-emerald-400"
          />
          {T.semImpedimento}
        </p>
      )}
      <Lista titulo={T.impedimentos} pontos={impedimentos} tipo="impedimento" />
      <Lista titulo={T.pontosAResolver} pontos={pontos} tipo="advertencia" />
      <Lista titulo={T.advertencias} pontos={advertencias} tipo="advertencia" />

      {(principal || secundarias.length > 0) && (
        <div className="space-y-2">
          {principal && texto && (
            <BotaoDoPainel
              acao={{
                chave: principal.acao,
                rotulo: texto.botao,
                onClick: principal.onClick,
                href: principal.href,
              }}
              variante="gradiente"
              pendente={pendente}
              className="w-full"
            />
          )}
          {secundarias.length > 0 && (
            <div className="space-y-2">
              {!principal && (
                <h3 className="text-xs font-semibold text-muted-foreground">{T.outrasAcoes}</h3>
              )}
              <div className="grid grid-cols-2 gap-2">
                {secundarias.map((a) => (
                  <BotaoDoPainel
                    key={a.chave}
                    acao={a}
                    variante="outline"
                    pendente={pendente}
                    className={secundarias.length % 2 === 1 ? 'last:col-span-2' : undefined}
                  />
                ))}
              </div>
            </div>
          )}
          {pendente && (
            <Loader2
              className="mx-auto size-5 animate-spin text-muted-foreground"
              aria-label="Processando"
            />
          )}
        </div>
      )}
    </section>
  );
}
