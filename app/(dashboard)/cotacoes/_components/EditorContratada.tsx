'use client';

import { FileUp, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CotacaoDTO } from '@/lib/material/serializar';
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import { formatarCnpj } from '@/shared/contratos/cnpj';
import {
  MAX_ITENS_COTACAO,
  MAX_ORCAMENTOS_COTACAO,
  MIN_ORCAMENTOS_POR_ITEM,
} from '@/shared/material/material.constants';
import type { CodigoControle } from '@/shared/material/mensagens';
import { reaisParaCentavos, valorDaLinhaCentavos } from '@/shared/material/valores';

import { enviarCotacaoAction, salvarRascunhoAction } from '../actions';
import { centavosParaCampo, enviarArquivo, novoId, numeroBr } from './apoio';

type Item = {
  id: string;
  descricao: string;
  unidade: string;
  quantidade: string;
  motivo: string;
  doDiagnostico: boolean;
};

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
  const [pendente, iniciar] = useTransition();

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
    const ids = new Set(itens.map((i) => i.id));
    return {
      id: cotacao.id,
      versao: v,
      itens: itens.map((i) => ({
        id: i.id,
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: numeroBr(i.quantidade),
        motivo: i.motivo,
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
      const e = await enviarCotacaoAction({ id: cotacao.id, versao: r.versao });
      if (!e.ok) {
        setErro(e.error);
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
                  readOnly={i.doDiagnostico}
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
              <p className="text-xs text-muted-foreground sm:col-span-3">
                Preço em {cotacoesDoItem(i.id)} de {MIN_ORCAMENTOS_POR_ITEM} orçamentos
                {menor != null && Number.isFinite(qtd)
                  ? ` · menor preço ${formatarReais(menor)} · linha ${formatarReais(valorDaLinhaCentavos(qtd, menor))}`
                  : ''}
              </p>
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
          Cada item precisa de preço em ao menos {MIN_ORCAMENTOS_POR_ITEM} orçamentos. Um orçamento
          pode cotar só parte dos itens; o preço do item é o menor entre os que o cotaram.
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
                  Validade (opcional)
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
              {itens.map((i, k) => (
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
              ))}
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
    </div>
  );
}
