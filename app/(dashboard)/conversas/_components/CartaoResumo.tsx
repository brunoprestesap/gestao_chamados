'use client';

import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  Wind,
  Wrench,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';
import type { TipoServico } from '@/shared/chamados/tipo-servico';
import { localExatoSchema } from '@/shared/conversas/abertura.schemas';
import { type CartaoPayload, LOCAL_EXATO_MAX } from '@/shared/conversas/conversa.schemas';

import {
  CARTAO_CONFIRMANDO,
  CARTAO_CONFIRMAR,
  CARTAO_DESCRICAO_AVISO,
  CARTAO_ERRO_LOCAL,
  CARTAO_ERRO_LOCAL_LONGO,
  CARTAO_ERRO_TIPO,
  CARTAO_ERRO_UNIDADE,
  CARTAO_ESPERE_RESPOSTA,
  CARTAO_SELO_IA,
  CARTAO_SELO_MANUAL,
  CARTAO_SERVICO_DICA,
  CARTAO_SUBSTITUIDO,
  CARTAO_TITULO,
  FALHA_REDE,
  fraseDaConfirmacao,
} from '../_constants';
import { confirmarAberturaAction } from '../actions';
import { hora, iso } from './tempo';
import { useUnidades } from './unidades-contexto';

/**
 * O cartão resumo do chamado (spec 0004, AC-5 a AC-12 e AC-18). A pessoa
 * confere o serviço, troca a unidade ou o local se a IA entendeu errado e
 * confirma; o chamado nasce `aberto` para a triagem do Preposto.
 *
 * Só o cartão atual tem ação. Os outros aparecem esmaecidos, com a marca
 * `Substituído` em texto. O serviço não se edita aqui: quem quer outro serviço
 * conta na conversa, e a IA refaz o cartão.
 */

const ICONE_DO_TIPO: Record<TipoServico, typeof Wrench> = {
  'Manutenção Predial': Wrench,
  'Ar-Condicionado': Wind,
  Elevador: ArrowUpDown,
};

type Erros = { tipo?: string; unidade?: string; local?: string };

type Props = {
  mensagemId: string;
  /** Nulo só antes do quadro `inicio`, quando ainda não há cartão possível. */
  conversaId: string | null;
  cartao: CartaoPayload;
  /** É o cartão apontado pela proposta? Só ele tem ação (AC-12). */
  atual: boolean;
  /** Uma resposta do assistente está chegando: confirmar espera (AC-12). */
  aguardandoResposta: boolean;
  em?: string;
  /** O chamado nasceu: a tela passa ao modo leitura (AC-11). */
  onConfirmado: () => void;
  /** O servidor disse que este cartão não vale mais: a tela recarrega o ponteiro. */
  onDesatualizado: () => void;
};

