'use client';

import { FileUp, Loader2, Plus, Search, Send, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CotacaoDTO, ReferenciaDTO } from '@/lib/material/serializar';
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import { formatarCnpj } from '@/shared/contratos/cnpj';
import type { ReferenciaEntrada } from '@/shared/material/cotacao.schemas';
import {
  MAX_ITENS_COTACAO,
  MAX_ORCAMENTOS_COTACAO,
  MAX_REFERENCIAS_POR_PAPEL,
  MIN_ORCAMENTOS_POR_ITEM,
  TEXTO_CURTO_MAX,
  TEXTO_CURTO_MIN,
} from '@/shared/material/material.constants';
import type { CodigoControle } from '@/shared/material/mensagens';
import { raizesDoItem, reaisParaCentavos, valorDaLinhaCentavos } from '@/shared/material/valores';

import { classificarItemAction, enviarCotacaoAction, salvarRascunhoAction } from '../actions';
import { centavosParaCampo, enviarArquivo, novoId, numeroBr, SeloUrgencia } from './apoio';
import { DialogClassificar, type EscolhaTabela } from './DialogClassificar';
import { FormReferencia, ListaReferencias } from './ReferenciasPreco';

type Item = {
  id: string;
  descricao: string;
  unidade: string;
  quantidade: string;
  motivo: string;
  doDiagnostico: boolean;
  /** Fatia 3: de onde vem o preço; `null` ou `orcamento` é o caminho 3. */
  origem: string | null;
  anexoVNumero: number | null;
  sinapiCodigo: string | null;
  sinapiReferencia: string | null;
  precoTabelaCentavos: number | null;
  valorProvisorio: boolean;
  /** Fatia 4: as referências da contratada (editáveis) e as do fiscal (só leitura). */
  referencias: RefLocal[];
  referenciasFiscal: ReferenciaDTO[];
};

/** Uma referência da contratada: a entrada que vai ao servidor e, se já gravada, como ficou. */
type RefLocal = { entrada: ReferenciaEntrada; gravada: ReferenciaDTO | null };

function entradaDaGravada(r: ReferenciaDTO): ReferenciaEntrada {
  return r.tipo === 'sinapi' && r.sinapiCodigo
    ? { id: r.id, sinapiCodigo: r.sinapiCodigo }
    : { id: r.id, fonte: r.fonte, valorUnitarioCentavos: r.valorUnitarioCentavos, data: r.data };
}

/** Como a referência ainda não salva aparece: o preço SINAPI só chega ao salvar. */
function textoDaNova(e: ReferenciaEntrada): string {
  if ('sinapiCodigo' in e) return `SINAPI ${e.sinapiCodigo} · o preço vem da tabela ao salvar`;
  return `${formatarReais(e.valorUnitarioCentavos)} · ${e.fonte} · ${e.data.split('-').reverse().join('/')}`;
}

const daTabela = (i: Pick<Item, 'origem'>) => !!i.origem && i.origem !== 'orcamento';

/** Como o responsável técnico lê a origem do preço de um item classificado. */
function textoDaOrigem(i: Item): string {
  const mes = i.sinapiReferencia ? i.sinapiReferencia.split('-').reverse().join('/') : '';
  if (i.origem === 'anexo_v') return `Anexo V, item ${i.anexoVNumero}`;
  if (i.origem === 'sinapi') return `SINAPI ${i.sinapiCodigo} (${mes})`;
  if (i.origem === 'ambas') {
    return `Anexo V, item ${i.anexoVNumero}, e SINAPI ${i.sinapiCodigo} (${mes}): o fiscal escolhe a base`;
  }
  return 'Três orçamentos';
}

type Orcamento = {
  id: string;
  fornecedor: string;
  cnpj: string;
  data: string;
  validade: string;
  arquivoId: string;
  arquivoNome: string;
  precos: Record<string, string>;
};

