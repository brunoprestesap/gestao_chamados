'use client';

import { History, Paperclip, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DetalheCotacao } from '@/lib/material/leitura';
import {
  MOTIVO_MAX,
  MOTIVO_MIN,
  TEXTO_CURTO_MAX,
  TEXTO_CURTO_MIN,
} from '@/shared/material/material.constants';
import {
  type AcaoComMotivo,
  type CodigoControle,
  ROTULO_ACAO_SECUNDARIA,
  ROTULO_PAPEL,
  ROTULO_SITUACAO,
  TEXTO_ACAO_DA_VEZ,
  TEXTO_APROVAR,
  TEXTO_DETALHE as T,
  TEXTO_DIALOGO_MOTIVO,
  TEXTO_ENCAMINHAR,
  TEXTO_SUA_VEZ,
  textoDoMotivo,
} from '@/shared/material/mensagens';

import {
  acrescentarReferenciaAction,
  alterarAction,
  aprovarAction,
  assumirAction,
  cancelarAction,
  devolverAction,
  encaminharAction,
  recusarUrgenciaAction,
  reprovarAction,
  retirarReferenciaAction,
} from '../actions';
import { AtesteCotacao, atesteVisivel, type PedidoAteste } from './AtesteCotacao';
import { BotaoPdfCotacao } from './BotaoPdfCotacao';
import { DialogMotivo } from './compartilhado/DialogMotivo';
import {
  type AcaoDoPainel,
  acaoPrincipal,
  PainelSuaVez,
  type PontoDoPainel,
} from './compartilhado/PainelSuaVez';
import { CompletarPesquisa } from './CompletarPesquisa';
import { AbaItens } from './detalhe/AbaItens';
import { AbaOrcamentos } from './detalhe/AbaOrcamentos';
import { AbaTrilha } from './detalhe/AbaTrilha';
import { BlocoEmpenho } from './detalhe/BlocoEmpenho';
import { CabecalhoCotacao } from './detalhe/CabecalhoCotacao';
import { DialogAprovar } from './detalhe/DialogAprovar';
import { DialogEncaminhar } from './DialogEncaminhar';
import { DialogExecucao } from './DialogExecucao';
import { DialogMaterial } from './DialogMaterial';
import { EditorContratada } from './EditorContratada';
import { FormReferencia } from './ReferenciasPreco';

type ResultadoAcao = { ok: true } | { ok: false; error: string; impedimentos?: CodigoControle[] };

/** A action e o tamanho do motivo de cada diálogo de motivo (AC-11); o servidor confere. */
const MOTIVO: Record<
  AcaoComMotivo,
  {
    action: (e: { id: string; versao: number; motivo: string }) => Promise<ResultadoAcao>;
    min: number;
    max: number;
    destrutiva: boolean;
  }
> = {
  devolver: { action: devolverAction, min: MOTIVO_MIN, max: MOTIVO_MAX, destrutiva: false },
  reprovar: { action: reprovarAction, min: MOTIVO_MIN, max: MOTIVO_MAX, destrutiva: true },
  cancelar: { action: cancelarAction, min: MOTIVO_MIN, max: MOTIVO_MAX, destrutiva: true },
  descartar: { action: cancelarAction, min: MOTIVO_MIN, max: MOTIVO_MAX, destrutiva: true },
  recusar_urgencia: {
    action: recusarUrgenciaAction,
    min: TEXTO_CURTO_MIN,
    max: TEXTO_CURTO_MAX,
    destrutiva: false,
  },
};

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Belem',
    dateStyle: 'short',
    timeStyle: 'short',
  });

const AVISO = {
  ambar:
    'rounded-2xl border border-amber-300/60 bg-amber-50/70 p-4 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100',
  rosa: 'rounded-2xl border border-rose-300/60 bg-rose-50/60 p-4 text-sm text-rose-950 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-100',
};

/**
 * O detalhe da cotação de material (spec 0019), repaginado pela spec 0021:
 * cabeçalho com a jornada, o conteúdo em abas à esquerda e o painel "Sua
 * vez", o empenho e o documento à direita (embaixo, no celular).
 */
