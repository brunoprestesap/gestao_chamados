'use client';

import { Loader2, Pencil, Trash2, Wallet } from 'lucide-react';
import { useCallback, useEffect, useId, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { MaterialForaCotacaoNormalized } from '@/lib/dto-normalizers';
import {
  centavos,
  custoDoChamado,
  formatarQuantidade,
  formatarReais,
  valorDaCotacaoCentavos,
  valorDoItemCentavos,
} from '@/shared/chamados/custo';
import { custoEditavel } from '@/shared/chamados/custo.constants';

import {
  adicionarMaterialAction,
  editarMaterialAction,
  informarValorFinalCotacaoAction,
  removerMaterialAction,
} from '../custo.actions';

/** A cotação como a rota devolve à gestão (spec 0018, AC-18). */
type CotacaoDaGestao = {
  _id: string;
  status: 'enviada' | 'aprovada' | 'recusada';
  valorEstimado: number;
  descricao: string;
  valorFinal?: number | null;
  valorFinalPorName?: string | null;
};

type Props = {
  chamadoId: string;
  status: string;
  temAtivo: boolean;
  materiais: MaterialForaCotacaoNormalized[];
  /** Depois de cada ação que deu certo: a página busca o chamado de novo. */
  onAlterado: () => void;
};

type Rascunho = { descricao: string; quantidade: string; valorUnitario: string };
const RASCUNHO_VAZIO: Rascunho = { descricao: '', quantidade: '', valorUnitario: '' };

function numeroOuNaN(texto: string): number {
  const limpo = texto.trim().replace(',', '.');
  return limpo === '' ? Number.NaN : Number(limpo);
}

/**
 * A seção "Custo" do detalhe da gestão (spec 0018, AC-1 a AC-8): cotações
 * aprovadas com o valor final, os itens de material fora de cotação e os totais.
 */
export function CustoChamadoSecao({ chamadoId, status, temAtivo, materiais, onAlterado }: Props) {
  const ids = useId();
  const editavel = custoEditavel(status);
  const [cotacoes, setCotacoes] = useState<CotacaoDaGestao[] | null>(null);
  const [erroCotacoes, setErroCotacoes] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho>(RASCUNHO_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [valoresFinais, setValoresFinais] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const buscarCotacoes = useCallback(async () => {
    try {
      const res = await fetch(`/api/chamados/${chamadoId}/cotacoes`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { history: CotacaoDaGestao[] };
      const aprovadas = json.history.filter((c) => c.status === 'aprovada');
      setCotacoes(aprovadas);
      setValoresFinais(
        Object.fromEntries(
          aprovadas.map((c) => [
            c._id,
            c.valorFinal === null || c.valorFinal === undefined
              ? ''
              : String(c.valorFinal).replace('.', ','),
          ]),
        ),
      );
      setErroCotacoes(false);
    } catch {
      setErroCotacoes(true);
    }
  }, [chamadoId]);

  useEffect(() => {
    void buscarCotacoes();
  }, [buscarCotacoes]);

  const depoisDaAcao = useCallback(
    (r: { ok: true } | { ok: false; error: string }, aoDarCerto?: () => void) => {
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setErro(null);
      aoDarCerto?.();
      void buscarCotacoes();
      onAlterado();
    },
    [buscarCotacoes, onAlterado],
  );

  const salvarItem = () => {
    const dados = {
      chamadoId,
      descricao: rascunho.descricao,
      quantidade: numeroOuNaN(rascunho.quantidade),
      valorUnitario: numeroOuNaN(rascunho.valorUnitario),
    };
    startTransition(async () => {
      const r = editandoId
        ? await editarMaterialAction({ ...dados, itemId: editandoId })
        : await adicionarMaterialAction(dados);
      depoisDaAcao(r, () => {
        setRascunho(RASCUNHO_VAZIO);
        setEditandoId(null);
      });
    });
  };

  const removerItem = (itemId: string) => {
    startTransition(async () => {
      const r = await removerMaterialAction({ chamadoId, itemId });
      depoisDaAcao(r, () => setRemovendoId(null));
    });
  };

  const salvarValorFinal = (cotacaoId: string) => {
    const texto = valoresFinais[cotacaoId] ?? '';
    const valorFinal = texto.trim() === '' ? null : numeroOuNaN(texto);
    startTransition(async () => {
      const r = await informarValorFinalCotacaoAction({ cotacaoId, valorFinal });
      depoisDaAcao(r);
    });
  };

  const editarItem = (item: MaterialForaCotacaoNormalized) => {
    setEditandoId(item._id);
    setRemovendoId(null);
    setRascunho({
      descricao: item.descricao,
      quantidade: String(item.quantidade).replace('.', ','),
      valorUnitario: String(item.valorUnitario).replace('.', ','),
    });
  };

  const total = custoDoChamado({ cotacoes: cotacoes ?? [], materiais });
  const semCusto = (cotacoes?.length ?? 0) === 0 && materiais.length === 0;

  return (
    <section aria-labelledby={`${ids}-titulo`}>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
          <Wallet
            className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
        </div>
        <h2 id={`${ids}-titulo`} className="text-sm font-semibold text-foreground">
          Custo
        </h2>
      </div>

      {!temAtivo && (
        <p className="mb-3 text-xs text-muted-foreground">
          Este chamado não tem ativo; o custo passa a contar para o equipamento quando ele for
          vinculado.
        </p>
      )}

      {erroCotacoes && (
        <p className="mb-3 text-xs text-rose-700 dark:text-rose-400">
          Não foi possível carregar as cotações deste chamado.
        </p>
      )}

      {cotacoes && cotacoes.length > 0 && (
        <div className="mb-4 space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Cotações aprovadas
          </h3>
          <ul className="space-y-2">
            {cotacoes.map((c) => {
              const campoId = `${ids}-final-${c._id}`;
              return (
                <li
                  key={c._id}
                  className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm"
                >
                  <p className="line-clamp-2 text-foreground">{c.descricao}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Estimado {formatarReais(centavos(c.valorEstimado))} · conta{' '}
                    <span className="font-medium text-foreground">
                      {formatarReais(valorDaCotacaoCentavos(c))}
                    </span>
                    {c.valorFinalPorName ? ` · valor final por ${c.valorFinalPorName}` : ''}
                  </p>
                  {editavel && (
                    <div className="mt-2 flex items-end gap-2">
                      <div className="flex-1">
                        <Label htmlFor={campoId} className="text-xs">
                          Valor final (R$)
                        </Label>
                        <Input
                          id={campoId}
                          inputMode="decimal"
                          placeholder="Vazio usa o estimado"
                          className="h-8 rounded-lg"
                          value={valoresFinais[c._id] ?? ''}
                          onChange={(e) =>
                            setValoresFinais((v) => ({ ...v, [c._id]: e.target.value }))
                          }
                          disabled={pendente}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pendente}
                        onClick={() => salvarValorFinal(c._id)}
                      >
                        Salvar
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Material fora de cotação
      </h3>
      {materiais.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {materiais.map((i) => (
            <li
              key={i._id}
              className="flex items-start justify-between gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-foreground">{i.descricao}</p>
                <p className="text-xs text-muted-foreground">
                  {formatarQuantidade(i.quantidade)} × {formatarReais(centavos(i.valorUnitario))} ={' '}
                  <span className="font-medium text-foreground">
                    {formatarReais(valorDoItemCentavos(i))}
                  </span>
                  {i.criadoPorNome ? ` · lançado por ${i.criadoPorNome}` : ''}
                </p>
              </div>
              {editavel && (
                <div className="flex shrink-0 items-center gap-1">
                  {removendoId === i._id ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={pendente}
                        onClick={() => removerItem(i._id)}
                      >
                        Remover
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pendente}
                        onClick={() => setRemovendoId(null)}
                      >
                        Manter
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`Editar ${i.descricao}`}
                        disabled={pendente}
                        onClick={() => editarItem(i)}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`Remover ${i.descricao}`}
                        disabled={pendente}
                        onClick={() => setRemovendoId(i._id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {editavel ? (
        <form
          className="space-y-2 rounded-xl border border-dashed border-border/80 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvarItem();
          }}
        >
          <p className="text-xs text-muted-foreground">
            Lance só o material que não passou por cotação aprovada.
          </p>
          <div>
            <Label htmlFor={`${ids}-descricao`} className="text-xs">
              Descrição
            </Label>
            <Input
              id={`${ids}-descricao`}
              className="h-8 rounded-lg"
              maxLength={200}
              value={rascunho.descricao}
              onChange={(e) => setRascunho((r) => ({ ...r, descricao: e.target.value }))}
              disabled={pendente}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${ids}-quantidade`} className="text-xs">
                Quantidade
              </Label>
              <Input
                id={`${ids}-quantidade`}
                inputMode="decimal"
                className="h-8 rounded-lg"
                value={rascunho.quantidade}
                onChange={(e) => setRascunho((r) => ({ ...r, quantidade: e.target.value }))}
                disabled={pendente}
              />
            </div>
            <div>
              <Label htmlFor={`${ids}-unitario`} className="text-xs">
                Valor unitário (R$)
              </Label>
              <Input
                id={`${ids}-unitario`}
                inputMode="decimal"
                className="h-8 rounded-lg"
                value={rascunho.valorUnitario}
                onChange={(e) => setRascunho((r) => ({ ...r, valorUnitario: e.target.value }))}
                disabled={pendente}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {editandoId && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pendente}
                onClick={() => {
                  setEditandoId(null);
                  setRascunho(RASCUNHO_VAZIO);
                }}
              >
                Cancelar
              </Button>
            )}
            <Button type="submit" size="sm" disabled={pendente}>
              {pendente && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {editandoId ? 'Salvar item' : 'Lançar item'}
            </Button>
          </div>
        </form>
      ) : null}

      {erro && (
        <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-400">
          {erro}
        </p>
      )}

      <Separator className="my-3 opacity-60" />
      {semCusto ? (
        <p className="text-sm text-muted-foreground">Nenhum custo lançado neste chamado.</p>
      ) : (
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Cotações</dt>
            <dd>{formatarReais(total.cotacoesCentavos)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Material</dt>
            <dd>{formatarReais(total.materialCentavos)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total do chamado</dt>
            <dd className="font-semibold text-foreground">{formatarReais(total.totalCentavos)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
