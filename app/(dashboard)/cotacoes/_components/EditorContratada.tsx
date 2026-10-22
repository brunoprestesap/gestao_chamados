'use client';

import { ArrowLeft, ArrowRight, Loader2, Send } from 'lucide-react';
import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { CotacaoDTO } from '@/lib/material/serializar';
import type { ReferenciaEntrada } from '@/shared/material/cotacao.schemas';
import {
  type CodigoControle,
  type PassoMontagem,
  PASSOS_MONTAGEM,
  ROTULO_PASSO_MONTAGEM,
  TEXTO_EDITOR as T,
} from '@/shared/material/mensagens';

import { classificarItemAction, enviarCotacaoAction, salvarRascunhoAction } from '../actions';
import { enviarArquivo, novoId } from './apoio';
import type { EscolhaTabela } from './editor/BuscaPrecoNoItem';
import {
  erroAntesDeSalvar,
  estadoDoDto,
  type ItemDoFormulario,
  itemNovo,
  linhasDaLista,
  montarEntrada,
  type OrcamentoDoFormulario,
  orcamentoNovo,
  prontaParaEnviar,
  totalPeloMenorPreco,
} from './editor/formulario';
import { type CampoDoItem, PassoItens } from './editor/PassoItens';
import { type CampoDoOrcamento, PassoOrcamentos } from './editor/PassoOrcamentos';
import { PassoPrecoTabela } from './editor/PassoPrecoTabela';
import { PassoRevisar } from './editor/PassoRevisar';
import { PassosMontagem } from './editor/PassosMontagem';
import { ProntaParaEnviar } from './editor/ProntaParaEnviar';

/**
 * O responsável técnico monta a cotação (spec 0019, AC-1, AC-4) em 4 passos
 * com navegação livre (spec 0021, AC-12): itens, preço de tabela, orçamentos
 * e revisar e enviar. "Salvar rascunho" vale em todos; o envio fica no passo 4
 * e continua conferido no servidor. A lista "Pronta para enviar?" roda o
 * mesmo `impedimentosDeEnvio` sobre o formulário em edição (AC-15) e vai para
 * a coluna lateral do detalhe quando `slotLateral` existe.
 *
 * O passo mora em quem monta o editor: salvar sobe a versão, e a tela monta o
 * editor de novo com `key={versao}`, mas o passo continua onde estava.
 */