export function CartaoResumo({
  mensagemId,
  conversaId,
  cartao,
  atual,
  aguardandoResposta,
  em,
  onConfirmado,
  onDesatualizado,
}: Props) {
  const unidades = useUnidades();
  const manual = cartao.modo === 'manual';

  const [unitId, setUnitId] = useState(cartao.unidade?.unitId ?? '');
  const [localExato, setLocalExato] = useState(cartao.localExato ?? '');
  const [tipo, setTipo] = useState<TipoServico | ''>('');
  const [enviando, setEnviando] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  const idBase = useId();
  const ids = {
    titulo: `${idBase}-titulo`,
    tipo: `${idBase}-tipo`,
    tipoErro: `${idBase}-tipo-erro`,
    unidade: `${idBase}-unidade`,
    unidadeErro: `${idBase}-unidade-erro`,
    local: `${idBase}-local`,
    localErro: `${idBase}-local-erro`,
    espera: `${idBase}-espera`,
    falha: `${idBase}-falha`,
  };

  const tipoRef = useRef<HTMLInputElement>(null);
  const unidadeRef = useRef<HTMLButtonElement>(null);
  const localRef = useRef<HTMLInputElement>(null);

  // A unidade do perfil pode não estar na lista (lista vazia por falha de
  // leitura): ela continua sendo opção, com o rótulo que veio no cartão.
  const opcoes =
    cartao.unidade && !unidades.some((u) => u.id === cartao.unidade?.unitId)
      ? [
          { id: cartao.unidade.unitId, nome: cartao.unidade.rotulo, andar: cartao.unidade.andar },
          ...unidades,
        ]
      : unidades;

  function validar(): Erros {
    const erros: Erros = {};
    if (manual && !tipo) erros.tipo = CARTAO_ERRO_TIPO;
    if (!unitId) erros.unidade = CARTAO_ERRO_UNIDADE;
    const local = localExatoSchema.safeParse(localExato);
    if (!local.success) {
      erros.local =
        localExato.trim().length > LOCAL_EXATO_MAX ? CARTAO_ERRO_LOCAL_LONGO : CARTAO_ERRO_LOCAL;
    }
    return erros;
  }

  const erros = tentou ? validar() : {};
  const bloqueado = enviando || aguardandoResposta || !conversaId;

  async function confirmar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (bloqueado || !conversaId) return;

    setTentou(true);
    setFalha(null);
    const encontrados = validar();
    if (encontrados.tipo) return tipoRef.current?.focus();
    if (encontrados.unidade) return unidadeRef.current?.focus();
    if (encontrados.local) return localRef.current?.focus();

    setEnviando(true);
    try {
      const resultado = await confirmarAberturaAction({
        conversaId,
        cartaoId: mensagemId,
        unitId,
        localExato: localExato.trim(),
        ...(manual && tipo ? { tipoServico: tipo } : {}),
      });
      if (resultado.ok) {
        onConfirmado();
        return;
      }
      setFalha(fraseDaConfirmacao(resultado.reason));
      if (resultado.reason === 'cartao_desatualizado') onDesatualizado();
    } catch {
      setFalha(FALHA_REDE);
    } finally {
      setEnviando(false);
    }
  }

  const unidadeEscolhida = opcoes.find((u) => u.id === unitId);
  const IconeServico = cartao.servico ? ICONE_DO_TIPO[cartao.servico.tipoServico] : ClipboardCheck;

  return (
    <article
      id={`cartao-${mensagemId}`}
      aria-labelledby={ids.titulo}
      className={cn(
        'group relative w-full max-w-[36rem] self-center overflow-hidden rounded-2xl border bg-card shadow-sm transition-all',
        atual
          ? 'border-primary/30 shadow-indigo-500/5 hover:shadow-lg'
          : 'border-border/60 opacity-60 saturate-50',
      )}
    >
      {/* Faixa de destaque, como nos cartões do resto do Sigma. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-600 to-blue-600',
          atual ? 'opacity-80 group-hover:opacity-100' : 'opacity-30',
        )}
      />

      <header className="flex items-start gap-3 px-4 pt-5 pb-3 md:px-5">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105"
        >
          <ClipboardCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={ids.titulo} className="text-sm font-semibold text-foreground md:text-base">
              {CARTAO_TITULO}
            </h3>
            {atual ? (
              <Badge
                variant="outline"
                className={cn(
                  manual
                    ? 'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                    : 'border-primary/20 bg-primary/10 text-primary',
                )}
              >
                {manual ? CARTAO_SELO_MANUAL : CARTAO_SELO_IA}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                {CARTAO_SUBSTITUIDO}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {atual
              ? 'Confira os dados abaixo. O chamado só nasce quando você confirmar.'
              : 'Um resumo mais novo tomou o lugar deste.'}
          </p>
        </div>
      </header>

      <form onSubmit={confirmar} noValidate className="flex flex-col gap-4 px-4 pb-4 md:px-5">
        {/* ---- Serviço (modo ia) ou tipo de serviço (modo manual) ---- */}
        {cartao.servico ? (
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/40 px-3 py-3">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200"
            >
              <IconeServico className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">Serviço</p>
              <p className="text-sm font-semibold break-words text-foreground">
                {cartao.servico.rotuloServico}
              </p>
              <p className="text-xs break-words text-muted-foreground">
                {[cartao.servico.rotuloSubtipo, cartao.servico.tipoServico]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {atual ? (
                <p className="mt-1.5 text-xs text-muted-foreground">{CARTAO_SERVICO_DICA}</p>
              ) : null}
            </div>
          </div>
        ) : atual ? (
          <fieldset
            role="radiogroup"
            aria-required="true"
            aria-describedby={erros.tipo ? ids.tipoErro : undefined}
            aria-invalid={erros.tipo ? true : undefined}
            className="flex flex-col gap-2"
          >
            <legend className="mb-2 text-sm font-medium text-foreground">
              Tipo de serviço <span aria-hidden="true">*</span>
              <span className="sr-only">(obrigatório)</span>
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TIPO_SERVICO_OPTIONS.map((opcao, indice) => {
                const Icone = ICONE_DO_TIPO[opcao];
                const marcado = tipo === opcao;
                return (
                  <label
                    key={opcao}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                      'has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50',
                      marcado
                        ? 'border-primary bg-primary/5 font-semibold text-foreground ring-1 ring-primary/30'
                        : 'border-input bg-background text-foreground hover:bg-muted/50',
                      enviando && 'pointer-events-none opacity-60',
                    )}
                  >
                    <input
                      ref={indice === 0 ? tipoRef : undefined}
                      type="radio"
                      name={ids.tipo}
                      value={opcao}
                      checked={marcado}
                      disabled={enviando}
                      onChange={() => setTipo(opcao)}
                      className="sr-only"
                    />
                    <Icone aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    {opcao}
                  </label>
                );
              })}
            </div>
            {erros.tipo ? (
              <p id={ids.tipoErro} className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
                {erros.tipo}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                O Preposto escolhe o serviço exato na triagem.
              </p>
            )}
          </fieldset>
        ) : (
          <div className="rounded-xl border border-border/60 bg-muted/40 px-3 py-3">
            <p className="text-xs font-medium text-muted-foreground">Tipo de serviço</p>
            <p className="text-sm text-foreground">A escolher</p>
          </div>
        )}

        {atual ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* ---- Unidade ---- */}
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={ids.unidade} className="text-sm font-medium text-foreground">
                Unidade <span aria-hidden="true">*</span>
                <span className="sr-only">(obrigatório)</span>
              </label>
              <Select
                value={unitId}
                onValueChange={(valor) => setUnitId(valor)}
                disabled={enviando}
              >
                <SelectTrigger
                  id={ids.unidade}
                  ref={unidadeRef}
                  aria-invalid={erros.unidade ? true : undefined}
                  aria-describedby={erros.unidade ? ids.unidadeErro : undefined}
                  className="h-11 w-full min-w-0 rounded-xl data-[size=default]:h-11"
                >
                  <SelectValue placeholder="Escolha a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {opcoes.map((unidade) => (
                    <SelectItem key={unidade.id} value={unidade.id}>
                      {unidade.andar ? `${unidade.nome} · ${unidade.andar}` : unidade.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {erros.unidade ? (
                <p
                  id={ids.unidadeErro}
                  className="flex items-center gap-1.5 text-xs text-destructive"
                >
                  <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
                  {erros.unidade}
                </p>
              ) : !cartao.unidade ? (
                <p className="text-xs text-muted-foreground">Onde fica o problema?</p>
              ) : null}
            </div>

            {/* ---- Local exato ---- */}
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={ids.local} className="text-sm font-medium text-foreground">
                Local exato <span aria-hidden="true">*</span>
                <span className="sr-only">(obrigatório)</span>
              </label>
              <input
                id={ids.local}
                ref={localRef}
                type="text"
                value={localExato}
                onChange={(evento) => setLocalExato(evento.target.value)}
                maxLength={LOCAL_EXATO_MAX}
                disabled={enviando}
                placeholder="Ex.: sala 302, perto da janela"
                aria-invalid={erros.local ? true : undefined}
                aria-describedby={erros.local ? ids.localErro : undefined}
                className="h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm"
              />
              {erros.local ? (
                <p
                  id={ids.localErro}
                  className="flex items-center gap-1.5 text-xs text-destructive"
                >
                  <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
                  {erros.local}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">Unidade</dt>
              <dd className="text-sm break-words text-foreground">
                {cartao.unidade
                  ? [cartao.unidade.rotulo, cartao.unidade.andar].filter(Boolean).join(' · ')
                  : 'A escolher'}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">Local exato</dt>
              <dd className="text-sm break-words text-foreground">
                {cartao.localExato ?? 'A informar'}
              </dd>
            </div>
          </dl>
        )}

        <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <FileText aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {CARTAO_DESCRICAO_AVISO}
        </p>

        {falha ? (
          <p
            id={ids.falha}
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {falha}
          </p>
        ) : null}

        {atual ? (
          <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p id={ids.espera} className="text-xs text-muted-foreground">
              {aguardandoResposta
                ? CARTAO_ESPERE_RESPOSTA
                : unidadeEscolhida
                  ? `Vai para ${unidadeEscolhida.nome}.`
                  : ''}
            </p>
            <button
              type="submit"
              disabled={bloqueado}
              aria-describedby={aguardandoResposta ? ids.espera : falha ? ids.falha : undefined}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-blue-500 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              {enviando ? (
                <>
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  {CARTAO_CONFIRMANDO}
                </>
              ) : (
                <>
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  {CARTAO_CONFIRMAR}
                </>
              )}
            </button>
          </div>
        ) : null}

        {em ? (
          <time dateTime={iso(em)} className="text-xs text-muted-foreground">
            {hora(em)} · {manual ? 'sistema' : 'assistente'}
          </time>
        ) : null}
      </form>
    </article>
  );
}
