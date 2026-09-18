'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { lerQuadro, QUADRO_SEPARADOR } from '@/shared/conversas/quadro.schemas';

import { FALHA_REDE, fraseDaFalha, NAO_SALVA_AVISO, RESPONDENDO_TEXTO } from '../_constants';
import type { MensagemNaTela } from '../_types';

/**
 * O envio de mensagem e a leitura do fluxo de quadros (spec 0003, AC-4 e AC-5).
 *
 * Duas regras mandam aqui. A mensagem aparece na hora, marcada como pendente, e
 * o texto digitado nunca se perde quando falha. E, assim que o quadro `inicio`
 * chega, o `conversaId` fica guardado: dali em diante toda tentativa vai pela
 * rota com `id`, então tentar de novo nunca cria um segundo rascunho.
 *
 * Trocar de conversa não é sincronizado por efeito: quem usa o hook dá uma
 * `key` por conversa, então o componente remonta e o estado local nasce limpo.
 */

export type Pendente = { texto: string; frase: string | null };

export type Conclusao = { conversaId: string; preservar: boolean };

/** Mensagem nascida nesta aba. `salva` distingue o que já contou no banco. */
type Local = MensagemNaTela & { salva: boolean };

type Params = {
  /** Nulo na tela de boas vindas: a conversa ainda não existe no banco. */
  conversaId: string | null;
  /** As mensagens que o servidor mandou nesta renderização. */
  doServidor: MensagemNaTela[];
  /** `Conversa.mensagensCount` da mesma leitura do servidor. */
  contagemInicial: number;
  /** `CONVERSA_MENSAGENS_MAX`, que mora em `lib/conversas/config.ts` (só servidor). */
  mensagensMax: number;
  /** Chamado uma vez quando o fluxo termina, para recarregar ou navegar. */
  aoConcluir: (conclusao: Conclusao) => void;
};

export function useEnvio({
  conversaId: inicial,
  doServidor,
  contagemInicial,
  mensagensMax,
  aoConcluir,
}: Params) {
  const [conversaId, setConversaId] = useState<string | null>(inicial);
  const [locais, setLocais] = useState<Local[]>([]);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [parcial, setParcial] = useState<string | null>(null);
  const [respondendo, setRespondendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // O que a região ao vivo diz. Só muda em dois momentos: quando o primeiro
  // quadro chega e quando a resposta termina (AC-8).
  const [anuncio, setAnuncio] = useState('');

  const abortRef = useRef<AbortController | null>(null);

  // Sair da tela no meio da resposta aborta a requisição, o que devolve a vaga
  // na GPU compartilhada em vez de deixá-la presa até o prazo estourar.
  useEffect(() => () => abortRef.current?.abort(), []);

  // As mensagens da tela e o contador são derivados, não guardados: assim que o
  // servidor recarrega e passa a conhecer o que nasceu aqui, o que era local
  // sai da conta sozinho, sem efeito de sincronização e sem contar duas vezes.
  const conhecidas = new Set(doServidor.map((mensagem) => mensagem.id));
  const ineditas = locais.filter((mensagem) => !conhecidas.has(mensagem.id));
  const mensagens: MensagemNaTela[] = [...doServidor, ...ineditas];
  const contagem = contagemInicial + ineditas.filter((mensagem) => mensagem.salva).length;

  const enviar = useCallback(
    async (texto: string) => {
      const limpo = texto.trim();
      if (!limpo || enviando) return;

      setPendente({ texto: limpo, frase: null });
      setEnviando(true);
      setAviso(null);

      const controller = new AbortController();
      abortRef.current = controller;

      // Guardado fora do estado: o `inicio` pode chegar no meio do fluxo e as
      // decisões seguintes (inclusive o desfecho) precisam do valor já atual.
      let idDaConversa = conversaId;
      let preservar = false;

      const falhar = (frase: string) => {
        setPendente({ texto: limpo, frase });
        setParcial(null);
        setRespondendo(false);
      };

      const aplicar = (linha: string) => {
        const quadro = lerQuadro(linha);
        if (!quadro) return;

        if (quadro.tipo === 'inicio') {
          idDaConversa = quadro.conversaId;
          setConversaId(quadro.conversaId);
          setPendente(null);
          setRespondendo(true);
          setAnuncio(RESPONDENDO_TEXTO);
          setLocais((atuais) => [
            ...atuais,
            {
              id: quadro.mensagemId,
              autor: 'solicitante',
              texto: limpo,
              em: new Date().toISOString(),
              salva: true,
            },
          ]);
          return;
        }

        if (quadro.tipo === 'parcial') {
          setParcial(quadro.texto);
          return;
        }

        // `fim` e `reserva` fecham a resposta. Sem `mensagemId` ela não ficou
        // salva: a tela mostra o texto assim mesmo, com o aviso, e não navega.
        const salva = quadro.mensagemId !== null;
        preservar = preservar || !salva;

        setLocais((atuais) => [
          ...atuais,
          {
            id: quadro.mensagemId ?? `local-${Date.now()}`,
            autor: quadro.tipo === 'reserva' ? 'sistema' : 'ia',
            texto: quadro.texto,
            em: new Date().toISOString(),
            salva,
          },
        ]);

        setParcial(null);
        setRespondendo(false);
        setAnuncio(quadro.texto);
        if (!salva) setAviso(NAO_SALVA_AVISO);
      };

      const alvo = idDaConversa
        ? `/api/conversas/${idDaConversa}/mensagens`
        : '/api/conversas/mensagens';

      try {
        const resposta = await fetch(alvo, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto: limpo }),
          signal: controller.signal,
        });

        if (!resposta.ok || !resposta.body) {
          const corpo = (await resposta.json().catch(() => null)) as { reason?: string } | null;
          falhar(fraseDaFalha(corpo?.reason));
          return;
        }

        const leitor = resposta.body.getReader();
        const decodificador = new TextDecoder();
        let restante = '';

        for (;;) {
          const { done, value } = await leitor.read();
          if (value) restante += decodificador.decode(value, { stream: true });

          let corte = restante.indexOf(QUADRO_SEPARADOR);
          while (corte >= 0) {
            aplicar(restante.slice(0, corte));
            restante = restante.slice(corte + QUADRO_SEPARADOR.length);
            corte = restante.indexOf(QUADRO_SEPARADOR);
          }

          if (done) break;
        }

        restante += decodificador.decode();
        if (restante.trim()) aplicar(restante);

        if (idDaConversa) aoConcluir({ conversaId: idDaConversa, preservar });
      } catch (err) {
        // Sair da tela no meio não é falha de envio: não há a quem avisar.
        if (controller.signal.aborted) return;
        console.warn('[conversas] envio interrompido:', err instanceof Error ? err.name : 'erro');
        falhar(FALHA_REDE);
      } finally {
        setEnviando(false);
        abortRef.current = null;
      }
    },
    [aoConcluir, conversaId, enviando],
  );

  /** Reenvia o texto que ficou marcado como não enviado, sem o usuário redigitar. */
  const tentarDeNovo = useCallback(() => {
    if (pendente) void enviar(pendente.texto);
  }, [enviar, pendente]);

  return {
    conversaId,
    mensagens,
    pendente,
    enviando,
    parcial,
    respondendo,
    aviso,
    anuncio,
    contagem,
    noLimite: contagem >= mensagensMax,
    enviar,
    tentarDeNovo,
  };
}
