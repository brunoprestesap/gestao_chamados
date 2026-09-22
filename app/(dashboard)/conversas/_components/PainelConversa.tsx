'use client';

import { ArrowLeft, Info, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import {
  BOAS_VINDAS_TEXTO,
  COMPOSER_PLACEHOLDER_PRIMEIRA,
  COMPOSER_PLACEHOLDER_SEGUINTE,
  EXEMPLOS,
  EXEMPLOS_TITULO,
  FALHA_REDE,
  fraseDaConfirmacao,
  RASCUNHO_EXPLICACAO,
} from '../_constants';
import type { ConversaNaTela, MensagemNaTela } from '../_types';
import { revisarAberturaAction } from '../actions';
import { CartaoResumo } from './CartaoResumo';
import { Composer } from './Composer';
import { DescartarRascunho } from './DescartarRascunho';
import {
  BolhaAssistente,
  BolhaNaoEnviada,
  ListaMensagens,
  RegiaoAoVivo,
  Respondendo,
} from './Mensagens';
import { type Conclusao, useEnvio } from './useEnvio';

/**
 * O centro da tela quando a conversa é um rascunho (spec 0003). A mesma peça
 * serve a tela de boas vindas, onde a conversa ainda não existe no banco, e a
 * conversa que já existe: o que muda é o cabeçalho e o que aparece no corpo.
 */

type Props = {
  /** Nulo na tela de boas vindas. */
  conversa: ConversaNaTela | null;
  /** Primeiro nome de `session.user.name`. Sem nome, a saudação é só `Olá`. */
  primeiroNome: string | null;
  mensagensMax: number;
};

export function PainelConversa({ conversa, primeiroNome, mensagensMax }: Props) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLTextAreaElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  const novaConversa = conversa === null;
  // `reservada` é a conversa virando chamado: ela não aceita mensagem nova.
  const confirmando = conversa !== null && conversa.situacao !== 'rascunho';

  const aoConcluir = useCallback(
    ({ conversaId, preservar }: Conclusao) => {
      // A resposta não ficou salva: ela só existe no estado desta tela. Navegar
      // a perderia, e recarregar a rota também: quando o rascunho foi
      // descartado noutra aba, o servidor responde 404 e a recarga troca a tela
      // inteira pela página de erro, levando junto a resposta e o aviso. Então
      // aqui não se navega nem se recarrega: a tela fica como está, com a
      // resposta e o aviso à vista, e a lateral se acerta na próxima visita
      // (AC-5b).
      if (preservar) return;

      if (novaConversa) router.replace(`/conversas/${conversaId}`);
      router.refresh();
    },
    [novaConversa, router],
  );

  const envio = useEnvio({
    conversaId: conversa?.id ?? null,
    doServidor: conversa?.mensagens ?? [],
    contagemInicial: conversa?.mensagensCount ?? 0,
    mensagensMax,
    cartaoAtualDoServidor: conversa?.cartaoAtualId ?? null,
    aoConcluir,
  });

  const vazia = envio.mensagens.length === 0 && !envio.pendente;

  // ---- Cartão resumo e `Revisar e abrir` (spec 0004) ----
  const [revisando, setRevisando] = useState(false);
  const [erroRevisar, setErroRevisar] = useState<string | null>(null);

  // O botão aparece depois da primeira mensagem gravada do solicitante,
  // enquanto a conversa é rascunho (AC-7).
  const temRelato = envio.mensagens.some((mensagem) => mensagem.autor === 'solicitante');
  const podeRevisar = !confirmando && envio.conversaId !== null && temRelato;

  const revisar = useCallback(async () => {
    const alvo = envio.conversaId;
    if (!alvo || revisando) return;
    setRevisando(true);
    setErroRevisar(null);
    try {
      const resultado = await revisarAberturaAction(alvo);
      if (!resultado.ok) {
        setErroRevisar(fraseDaConfirmacao(resultado.reason));
        return;
      }
      envio.aplicarCartaoRevisado(resultado);
      // O mesmo cartão pode ter voltado: a tela rola até ele, sem mover o foco.
      requestAnimationFrame(() => {
        document
          .getElementById(`cartao-${resultado.mensagemId}`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    } catch {
      setErroRevisar(FALHA_REDE);
    } finally {
      setRevisando(false);
    }
  }, [envio, revisando]);

  // O chamado nasceu: a mesma rota passa ao modo leitura, e a lateral troca o
  // rascunho pelo chamado (AC-11).
  const aoConfirmar = useCallback(() => {
    if (novaConversa && envio.conversaId) router.replace(`/conversas/${envio.conversaId}`);
    router.refresh();
  }, [envio.conversaId, novaConversa, router]);

  const aoDesatualizar = useCallback(() => router.refresh(), [router]);

  const desenharCartao = useCallback(
    (mensagem: MensagemNaTela) =>
      mensagem.cartao ? (
        <CartaoResumo
          key={mensagem.id}
          mensagemId={mensagem.id}
          conversaId={envio.conversaId}
          cartao={mensagem.cartao}
          atual={!confirmando && mensagem.id === envio.cartaoAtualId}
          aguardandoResposta={envio.enviando}
          em={mensagem.em}
          onConfirmado={aoConfirmar}
          onDesatualizado={aoDesatualizar}
        />
      ) : null,
    [
      aoConfirmar,
      aoDesatualizar,
      confirmando,
      envio.cartaoAtualId,
      envio.conversaId,
      envio.enviando,
    ],
  );

  // Abrir uma conversa leva o foco para o título dela: no celular é o que
  // orienta quem acabou de vir da lista (AC-11).
  useEffect(() => {
    if (conversa) titulo.current?.focus();
  }, [conversa]);

  // A conversa acompanha o texto que cresce, sem exigir rolagem manual.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [envio.mensagens.length, envio.parcial, envio.pendente]);

  const revisarNoComposer = podeRevisar
    ? { onRevisar: () => void revisar(), revisando, erro: erroRevisar }
    : null;

  function usarExemplo(exemplo: string) {
    setTexto(exemplo);
    campo.current?.focus();
  }

  return (
    <section
      aria-label={conversa ? 'Conversa' : 'Nova conversa'}
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
    >
      {conversa ? (
        <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-3 py-3 md:px-5">
          <Link
            href="/conversas"
            aria-label="Voltar para a lista de conversas"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:hidden"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2
                ref={titulo}
                tabIndex={-1}
                className="truncate text-sm font-semibold text-foreground focus-visible:outline-none md:text-base"
              >
                {conversa.previa.trim() || 'Conversa sem texto'}
              </h2>
              <Badge
                variant="outline"
                className="shrink-0 border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              >
                {confirmando ? 'Confirmando' : 'Rascunho'}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{RASCUNHO_EXPLICACAO}</p>
          </div>

          <DescartarRascunho conversaId={conversa.id} />
        </header>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 md:px-7 md:py-6">
        {vazia ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
            <span
              aria-hidden="true"
              className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20"
            >
              <Sparkles className="size-7" />
            </span>

            <div className="max-w-md text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                {primeiroNome ? `Olá, ${primeiroNome}` : 'Olá'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
                {BOAS_VINDAS_TEXTO}
              </p>
            </div>

            <div className="flex w-full max-w-xl flex-col gap-2">
              <h3 className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
                {EXEMPLOS_TITULO}
              </h3>
              {EXEMPLOS.map((exemplo) => (
                <button
                  key={exemplo}
                  type="button"
                  onClick={() => usarExemplo(exemplo)}
                  className="min-h-11 rounded-2xl border border-border/70 bg-background px-4 py-3 text-left text-sm text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {exemplo}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <ListaMensagens mensagens={envio.mensagens} renderCartao={desenharCartao} />

            {envio.parcial !== null ? <BolhaAssistente texto={envio.parcial} emConstrucao /> : null}

            {envio.respondendo ? <Respondendo /> : null}

            {envio.pendente ? (
              <BolhaNaoEnviada
                texto={envio.pendente.texto}
                frase={envio.pendente.frase}
                enviando={envio.enviando}
                onTentarDeNovo={envio.tentarDeNovo}
              />
            ) : null}
          </>
        )}

        <div ref={fim} />
      </div>

      <RegiaoAoVivo texto={envio.anuncio} />

      {envio.aviso ? (
        <p className="flex items-start gap-2 border-t border-border/60 bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground md:px-5">
          <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {envio.aviso}
        </p>
      ) : null}

      {confirmando ? (
        <p
          className={cn(
            'border-t border-border/60 px-4 py-4 text-sm text-muted-foreground md:px-5',
          )}
        >
          Esta conversa está virando chamado neste instante. Assim que terminar, ela abre em modo
          leitura com o número do chamado.
        </p>
      ) : (
        <Composer
          texto={texto}
          onTexto={setTexto}
          campoRef={campo}
          focoInicial={novaConversa}
          placeholder={vazia ? COMPOSER_PLACEHOLDER_PRIMEIRA : COMPOSER_PLACEHOLDER_SEGUINTE}
          enviando={envio.enviando}
          contagem={envio.contagem}
          mensagensMax={mensagensMax}
          noLimite={envio.noLimite}
          onEnviar={envio.enviar}
          revisar={revisarNoComposer}
        />
      )}
    </section>
  );
}