export function EditorContratada({
  cotacao,
  passo,
  onPasso,
  onAlterado,
  onImpedimentos,
  slotLateral,
}: {
  cotacao: CotacaoDTO;
  passo: PassoMontagem;
  onPasso: (p: PassoMontagem) => void;
  onAlterado: () => void;
  onImpedimentos: (codigos: CodigoControle[]) => void;
  slotLateral?: HTMLElement | null;
}) {
  const inicial = estadoDoDto(cotacao);
  const [itens, setItens] = useState<ItemDoFormulario[]>(inicial.itens);
  const [orcamentos, setOrcamentos] = useState<OrcamentoDoFormulario[]>(inicial.orcamentos);
  const [versao, setVersao] = useState(cotacao.versao);
  const [erro, setErro] = useState<string | null>(null);
  const [enviandoArquivo, setEnviandoArquivo] = useState<string | null>(null);
  // A urgência só é pedida uma vez e nunca depois de recusada (AC-35).
  const urgencia = cotacao.urgencia ?? null;
  const podePedirUrgencia = !urgencia?.pedida;
  const [pedirUrgencia, setPedirUrgencia] = useState(false);
  const [justificativaUrgencia, setJustificativaUrgencia] = useState('');
  const [pendente, iniciar] = useTransition();

  const estado = { itens, orcamentos };
  const emUrgencia = urgencia?.pedida
    ? urgencia.decisao !== 'recusada'
    : podePedirUrgencia && pedirUrgencia;
  const resultado = prontaParaEnviar(estado, {
    cotacaoId: cotacao.id,
    raizContratada: cotacao.raizCnpjContratada ?? '',
    urgencia: emUrgencia,
  });
  const lista = (
    <ProntaParaEnviar
      linhas={linhasDaLista(estado, resultado, emUrgencia)}
      resultado={resultado}
      total={totalPeloMenorPreco(estado)}
    />
  );

  function mudarItem(id: string, campo: CampoDoItem, valor: string) {
    setItens((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }
  function mudarOrcamento(id: string, campo: CampoDoOrcamento, valor: string) {
    setOrcamentos((os) => os.map((o) => (o.id === id ? { ...o, [campo]: valor } : o)));
  }
  function mudarPreco(orcId: string, itemId: string, valor: string) {
    setOrcamentos((os) =>
      os.map((o) => (o.id === orcId ? { ...o, precos: { ...o.precos, [itemId]: valor } } : o)),
    );
  }
  function acrescentarReferencia(itemId: string, entrada: ReferenciaEntrada) {
    setItens((ls) =>
      ls.map((l) =>
        l.id === itemId ? { ...l, referencias: [...l.referencias, { entrada, gravada: null }] } : l,
      ),
    );
  }
  function tirarReferencia(itemId: string, refId: string) {
    setItens((ls) =>
      ls.map((l) =>
        l.id === itemId
          ? { ...l, referencias: l.referencias.filter((r) => r.entrada.id !== refId) }
          : l,
      ),
    );
  }

  async function anexar(orcId: string, arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviandoArquivo(orcId);
    const r = await enviarArquivo(cotacao.id, 'orcamento', arquivo);
    setEnviandoArquivo(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setOrcamentos((os) =>
      os.map((o) =>
        o.id === orcId ? { ...o, arquivoId: r.arquivoId, arquivoNome: arquivo.name } : o,
      ),
    );
  }

  /**
   * Classificar grava o rascunho antes, para o item novo existir no servidor e
   * nada digitado se perder; depois a tela recarrega com o preço da tabela.
   */
  function classificar(itemId: string, escolha: EscolhaTabela | { orcamento: true }) {
    setErro(null);
    const antes = erroAntesDeSalvar(estado);
    if (antes) {
      setErro(antes);
      return;
    }
    iniciar(async () => {
      const r = await salvarRascunhoAction(montarEntrada(estado, cotacao.id, versao));
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setVersao(r.versao);
      const c = await classificarItemAction({ id: cotacao.id, versao: r.versao, itemId, escolha });
      if (!c.ok) {
        // O rascunho já foi salvo e a versão subiu: recarregar monta o editor de novo
        // (a tela usa `key={versao}`), e um erro guardado aqui sumiria. O aviso fica.
        toast.error(c.error);
        onAlterado();
        return;
      }
      toast.success('orcamento' in escolha ? T.voltouParaOrcamentos : T.precoAplicado);
      onAlterado();
    });
  }

  function salvar(eDepois?: 'enviar') {
    setErro(null);
    onImpedimentos([]);
    const antes = erroAntesDeSalvar(estado);
    if (antes) {
      setErro(antes);
      return;
    }
    iniciar(async () => {
      const r = await salvarRascunhoAction(montarEntrada(estado, cotacao.id, versao));
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setVersao(r.versao);
      if (eDepois !== 'enviar') {
        toast.success(T.rascunhoSalvo);
        onAlterado();
        return;
      }
      const e = await enviarCotacaoAction({
        id: cotacao.id,
        versao: r.versao,
        ...(podePedirUrgencia && pedirUrgencia
          ? { urgencia: { justificativa: justificativaUrgencia } }
          : {}),
      });
      if (!e.ok) {
        // Mesmo motivo da classificação: o editor é montado de novo ao recarregar.
        toast.error(e.error);
        onImpedimentos(e.impedimentos ?? []);
        onAlterado();
        return;
      }
      toast.success(T.enviada);
      onAlterado();
    });
  }

  const n = PASSOS_MONTAGEM.indexOf(passo);
  const anterior = PASSOS_MONTAGEM[n - 1];
  const seguinte = PASSOS_MONTAGEM[n + 1];

  return (
    <div className="space-y-5">
      <PassosMontagem passo={passo} onPasso={onPasso} />

      {passo === 'itens' && (
        <PassoItens
          itens={itens}
          onMudar={mudarItem}
          onTirar={(id) => setItens((ls) => ls.filter((x) => x.id !== id))}
          onAcrescentar={() => setItens((ls) => [...ls, itemNovo(novoId())])}
        />
      )}
      {passo === 'tabela' && (
        <PassoPrecoTabela
          cotacaoId={cotacao.id}
          itens={itens}
          pendente={pendente}
          onClassificar={classificar}
        />
      )}
      {passo === 'orcamentos' && (
        <PassoOrcamentos
          itens={itens}
          orcamentos={orcamentos}
          enviandoArquivo={enviandoArquivo}
          pendente={pendente}
          onMudarOrcamento={mudarOrcamento}
          onMudarPreco={mudarPreco}
          onAnexar={(id, arquivo) => void anexar(id, arquivo)}
          onTirarOrcamento={(id) => setOrcamentos((os) => os.filter((x) => x.id !== id))}
          onAcrescentarOrcamento={() => setOrcamentos((os) => [...os, orcamentoNovo(novoId())])}
          onAcrescentarReferencia={acrescentarReferencia}
          onTirarReferencia={tirarReferencia}
        />
      )}
      {passo === 'revisar' && (
        <PassoRevisar
          estado={estado}
          urgencia={urgencia}
          pedirUrgencia={pedirUrgencia}
          justificativa={justificativaUrgencia}
          onPedirUrgencia={setPedirUrgencia}
          onJustificativa={setJustificativaUrgencia}
          lista={lista}
        />
      )}

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/50 bg-card p-3">
        {anterior ? (
          <Button type="button" variant="ghost" className="gap-2" onClick={() => onPasso(anterior)}>
            <ArrowLeft aria-hidden="true" />
            {T.voltarPara(ROTULO_PASSO_MONTAGEM[anterior])}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => salvar()} disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
            {T.salvarRascunho}
          </Button>
          {seguinte ? (
            <Button
              type="button"
              variant="gradiente"
              className="gap-2"
              onClick={() => onPasso(seguinte)}
            >
              {T.continuarPara(ROTULO_PASSO_MONTAGEM[seguinte])}
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="gradiente"
              className="gap-2"
              onClick={() => salvar('enviar')}
              disabled={pendente}
            >
              <Send aria-hidden="true" />
              {T.enviar}
            </Button>
          )}
        </div>
      </div>

      {/* No passo 4 a lista já está no conteúdo; nos outros, ela vai para a coluna lateral. */}
      {passo !== 'revisar' && (slotLateral ? createPortal(lista, slotLateral) : lista)}
    </div>
  );
}
