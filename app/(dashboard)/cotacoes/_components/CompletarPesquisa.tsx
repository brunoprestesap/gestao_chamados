'use client';

import { FileUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CotacaoDTO } from '@/lib/material/serializar';
import { MAX_ORCAMENTOS_COTACAO, MIN_RAIZES_POR_ITEM } from '@/shared/material/material.constants';
import { raizesDoItem, reaisParaCentavos } from '@/shared/material/valores';

import { completarPesquisaAction } from '../actions';
import { enviarArquivo, novoId } from './apoio';

type Novo = {
  id: string;
  fornecedor: string;
  cnpj: string;
  data: string;
  validade: string;
  arquivoId: string;
  arquivoNome: string;
  precos: Record<string, string>;
};

const vazio = (): Novo => ({
  id: novoId(),
  fornecedor: '',
  cnpj: '',
  data: '',
  validade: '',
  arquivoId: '',
  arquivoNome: '',
  precos: {},
});

/**
 * A contratada completa a pesquisa da urgência aceita (spec 0019, AC-35): só
 * acrescenta orçamentos, com arquivo, CNPJ conferido e validade. Os que
 * sustentaram a aprovação não mudam, e o preço aplicado, o valor autorizado e
 * a reserva também não. Quando cada item chega a 3 empresas diferentes, o
 * recebimento definitivo é liberado.
 */
export function CompletarPesquisa({
  cotacao,
  onAlterado,
}: {
  cotacao: CotacaoDTO;
  onAlterado: () => void;
}) {
  const itens = (cotacao.itens ?? []).filter((i) => i.origem === 'orcamento');
  const gravados = cotacao.orcamentos ?? [];
  const [novos, setNovos] = useState<Novo[]>([vazio()]);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const mudar = (id: string, campo: keyof Novo, valor: string) =>
    setNovos((ns) => ns.map((n) => (n.id === id ? { ...n, [campo]: valor } : n)));
  const mudarPreco = (id: string, itemId: string, valor: string) =>
    setNovos((ns) =>
      ns.map((n) => (n.id === id ? { ...n, precos: { ...n.precos, [itemId]: valor } } : n)),
    );

  async function anexar(id: string, arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviando(id);
    const r = await enviarArquivo(cotacao.id, 'orcamento', arquivo);
    setEnviando(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setNovos((ns) =>
      ns.map((n) =>
        n.id === id ? { ...n, arquivoId: r.arquivoId, arquivoNome: arquivo.name } : n,
      ),
    );
  }

  // Quantas empresas cada item já tem, com os gravados e os que estão sendo lançados.
  const empresas = (itemId: string) =>
    raizesDoItem(itemId, [
      ...gravados,
      ...novos.map((n) => ({
        cnpj: n.cnpj,
        precos: Object.entries(n.precos)
          .filter(([, v]) => reaisParaCentavos(v) != null)
          .map(([i]) => ({ itemId: i })),
      })),
    ]);

  function salvar() {
    setErro(null);
    if (novos.some((n) => !n.arquivoId)) {
      setErro('Anexe o arquivo de cada orçamento novo.');
      return;
    }
    const orcamentos = novos.map((n) => ({
      id: n.id,
      fornecedor: n.fornecedor,
      cnpj: n.cnpj,
      data: n.data,
      validade: n.validade || null,
      arquivoId: n.arquivoId,
      precos: Object.entries(n.precos)
        .filter(([, v]) => v.trim() !== '')
        .map(([itemId, v]) => ({ itemId, valorUnitarioCentavos: reaisParaCentavos(v) ?? -1 })),
    }));
    iniciar(async () => {
      const r = await completarPesquisaAction({
        id: cotacao.id,
        versao: cotacao.versao,
        orcamentos,
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success(
        r.pesquisaCompleta
          ? 'Pesquisa completa. O gestor já pode registrar o recebimento definitivo.'
          : 'Orçamentos acrescentados. Ainda falta empresa para algum item.',
      );
      onAlterado();
    });
  }

  const cabe = gravados.length + novos.length < MAX_ORCAMENTOS_COTACAO;

  return (
    <section
      aria-labelledby="pesquisa-titulo"
      className="space-y-3 rounded-2xl border border-amber-300/60 p-4"
    >
      <h2 id="pesquisa-titulo" className="text-base font-semibold">
        Completar a pesquisa da urgência
      </h2>
      <p className="text-sm text-muted-foreground">
        Acrescente orçamentos até cada item ter {MIN_RAIZES_POR_ITEM} empresas diferentes. Os
        orçamentos já gravados não mudam, e o valor autorizado também não.
      </p>
      <ul className="text-sm">
        {itens.map((i) => (
          <li key={i.id}>
            {i.descricao}: {empresas(i.id)} de {MIN_RAIZES_POR_ITEM} empresas
          </li>
        ))}
      </ul>

      {novos.map((n, k) => (
        <fieldset key={n.id} className="space-y-3 rounded-xl border border-border/60 p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">
            Orçamento novo {k + 1}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`pf-${n.id}`} className="text-xs">
                Fornecedor
              </Label>
              <Input
                id={`pf-${n.id}`}
                value={n.fornecedor}
                onChange={(e) => mudar(n.id, 'fornecedor', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`pc-${n.id}`} className="text-xs">
                CNPJ
              </Label>
              <Input
                id={`pc-${n.id}`}
                inputMode="numeric"
                value={n.cnpj}
                onChange={(e) => mudar(n.id, 'cnpj', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`pd-${n.id}`} className="text-xs">
                Data
              </Label>
              <Input
                id={`pd-${n.id}`}
                type="date"
                value={n.data}
                onChange={(e) => mudar(n.id, 'data', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`pv-${n.id}`} className="text-xs">
                Validade
              </Label>
              <Input
                id={`pv-${n.id}`}
                type="date"
                value={n.validade}
                onChange={(e) => mudar(n.id, 'validade', e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Label
              htmlFor={`pa-${n.id}`}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 hover:bg-muted"
            >
              {enviando === n.id ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileUp className="h-4 w-4" aria-hidden="true" />
              )}
              {n.arquivoId ? 'Trocar arquivo' : 'Anexar arquivo do orçamento'}
            </Label>
            <input
              id={`pa-${n.id}`}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="sr-only"
              onChange={(e) => {
                void anexar(n.id, e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {n.arquivoId && <span className="text-muted-foreground">{n.arquivoNome}</span>}
          </div>
          <div className="space-y-2">
            {itens.map((i) => (
              <div key={i.id} className="grid items-center gap-2 sm:grid-cols-[1fr_10rem]">
                <Label htmlFor={`pp-${n.id}-${i.id}`} className="text-sm font-normal">
                  {i.descricao} ({i.unidade})
                </Label>
                <Input
                  id={`pp-${n.id}-${i.id}`}
                  inputMode="decimal"
                  placeholder="R$"
                  value={n.precos[i.id] ?? ''}
                  onChange={(e) => mudarPreco(n.id, i.id, e.target.value)}
                />
              </div>
            ))}
          </div>
          {novos.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 text-destructive"
              onClick={() => setNovos((ns) => ns.filter((x) => x.id !== n.id))}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Tirar este orçamento
            </Button>
          )}
        </fieldset>
      ))}

      {cabe && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setNovos((ns) => [...ns, vazio()])}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Mais um orçamento
        </Button>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <div>
        <Button onClick={salvar} disabled={pendente} className="gap-2">
          {pendente && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Acrescentar à pesquisa
        </Button>
      </div>
    </section>
  );
}