function doDto(c: CotacaoDTO): { itens: Item[]; orcamentos: Orcamento[] } {
  const nomeArquivo = new Map((c.arquivos ?? []).map((a) => [a.id, a.nomeOriginal]));
  return {
    itens: (c.itens ?? []).map((i) => ({
      id: i.id,
      descricao: i.descricao,
      unidade: i.unidade,
      quantidade: formatarQuantidade(i.quantidade),
      motivo: i.motivo,
      doDiagnostico: i.doDiagnostico,
      origem: i.origem ?? null,
      anexoVNumero: i.anexoVNumero ?? null,
      sinapiCodigo: i.sinapiCodigo ?? null,
      sinapiReferencia: i.sinapiReferencia ?? null,
      precoTabelaCentavos: daTabela({ origem: i.origem ?? null }) ? i.precoAplicadoCentavos : null,
      valorProvisorio: !!i.valorProvisorio,
      referencias: (i.referencias ?? [])
        .filter((r) => r.papel === 'responsavel_tecnico')
        .map((r) => ({ entrada: entradaDaGravada(r), gravada: r })),
      referenciasFiscal: (i.referencias ?? []).filter((r) => r.papel === 'fiscal'),
    })),
    orcamentos: (c.orcamentos ?? []).map((o) => ({
      id: o.id,
      fornecedor: o.fornecedor,
      cnpj: formatarCnpj(o.cnpj),
      data: o.data,
      validade: o.validade ?? '',
      arquivoId: o.arquivoId,
      arquivoNome: nomeArquivo.get(o.arquivoId) ?? 'arquivo anexado',
      precos: Object.fromEntries(
        o.precos.map((p) => [p.itemId, centavosParaCampo(p.valorUnitarioCentavos)]),
      ),
    })),
  };
}

/**
 * O responsável técnico monta a cotação (spec 0019, AC-1, AC-4): acrescenta
 * itens, lança os orçamentos com o arquivo de cada um e o preço que cada um
 * deu a cada item, e envia. Os itens do diagnóstico não mudam de descrição,
 * unidade nem quantidade.
 */