export function DetalheCotacaoView({ detalhe }: { detalhe: DetalheCotacao }) {
  const router = useRouter();
  const { cotacao: c, acoes, chamado } = detalhe;
  const [impedimentos, setImpedimentos] = useState<CodigoControle[]>([]);
  const [motivo, setMotivo] = useState<AcaoComMotivo | null>(null);
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);
  const [aprovando, setAprovando] = useState(false);
  const [dialogo, setDialogo] = useState<'editar' | 'executar' | null>(null);
  const [encaminhando, setEncaminhando] = useState(false);
  const [referenciaPara, setReferenciaPara] = useState<string | null>(null);
  const [pedidoAteste, setPedidoAteste] = useState<PedidoAteste | null>(null);
  const [pendente, iniciar] = useTransition();
  const trf1 = c.visao === 'trf1';
  // Itens `ambas` pedem a base, e os da lista de conferência, a conferência (AC-27, AC-29).
  const itensAmbas = (c.itens ?? []).filter((i) => i.origem === 'ambas');
  const itensNaLista = (c.itens ?? []).filter((i) => i.marcaAnomalia);
  // Fatia 4: os orçamentos vencidos pedem a marca (AC-34), e a urgência, o aceite (AC-35).
  const analise = detalhe.encaminhar;
  const vencidos = new Set(analise?.orcamentosVencidos ?? []);
  const orcamentosVencidos = (c.orcamentos ?? []).filter((o) => vencidos.has(o.id));
  const urgenciaParaAceite =
    analise?.urgenciaPrecisaAceite && c.urgencia?.justificativa
      ? { justificativa: c.urgencia.justificativa }
      : null;
  const comVariacao = new Set(analise?.itensComVariacaoAcima ?? []);
  const precisaDeEscolhas =
    itensAmbas.length > 0 ||
    itensNaLista.length > 0 ||
    orcamentosVencidos.length > 0 ||
    !!urgenciaParaAceite;

  function agir(
    fn: () => Promise<ResultadoAcao>,
    sucesso: string,
    depois?: () => void,
    noErro?: (erro: string) => void,
  ) {
    setImpedimentos([]);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        setImpedimentos(r.impedimentos ?? []);
        noErro?.(r.error);
        router.refresh();
        return;
      }
      toast.success(sucesso);
      depois?.();
      router.refresh();
    });
  }

  function abrirMotivo(acao: AcaoComMotivo) {
    setErroMotivo(null);
    setMotivo(acao);
  }

  function encaminhar() {
    if (precisaDeEscolhas) {
      setEncaminhando(true);
      return;
    }
    agir(
      () => encaminharAction({ ...base, bases: [], conferencias: [] }),
      TEXTO_ENCAMINHAR.sucesso,
    );
  }

  const base = { id: c.id, versao: c.versao };
  // O técnico vai para a tela dele (execução); os outros acompanham o chamado em /conversas/[id].
  const linkChamado =
    c.visao === 'tecnico' ? `/chamados-atribuidos/${chamado.id}` : `/conversas/${chamado.id}`;

  // O painel "Sua vez" (AC-6): a ação principal, as secundárias e os pontos, todos de `acoes`.
  const principal = acaoPrincipal(acoes);
  const cliquePrincipal: Partial<Record<NonNullable<typeof principal>, () => void>> = {
    aprovar: () => setAprovando(true),
    encaminhar,
    assumir: () => agir(() => assumirAction(base), 'Análise assumida.'),
    executar: () => setDialogo('executar'),
    editarDiagnostico: () => setDialogo('editar'),
    receberProvisorio: () => setPedidoAteste('provisorio'),
    receberDefinitivo: () => setPedidoAteste('definitivo'),
    registrarNotaFiscal: () => setPedidoAteste('nota_fiscal'),
  };
  const ancoraPrincipal: Partial<Record<NonNullable<typeof principal>, string>> = {
    completarPesquisa: '#pesquisa',
    montar: '#montagem',
  };
  const secundarias = (
    [
      acoes.devolver && {
        chave: 'devolver',
        rotulo: ROTULO_ACAO_SECUNDARIA.devolver,
        onClick: () => abrirMotivo('devolver'),
      },
      acoes.reprovar && {
        chave: 'reprovar',
        rotulo: ROTULO_ACAO_SECUNDARIA.reprovar,
        destrutiva: true,
        onClick: () => abrirMotivo('reprovar'),
      },
      acoes.recusarUrgencia && {
        chave: 'recusarUrgencia',
        rotulo: ROTULO_ACAO_SECUNDARIA.recusarUrgencia,
        onClick: () => abrirMotivo('recusar_urgencia'),
      },
      acoes.alterar && {
        chave: 'alterar',
        rotulo: ROTULO_ACAO_SECUNDARIA.alterar,
        onClick: () =>
          agir(() => alterarAction(base), 'Cotação reaberta para alteração. O saldo foi liberado.'),
      },
      acoes.editarDiagnostico &&
        principal !== 'editarDiagnostico' && {
          chave: 'editarDiagnostico',
          rotulo: TEXTO_ACAO_DA_VEZ.editarDiagnostico.botao,
          onClick: () => setDialogo('editar'),
        },
      acoes.cancelar && {
        chave: 'cancelar',
        rotulo:
          c.situacao === 'rascunho'
            ? ROTULO_ACAO_SECUNDARIA.descartar
            : ROTULO_ACAO_SECUNDARIA.cancelar,
        destrutiva: true,
        onClick: () => abrirMotivo(c.situacao === 'rascunho' ? 'descartar' : 'cancelar'),
      },
    ] as (AcaoDoPainel | false)[]
  ).filter((a): a is AcaoDoPainel => !!a);

  const nomes = (lista: { descricao?: string; fornecedor?: string }[]) =>
    lista.map((x) => x.descricao ?? x.fornecedor).join(', ');
  const pontos: PontoDoPainel[] = analise
    ? (
        [
          orcamentosVencidos.length > 0 && {
            codigo: 'orcamento_vencido',
            detalhe: TEXTO_SUA_VEZ.orcamentosVencidos(nomes(orcamentosVencidos)),
          },
          comVariacao.size > 0 && {
            codigo: 'variacao_acima',
            detalhe: TEXTO_SUA_VEZ.itensComVariacao(
              nomes((c.itens ?? []).filter((i) => comVariacao.has(i.id))),
            ),
          },
          itensAmbas.length > 0 && {
            codigo: 'base_nao_escolhida',
            detalhe: TEXTO_SUA_VEZ.itensSemBase(itensAmbas.length),
          },
          itensNaLista.length > 0 && {
            codigo: 'conferencia_pendente',
            detalhe: TEXTO_SUA_VEZ.itensNaLista(itensNaLista.length),
          },
          !!urgenciaParaAceite && {
            codigo: 'urgencia_sem_decisao',
            detalhe: TEXTO_SUA_VEZ.urgenciaParaAceite,
          },
        ] as (PontoDoPainel | false)[]
      ).filter((p): p is PontoDoPainel => !!p)
    : [];
  const jaNosPontos = new Set(pontos.map((p) => p.codigo));
  const advertencias = (c.advertencias ?? [])
    .filter((a) => !jaNosPontos.has(a) && !impedimentos.includes(a))
    .map((codigo) => ({ codigo }));
  // O papel de quem lê: o de quem age agora, se for o dele; senão o primeiro que tem.
  const papel =
    detalhe.papeis.find((p) => p === c.quemAgeAgora?.papel) ?? detalhe.papeis[0] ?? null;

  const conteudo = acoes.montar ? (
    <div id="montagem" className="scroll-mt-24">
      <EditorContratada
        key={c.versao}
        cotacao={c}
        onAlterado={() => router.refresh()}
        onImpedimentos={setImpedimentos}
      />
    </div>
  ) : (
    <Tabs
      defaultValue="itens"
      className="gap-0 overflow-hidden rounded-2xl border border-border/50 bg-card"
    >
      <div className="overflow-x-auto border-b border-border/60 px-3 pt-3">
        <TabsList aria-label={T.conteudo} className="h-auto">
          <TabsTrigger value="itens" className="h-8 px-3">
            {T.abaItens}
          </TabsTrigger>
          {c.orcamentos && (
            <TabsTrigger value="orcamentos" className="h-8 px-3">
              {T.abaOrcamentos(c.orcamentos.length)}
            </TabsTrigger>
          )}
          <TabsTrigger value="trilha" className="h-8 px-3">
            {T.abaTrilha}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="itens" className="mt-0">
        <AbaItens
          cotacao={c}
          desabilitado={pendente}
          onRetirarReferencia={
            acoes.referenciasDoFiscal
              ? (itemId, referenciaId) =>
                  agir(
                    () => retirarReferenciaAction({ ...base, itemId, referenciaId }),
                    'Referência retirada.',
                  )
              : undefined
          }
          onAcrescentarReferencia={acoes.referenciasDoFiscal ? setReferenciaPara : undefined}
        />
      </TabsContent>
      {/* O técnico não recebe orçamentos (serializarCotacao): sem eles, a aba nem aparece. */}
      {c.orcamentos && (
        <TabsContent value="orcamentos" className="mt-0">
          <AbaOrcamentos cotacao={c} vencidos={vencidos} />
        </TabsContent>
      )}
      <TabsContent value="trilha" className="mt-0">
        <AbaTrilha trilha={c.trilha ?? []} />
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="space-y-5">
      <CabecalhoCotacao detalhe={detalhe} linkChamado={linkChamado} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {c.ultimoMotivo && ['devolvida', 'reprovada', 'cancelada'].includes(c.situacao) && (
            <p className={AVISO.ambar}>
              <strong className="font-semibold">{ROTULO_SITUACAO[c.situacao]}:</strong>{' '}
              {textoDoMotivo(c.ultimoMotivo)}
            </p>
          )}

          {c.urgencia?.pedida && (
            <section className={`${AVISO.rosa} flex items-start gap-3`}>
              <Zap className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="space-y-1.5">
                <p className="font-semibold">
                  {c.urgencia.decisao === 'aceita'
                    ? T.urgenciaAceita(c.urgencia.decididaPorNome ?? null)
                    : c.urgencia.decisao === 'recusada'
                      ? T.urgenciaRecusada
                      : T.urgenciaPedida}
                </p>
                {c.urgencia.justificativa && (
                  <p>
                    {T.justificativa}: {c.urgencia.justificativa}
                  </p>
                )}
                {c.urgencia.motivoRecusa && (
                  <p>
                    {T.motivoDaRecusa}: {c.urgencia.motivoRecusa}
                  </p>
                )}
                {c.pesquisaPendente && <p>{T.pesquisaPendente}</p>}
                {c.urgencia.pesquisaCompletaEm && (
                  <p>{T.pesquisaCompletaEm(dataHora(c.urgencia.pesquisaCompletaEm))}</p>
                )}
              </div>
            </section>
          )}

          {/* Da execução em diante, o ateste é o trabalho da vez: vem antes do conteúdo (AC-9). */}
          {atesteVisivel(c) && (
            <div id="ateste" className="scroll-mt-24">
              <AtesteCotacao
                cotacao={c}
                pedido={pedidoAteste}
                onPedido={setPedidoAteste}
                onAlterado={() => router.refresh()}
              />
            </div>
          )}

          {conteudo}

          {acoes.montar && (c.trilha ?? []).length > 0 && (
            <section
              aria-labelledby="trilha-titulo"
              className="rounded-2xl border border-border/50 bg-card"
            >
              <h2
                id="trilha-titulo"
                className="flex items-center gap-2 px-5 pt-5 text-base font-semibold"
              >
                <History className="size-4 text-muted-foreground" aria-hidden="true" />
                {T.abaTrilha}
              </h2>
              <AbaTrilha trilha={c.trilha ?? []} />
            </section>
          )}

          {acoes.completarPesquisa && (
            <div id="pesquisa" className="scroll-mt-24">
              <CompletarPesquisa key={c.versao} cotacao={c} onAlterado={() => router.refresh()} />
            </div>
          )}

          {/* Da execução em diante, as evidências moram no ateste (AC-9). */}
          {!atesteVisivel(c) && (c.arquivos ?? []).some((a) => a.tipo === 'evidencia') && (
            <section
              aria-labelledby="evid-titulo"
              className="space-y-2 rounded-2xl border border-border/50 bg-card p-5 text-sm"
            >
              <h2 id="evid-titulo" className="text-base font-semibold">
                {T.evidencias}
              </h2>
              <ul className="space-y-1">
                {(c.arquivos ?? [])
                  .filter((a) => a.tipo === 'evidencia')
                  .map((a) => (
                    <li key={a.id}>
                      <a
                        href={`/api/cotacoes/arquivos/${a.id}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Paperclip className="size-3.5" aria-hidden="true" />
                        {a.nomeOriginal}
                      </a>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </div>

        <aside aria-label={TEXTO_SUA_VEZ.rotuloOutros} className="min-w-0 space-y-5">
          <PainelSuaVez
            papel={papel ? ROTULO_PAPEL[papel] : null}
            principal={
              principal
                ? {
                    acao: principal,
                    onClick: cliquePrincipal[principal],
                    href: ancoraPrincipal[principal],
                  }
                : null
            }
            secundarias={secundarias}
            impedimentos={impedimentos.map((codigo) => ({ codigo }))}
            pontos={pontos}
            advertencias={advertencias}
            quemAge={c.quemAgeAgora}
            pendente={pendente}
          />
          {trf1 && c.empenho && <BlocoEmpenho empenho={c.empenho} />}
          {acoes.gerarPdf && (
            <section
              aria-labelledby="documento-titulo"
              className="space-y-3 rounded-2xl border border-border/50 bg-card p-5"
            >
              <h2 id="documento-titulo" className="text-base font-semibold">
                {T.documento}
              </h2>
              <BotaoPdfCotacao cotacaoId={c.id} numero={c.numero} />
            </section>
          )}
        </aside>
      </div>

      {motivo && (
        <DialogMotivo
          key={motivo}
          titulo={TEXTO_DIALOGO_MOTIVO[motivo].titulo}
          descricao={TEXTO_DIALOGO_MOTIVO[motivo].descricao}
          rotuloConfirmar={TEXTO_DIALOGO_MOTIVO[motivo].botao}
          destrutiva={MOTIVO[motivo].destrutiva}
          min={MOTIVO[motivo].min}
          max={MOTIVO[motivo].max}
          pendente={pendente}
          erroServidor={erroMotivo}
          onFechar={() => setMotivo(null)}
          onConfirmar={(texto) => {
            // O erro da tentativa anterior sai antes do reenvio, para não piscar como novo.
            setErroMotivo(null);
            agir(
              () => MOTIVO[motivo].action({ ...base, motivo: texto }),
              TEXTO_DIALOGO_MOTIVO[motivo].sucesso,
              () => setMotivo(null),
              setErroMotivo,
            );
          }}
        />
      )}

      {aprovando && (
        <DialogAprovar
          numero={c.numero}
          valorCentavos={c.valorTotalCentavos ?? 0}
          barras={c.empenho?.modo === 'aprovacao' ? c.empenho.barras : []}
          relevantes={new Set((detalhe.projecoes ?? []).map((p) => p.empenhoId))}
          faixa={detalhe.faixaDoLeitor ?? null}
          pendente={pendente}
          onFechar={() => setAprovando(false)}
          onConfirmar={(empenhoId) =>
            agir(
              () => aprovarAction({ ...base, empenhoId }),
              TEXTO_APROVAR.sucesso,
              () => setAprovando(false),
            )
          }
        />
      )}

      {encaminhando && (
        <DialogEncaminhar
          numero={c.numero}
          valorCentavos={c.valorTotalCentavos ?? 0}
          ambas={itensAmbas}
          naLista={itensNaLista}
          vencidos={orcamentosVencidos}
          urgencia={urgenciaParaAceite}
          open
          pendente={pendente}
          onOpenChange={setEncaminhando}
          onConfirmar={(escolhas) =>
            agir(
              () => encaminharAction({ ...base, ...escolhas }),
              TEXTO_ENCAMINHAR.sucesso,
              () => setEncaminhando(false),
            )
          }
        />
      )}

      <Dialog open={!!referenciaPara} onOpenChange={(o) => !o && setReferenciaPara(null)}>
        <DialogContent className="sm:max-w-xl sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Referência de preço do fiscal</DialogTitle>
            <DialogDescription>
              {(c.itens ?? []).find((i) => i.id === referenciaPara)?.descricao}. A referência fica
              na trilha e a contratada a vê; o fiscal só retira a que ele mesmo incluiu.
            </DialogDescription>
          </DialogHeader>
          <FormReferencia
            desabilitado={pendente}
            rotuloBotao="Gravar referência"
            onAdicionar={(referencia) =>
              referenciaPara &&
              agir(
                () => acrescentarReferenciaAction({ ...base, itemId: referenciaPara, referencia }),
                'Referência acrescentada.',
                () => setReferenciaPara(null),
              )
            }
          />
        </DialogContent>
      </Dialog>

      {dialogo === 'editar' && c.itens && (
        <DialogMaterial
          modo="editar"
          cotacaoId={c.id}
          versao={c.versao}
          itens={c.itens}
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          onSalvo={() => router.refresh()}
        />
      )}
      {dialogo === 'executar' && c.itens && (
        <DialogExecucao
          cotacaoId={c.id}
          versao={c.versao}
          itens={c.itens}
          evidencias={(c.arquivos ?? []).filter((a) => a.tipo === 'evidencia')}
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          onArquivos={() => router.refresh()}
          onAlterado={() => router.refresh()}
        />
      )}
    </div>
  );
}
