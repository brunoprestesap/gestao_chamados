'use client';

import { History, Paperclip, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { DetalheCotacao } from '@/lib/material/leitura';
import { formatarReais } from '@/shared/chamados/custo';
import { TEXTO_CURTO_MAX, TEXTO_CURTO_MIN } from '@/shared/material/material.constants';
import {
  type CodigoControle,
  CONTROLES,
  ROTULO_ACAO_SECUNDARIA,
  ROTULO_PAPEL,
  ROTULO_SITUACAO,
  TEXTO_ACAO_DA_VEZ,
  TEXTO_DETALHE as T,
  TEXTO_SUA_VEZ,
  textoDoMotivo,
  textoProjecao,
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
import { AtesteCotacao } from './AtesteCotacao';
import { BotaoPdfCotacao } from './BotaoPdfCotacao';
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
import { DialogEncaminhar } from './DialogEncaminhar';
import { DialogExecucao } from './DialogExecucao';
import { DialogMaterial } from './DialogMaterial';
import { EditorContratada } from './EditorContratada';
import { FormReferencia } from './ReferenciasPreco';

type ResultadoAcao = { ok: true } | { ok: false; error: string; impedimentos?: CodigoControle[] };

type ComMotivo = 'devolver' | 'reprovar' | 'cancelar' | 'recusar_urgencia';

const TITULO_MOTIVO: Record<ComMotivo, string> = {
  devolver: 'Devolver para correção',
  reprovar: 'Reprovar a cotação',
  cancelar: 'Cancelar a cotação',
  recusar_urgencia: 'Recusar a urgência e devolver',
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
  const [motivo, setMotivo] = useState<{ acao: ComMotivo; texto: string } | null>(null);
  const [aprovando, setAprovando] = useState(false);
  const [empenhoId, setEmpenhoId] = useState('');
  const [dialogo, setDialogo] = useState<'editar' | 'executar' | null>(null);
  const [encaminhando, setEncaminhando] = useState(false);
  const [referenciaPara, setReferenciaPara] = useState<string | null>(null);
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

  const elegiveisComSaldo = (detalhe.empenhosElegiveis ?? []).filter(
    (e) => e.saldoCentavos >= (c.valorTotalCentavos ?? 0),
  );

  function agir(fn: () => Promise<ResultadoAcao>, sucesso: string, depois?: () => void) {
    setImpedimentos([]);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        setImpedimentos(r.impedimentos ?? []);
        router.refresh();
        return;
      }
      toast.success(sucesso);
      depois?.();
      router.refresh();
    });
  }

  function abrirAprovar() {
    setEmpenhoId(elegiveisComSaldo.length === 1 ? elegiveisComSaldo[0]!.id : '');
    setAprovando(true);
  }

  function encaminhar() {
    if (precisaDeEscolhas) {
      setEncaminhando(true);
      return;
    }
    agir(
      () => encaminharAction({ ...base, bases: [], conferencias: [] }),
      'Encaminhada para aprovação.',
    );
  }

  const base = { id: c.id, versao: c.versao };
  // O técnico vai para a tela dele (execução); os outros acompanham o chamado em /conversas/[id].
  const linkChamado =
    c.visao === 'tecnico' ? `/chamados-atribuidos/${chamado.id}` : `/conversas/${chamado.id}`;

  // O painel "Sua vez" (AC-6): a ação principal, as secundárias e os pontos, todos de `acoes`.
  const principal = acaoPrincipal(acoes);
  const cliquePrincipal: Partial<Record<NonNullable<typeof principal>, () => void>> = {
    aprovar: abrirAprovar,
    encaminhar,
    assumir: () => agir(() => assumirAction(base), 'Análise assumida.'),
    executar: () => setDialogo('executar'),
    editarDiagnostico: () => setDialogo('editar'),
  };
  const ancoraPrincipal: Partial<Record<NonNullable<typeof principal>, string>> = {
    receberProvisorio: '#ateste',
    receberDefinitivo: '#ateste',
    registrarNotaFiscal: '#ateste',
    completarPesquisa: '#pesquisa',
    montar: '#montagem',
  };
  const secundarias = (
    [
      acoes.devolver && {
        chave: 'devolver',
        rotulo: ROTULO_ACAO_SECUNDARIA.devolver,
        onClick: () => setMotivo({ acao: 'devolver', texto: '' }),
      },
      acoes.reprovar && {
        chave: 'reprovar',
        rotulo: ROTULO_ACAO_SECUNDARIA.reprovar,
        destrutiva: true,
        onClick: () => setMotivo({ acao: 'reprovar', texto: '' }),
      },
      acoes.recusarUrgencia && {
        chave: 'recusarUrgencia',
        rotulo: ROTULO_ACAO_SECUNDARIA.recusarUrgencia,
        onClick: () => setMotivo({ acao: 'recusar_urgencia', texto: '' }),
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
        onClick: () => setMotivo({ acao: 'cancelar', texto: '' }),
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

          {(c.arquivos ?? []).some((a) => a.tipo === 'evidencia') && (
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

          <div id="ateste" className="scroll-mt-24">
            <AtesteCotacao cotacao={c} acoes={acoes} onAlterado={() => router.refresh()} />
          </div>
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

      <Dialog open={!!motivo} onOpenChange={(o) => !o && setMotivo(null)}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>{motivo ? TITULO_MOTIVO[motivo.acao] : ''}</DialogTitle>
            <DialogDescription>
              {motivo?.acao === 'recusar_urgencia'
                ? `A urgência recusada não pode ser pedida de novo nesta cotação, e o reenvio segue o fluxo comum. O motivo (${TEXTO_CURTO_MIN} a ${TEXTO_CURTO_MAX} caracteres) fica na trilha e vai para a contratada.`
                : 'O motivo fica na trilha e vai para quem montou a cotação.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Textarea
              id="motivo"
              value={motivo?.texto ?? ''}
              onChange={(e) => motivo && setMotivo({ ...motivo, texto: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMotivo(null)} disabled={pendente}>
              Voltar
            </Button>
            <Button
              disabled={pendente}
              onClick={() => {
                if (!motivo) return;
                const entrada = { ...base, motivo: motivo.texto };
                const fn =
                  motivo.acao === 'devolver'
                    ? () => devolverAction(entrada)
                    : motivo.acao === 'reprovar'
                      ? () => reprovarAction(entrada)
                      : motivo.acao === 'recusar_urgencia'
                        ? () => recusarUrgenciaAction(entrada)
                        : () => cancelarAction(entrada);
                agir(fn, 'Feito.', () => setMotivo(null));
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aprovando} onOpenChange={setAprovando}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Aprovar {c.numero}</DialogTitle>
            <DialogDescription>
              Aprovar reserva {formatarReais(c.valorTotalCentavos ?? 0)} no empenho escolhido e
              autoriza a compra.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Empenho</legend>
            {(detalhe.empenhosElegiveis ?? []).map((e) => {
              const cabe = e.saldoCentavos >= (c.valorTotalCentavos ?? 0);
              const projecao = detalhe.projecoes?.find((p) => p.empenhoId === e.id);
              return (
                <div key={e.id} className="space-y-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="empenho"
                      value={e.id}
                      checked={empenhoId === e.id}
                      disabled={!cabe}
                      onChange={() => setEmpenhoId(e.id)}
                      aria-describedby={projecao ? `projecao-${e.id}` : undefined}
                    />
                    {e.numero} · saldo {formatarReais(e.saldoCentavos)}
                    {!cabe && ' (sem saldo)'}
                  </label>
                  {projecao && (
                    <p
                      id={`projecao-${e.id}`}
                      className="ml-6 rounded-lg border border-amber-300/60 bg-amber-50/70 px-2 py-1 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100"
                    >
                      {CONTROLES.projecao_esgotamento.texto} {textoProjecao(projecao)}
                    </p>
                  )}
                </div>
              );
            })}
          </fieldset>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAprovando(false)} disabled={pendente}>
              Voltar
            </Button>
            <Button
              disabled={pendente || !empenhoId}
              onClick={() =>
                agir(
                  () => aprovarAction({ ...base, empenhoId }),
                  'Cotação autorizada.',
                  () => setAprovando(false),
                )
              }
            >
              Aprovar e reservar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {encaminhando && (
        <DialogEncaminhar
          numero={c.numero}
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
              'Encaminhada para aprovação.',
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