export function EditorContratada({
  cotacao,
  onAlterado,
  onImpedimentos,
}: {
  cotacao: CotacaoDTO;
  onAlterado: () => void;
  onImpedimentos: (codigos: CodigoControle[]) => void;
}) {
  const inicial = doDto(cotacao);
  const [itens, setItens] = useState<Item[]>(inicial.itens);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>(inicial.orcamentos);
  const [versao, setVersao] = useState(cotacao.versao);
  const [erro, setErro] = useState<string | null>(null);
  const [enviandoArquivo, setEnviandoArquivo] = useState<string | null>(null);
  const [classificando, setClassificando] = useState<Item | null>(null);
  // A urgência só é pedida uma vez e nunca depois de recusada (AC-35).
  const urgencia = cotacao.urgencia ?? null;
  const podePedirUrgencia = !urgencia?.pedida;
  const [pedirUrgencia, setPedirUrgencia] = useState(false);
  const [justificativaUrgencia, setJustificativaUrgencia] = useState('');
  const [pendente, iniciar] = useTransition();

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

  function mudarItem(id: string, campo: keyof Item, valor: string) {
    setItens((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }
  function mudarOrc(id: string, campo: keyof Orcamento, valor: string) {
    setOrcamentos((os) => os.map((o) => (o.id === id ? { ...o, [campo]: valor } : o)));
  }
  function mudarPreco(orcId: string, itemId: string, valor: string) {
    setOrcamentos((os) =>
      os.map((o) => (o.id === orcId ? { ...o, precos: { ...o.precos, [itemId]: valor } } : o)),
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

  function montarEntrada(v: number) {
    // Só os itens do caminho 3 recebem preço de orçamento.
    const ids = new Set(itens.filter((i) => !daTabela(i)).map((i) => i.id));
    return {
      id: cotacao.id,
      versao: v,
      itens: itens.map((i) => ({
        id: i.id,
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: numeroBr(i.quantidade),
        motivo: i.motivo,
        // Só o caminho 3 tem referência; a lista troca só as da contratada (AC-32).
        ...(daTabela(i) ? {} : { referencias: i.referencias.map((r) => r.entrada) }),
      })),
      orcamentos: orcamentos.map((o) => ({
        id: o.id,
        fornecedor: o.fornecedor,
        cnpj: o.cnpj,
        data: o.data,
        validade: o.validade || null,
        arquivoId: o.arquivoId,
        precos: Object.entries(o.precos)
          .filter(([itemId, v]) => ids.has(itemId) && v.trim() !== '')
          .map(([itemId, v]) => ({ itemId, valorUnitarioCentavos: reaisParaCentavos(v) ?? -1 })),
      })),
    };
  }

  /**
   * Classificar grava o rascunho antes, para o item novo existir no servidor e
   * nada digitado se perder; depois a tela recarrega com o preço da tabela.
   */
  function classificar(itemId: string, escolha: EscolhaTabela | { orcamento: true }) {
    setErro(null);
    if (orcamentos.some((o) => !o.arquivoId)) {
      setErro('Anexe o arquivo de cada orçamento antes de salvar.');
      return;
    }
    iniciar(async () => {
      const r = await salvarRascunhoAction(montarEntrada(versao));
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
      setClassificando(null);
      toast.success(
        'orcamento' in escolha ? 'Item voltou para três orçamentos.' : 'Preço da tabela aplicado.',
      );
      onAlterado();
    });
  }

  function salvar(eDepois?: 'enviar') {
    setErro(null);
    onImpedimentos([]);
    if (orcamentos.some((o) => !o.arquivoId)) {
      setErro('Anexe o arquivo de cada orçamento antes de salvar.');
      return;
    }
    iniciar(async () => {
      const r = await salvarRascunhoAction(montarEntrada(versao));
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setVersao(r.versao);
      if (eDepois !== 'enviar') {
        toast.success('Rascunho salvo.');
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
      toast.success('Cotação enviada para análise.');
      onAlterado();
    });
  }

  const precoMinimo = (itemId: string): number | null => {
    const valores = orcamentos
      .map((o) => reaisParaCentavos(o.precos[itemId] ?? ''))
      .filter((v): v is number => v != null);
    return valores.length ? Math.min(...valores) : null;
  };
  const cotacoesDoItem = (itemId: string) =>
    orcamentos.filter((o) => reaisParaCentavos(o.precos[itemId] ?? '') != null).length;
  // Empresas diferentes que cotaram o item: a mesma raiz de CNPJ conta uma vez (AC-31).
  const empresasDoItem = (itemId: string) =>
    raizesDoItem(
      itemId,
      orcamentos
        .filter((o) => reaisParaCentavos(o.precos[itemId] ?? '') != null)
        .map((o) => ({ cnpj: o.cnpj, precos: [{ itemId }] })),
    );

  return (
    <div className="space-y-6">
      <section aria-labelledby="itens-titulo" className="space-y-3">
        <h2 id="itens-titulo" className="text-base font-semibold">
          Itens
        </h2>
        {itens.map((i, n) => {
          const menor = precoMinimo(i.id);
          const qtd = numeroBr(i.quantidade);
          return (
            <fieldset
              key={i.id}
              className="grid gap-2 rounded-xl border border-border/60 p-3 sm:grid-cols-[1fr_5rem_6rem]"
            >
              <legend className="px-1 text-xs font-medium text-muted-foreground">
                Item {n + 1}
                {i.doDiagnostico ? ' · do diagnóstico do técnico' : ''}
              </legend>
              <div className="space-y-1">
                <Label htmlFor={`d-${i.id}`} className="text-xs">
                  Descrição
                </Label>
                <Input
                  id={`d-${i.id}`}
                  value={i.descricao}
                  readOnly={i.doDiagnostico}
                  onChange={(e) => mudarItem(i.id, 'descricao', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`u-${i.id}`} className="text-xs">
                  Unidade
                </Label>
                <Input
                  id={`u-${i.id}`}
                  value={i.unidade}
                  // A unidade do item classificado é a da tabela (AC-26).
                  readOnly={i.doDiagnostico || daTabela(i)}
                  onChange={(e) => mudarItem(i.id, 'unidade', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`q-${i.id}`} className="text-xs">
                  Quantidade
                </Label>
                <Input
                  id={`q-${i.id}`}
                  inputMode="decimal"
                  value={i.quantidade}
                  readOnly={i.doDiagnostico}
                  onChange={(e) => mudarItem(i.id, 'quantidade', e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2 sm:col-span-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`m-${i.id}`} className="text-xs">
                    Para que serve
                  </Label>
                  <Input
                    id={`m-${i.id}`}
                    value={i.motivo}
                    onChange={(e) => mudarItem(i.id, 'motivo', e.target.value)}
                  />
                </div>
                {!i.doDiagnostico && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover item ${n + 1}`}
                    onClick={() => setItens((ls) => ls.filter((x) => x.id !== i.id))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-3">
                {daTabela(i) ? (
                  <p className="flex-1">
                    <span className="font-medium text-foreground">{textoDaOrigem(i)}</span>
                    {i.precoTabelaCentavos != null
                      ? ` · ${formatarReais(i.precoTabelaCentavos)} por ${i.unidade}` +
                        (Number.isFinite(qtd)
                          ? ` · linha ${formatarReais(valorDaLinhaCentavos(qtd, i.precoTabelaCentavos))}`
                          : '')
                      : i.valorProvisorio
                        ? ' · valor provisório até o fiscal escolher a base'
                        : ''}
                  </p>
                ) : (
                  <p className="flex-1">
                    Preço em {cotacoesDoItem(i.id)} de {MIN_ORCAMENTOS_POR_ITEM} orçamentos, de{' '}
                    {empresasDoItem(i.id)} empresas diferentes
                    {menor != null && Number.isFinite(qtd)
                      ? ` · menor preço ${formatarReais(menor)} · linha ${formatarReais(valorDaLinhaCentavos(qtd, menor))}`
                      : ''}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={pendente}
                  onClick={() => setClassificando(i)}
                >
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                  {daTabela(i) ? 'Trocar item da tabela' : 'Buscar no Anexo V ou SINAPI'}
                </Button>
                {daTabela(i) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pendente}
                    onClick={() => classificar(i.id, { orcamento: true })}
                  >
                    Usar três orçamentos
                  </Button>
                )}
              </div>
              {!daTabela(i) && (
                <div className="space-y-2 sm:col-span-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Referências de preço (ao menos uma para enviar)
                  </p>
                  {i.referencias.length > 0 && (
                    <ul className="space-y-1 text-xs">
                      {i.referencias.map((r) => (
                        <li key={r.entrada.id} className="flex flex-wrap items-center gap-2">
                          <span>
                            {r.gravada
                              ? `${formatarReais(r.gravada.valorUnitarioCentavos)}${r.gravada.unidade ? ` por ${r.gravada.unidade}` : ''} · ${r.gravada.fonte} · ${r.gravada.data.split('-').reverse().join('/')}`
                              : textoDaNova(r.entrada)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            aria-label="Tirar esta referência"
                            onClick={() => tirarReferencia(i.id, r.entrada.id)}
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {i.referenciasFiscal.length > 0 && (
                    <ListaReferencias referencias={i.referenciasFiscal} />
                  )}
                  {i.referencias.length < MAX_REFERENCIAS_POR_PAPEL && (
                    <FormReferencia
                      desabilitado={pendente}
                      onAdicionar={(r) => acrescentarReferencia(i.id, r)}
                    />
                  )}
                </div>
              )}
            </fieldset>
          );
        })}
        {itens.length < MAX_ITENS_COTACAO && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() =>
              setItens((ls) => [
                ...ls,
                {
                  id: novoId(),
                  descricao: '',
                  unidade: 'un',
                  quantidade: '',
                  motivo: '',
                  doDiagnostico: false,
                  origem: null,
                  anexoVNumero: null,
                  sinapiCodigo: null,
                  sinapiReferencia: null,
                  precoTabelaCentavos: null,
                  valorProvisorio: false,
                  referencias: [],
                  referenciasFiscal: [],
                },
              ])
            }
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Acrescentar item
          </Button>
        )}
      </section>

      <section aria-labelledby="orc-titulo" className="space-y-3">
        <h2 id="orc-titulo" className="text-base font-semibold">
          Orçamentos
        </h2>
        <p className="text-xs text-muted-foreground">
          Cada item fora do Anexo V e do SINAPI precisa de preço em ao menos{' '}
          {MIN_ORCAMENTOS_POR_ITEM} orçamentos de empresas diferentes (raízes de CNPJ distintas),
          nenhum da própria contratada. Um orçamento pode cotar só parte dos itens; o preço do item
          é o menor entre os que o cotaram.
        </p>
        {orcamentos.map((o, n) => (
          <fieldset key={o.id} className="space-y-3 rounded-xl border border-border/60 p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Orçamento {n + 1}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`f-${o.id}`} className="text-xs">
                  Fornecedor
                </Label>
                <Input
                  id={`f-${o.id}`}
                  value={o.fornecedor}
                  onChange={(e) => mudarOrc(o.id, 'fornecedor', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`c-${o.id}`} className="text-xs">
                  CNPJ
                </Label>
                <Input
                  id={`c-${o.id}`}
                  value={o.cnpj}
                  inputMode="numeric"
                  onChange={(e) => mudarOrc(o.id, 'cnpj', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`dt-${o.id}`} className="text-xs">
                  Data
                </Label>
                <Input
                  id={`dt-${o.id}`}
                  type="date"
                  value={o.data}
                  onChange={(e) => mudarOrc(o.id, 'data', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`v-${o.id}`} className="text-xs">
                  Validade (obrigatória para enviar)
                </Label>
                <Input
                  id={`v-${o.id}`}
                  type="date"
                  value={o.validade}
                  onChange={(e) => mudarOrc(o.id, 'validade', e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Label
                htmlFor={`a-${o.id}`}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 hover:bg-muted"
              >
                {enviandoArquivo === o.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                )}
                {o.arquivoId ? 'Trocar arquivo' : 'Anexar arquivo do orçamento'}
              </Label>
              <input
                id={`a-${o.id}`}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="sr-only"
                onChange={(e) => {
                  void anexar(o.id, e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {o.arquivoId && <span className="text-muted-foreground">{o.arquivoNome}</span>}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Preço unitário por item (deixe vazio o que este orçamento não cotou)
              </p>
              {itens.map((i, k) =>
                daTabela(i) ? null : (
                  <div key={i.id} className="grid items-center gap-2 sm:grid-cols-[1fr_10rem]">
                    <Label htmlFor={`p-${o.id}-${i.id}`} className="text-sm font-normal">
                      {k + 1}. {i.descricao || 'item sem descrição'} ({i.unidade})
                    </Label>
                    <Input
                      id={`p-${o.id}-${i.id}`}
                      inputMode="decimal"
                      placeholder="R$"
                      value={o.precos[i.id] ?? ''}
                      onChange={(e) => mudarPreco(o.id, i.id, e.target.value)}
                    />
                  </div>
                ),
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 text-destructive"
              onClick={() => setOrcamentos((os) => os.filter((x) => x.id !== o.id))}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Tirar orçamento
            </Button>
          </fieldset>
        ))}
        {orcamentos.length < MAX_ORCAMENTOS_COTACAO && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() =>
              setOrcamentos((os) => [
                ...os,
                {
                  id: novoId(),
                  fornecedor: '',
                  cnpj: '',
                  data: '',
                  validade: '',
                  arquivoId: '',
                  arquivoNome: '',
                  precos: {},
                },
              ])
            }
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Acrescentar orçamento
          </Button>
        )}
      </section>

      <section aria-labelledby="urg-titulo" className="space-y-2">
        <h2 id="urg-titulo" className="flex items-center gap-2 text-base font-semibold">
          Urgência
          {urgencia?.pedida && <SeloUrgencia />}
        </h2>
        {urgencia?.pedida ? (
          <div className="space-y-1 text-sm">
            <p>Justificativa: {urgencia.justificativa}</p>
            {urgencia.decisao === 'recusada' ? (
              <p className="text-amber-800 dark:text-amber-200">
                O fiscal recusou a urgência
                {urgencia.motivoRecusa ? `: ${urgencia.motivoRecusa}` : ''}. O reenvio segue o fluxo
                comum, com os {MIN_ORCAMENTOS_POR_ITEM} orçamentos de cada item.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Com a urgência, basta 1 orçamento por item para enviar. Depois da autorização,
                complete a pesquisa com orçamentos de {MIN_ORCAMENTOS_POR_ITEM} empresas diferentes.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pedirUrgencia}
                onChange={(e) => setPedirUrgencia(e.target.checked)}
              />
              Pedir urgência no envio (basta 1 orçamento por item até a autorização)
            </label>
            {pedirUrgencia && (
              <div className="space-y-1">
                <Label htmlFor="urg-just" className="text-xs">
                  Justificativa da urgência ({TEXTO_CURTO_MIN} a {TEXTO_CURTO_MAX} caracteres)
                </Label>
                <Textarea
                  id="urg-just"
                  value={justificativaUrgencia}
                  maxLength={TEXTO_CURTO_MAX}
                  onChange={(e) => setJustificativaUrgencia(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => salvar()} disabled={pendente}>
          {pendente && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Salvar rascunho
        </Button>
        <Button onClick={() => salvar('enviar')} disabled={pendente} className="gap-2">
          <Send className="h-4 w-4" aria-hidden="true" />
          Salvar e enviar para análise
        </Button>
      </div>

      {classificando && (
        <DialogClassificar
          cotacaoId={cotacao.id}
          item={classificando}
          open
          escolhendo={pendente}
          onOpenChange={(o) => !o && setClassificando(null)}
          onEscolher={(escolha) => classificar(classificando.id, escolha)}
        />
      )}
    </div>
  );
}
