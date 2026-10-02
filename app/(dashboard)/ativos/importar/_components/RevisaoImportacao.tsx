'use client';

import { AlertTriangle, ArrowRight, Check, Loader2, Trash2, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ItemRevisao } from '@/lib/ativos/importacao/revisao';
import { cn } from '@/lib/utils';

import { aplicarImportacaoAction, descartarImportacaoAction } from '../actions';

type Novo = Extract<ItemRevisao, { grupo: 'novo' }>;
type Alterado = Extract<ItemRevisao, { grupo: 'alterado' }>;
type Sumido = Extract<ItemRevisao, { grupo: 'sumido' }>;

type Props = {
  id: string;
  itens: ItemRevisao[];
  categorias: { id: string; nome: string }[];
  muitosSumidos: boolean;
};

function alternar(conjunto: Set<string>, codigo: string, marcar: boolean): Set<string> {
  const novo = new Set(conjunto);
  if (marcar) novo.add(codigo);
  else novo.delete(codigo);
  return novo;
}

/**
 * Revisão da importação (spec 0012, AC-22): uma caixa por linha e "marcar
 * todos" por grupo. Novos e alterados começam marcados; sumidos começam
 * desmarcados. Novo sem categoria ativa não marca até o Admin escolher uma.
 */
export function RevisaoImportacao({ id, itens, categorias, muitosSumidos }: Props) {
  const router = useRouter();
  const [aplicando, iniciarAplicar] = useTransition();
  const [descartando, iniciarDescartar] = useTransition();
  const [confirmarSumidos, setConfirmarSumidos] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);

  const novos = useMemo(() => itens.filter((i): i is Novo => i.grupo === 'novo'), [itens]);
  const alterados = useMemo(
    () => itens.filter((i): i is Alterado => i.grupo === 'alterado'),
    [itens],
  );
  const sumidos = useMemo(() => itens.filter((i): i is Sumido => i.grupo === 'sumido'), [itens]);

  const [categoriaDe, setCategoriaDe] = useState<Record<string, string>>(() =>
    Object.fromEntries(novos.map((n) => [n.codigo, n.categoriaSugeridaId ?? ''])),
  );
  const [novosMarcados, setNovosMarcados] = useState(
    () => new Set(novos.filter((n) => n.categoriaSugeridaId && !n.bloqueio).map((n) => n.codigo)),
  );
  const [alteradosMarcados, setAlteradosMarcados] = useState(
    () => new Set(alterados.map((a) => a.codigo)),
  );
  const [sumidosMarcados, setSumidosMarcados] = useState(() => new Set<string>());

  const novosMarcaveis = novos.filter((n) => categoriaDe[n.codigo]);
  const total = novosMarcados.size + alteradosMarcados.size + sumidosMarcados.size;

  function aplicar(confirmaMuitosSumidos: boolean) {
    iniciarAplicar(async () => {
      const r = await aplicarImportacaoAction({
        id,
        novos: [...novosMarcados]
          .filter((c) => categoriaDe[c])
          .map((codigo) => ({ codigo, categoriaId: categoriaDe[codigo] })),
        alterados: [...alteradosMarcados],
        sumidos: [...sumidosMarcados],
        confirmaMuitosSumidos,
      });
      setConfirmarSumidos(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const { aplicados, concluida } = r.resultado;
      const somaAplicados = aplicados.novos + aplicados.alterados + aplicados.sumidos;
      if (concluida) {
        toast.success(
          `Importação aplicada: ${somaAplicados} ${somaAplicados === 1 ? 'item aplicado' : 'itens aplicados'}.`,
        );
      } else {
        toast.warning('Parte dos itens ficou para trás. Clique em Aplicar de novo para terminar.');
      }
      router.refresh();
    });
  }

  function descartar() {
    iniciarDescartar(async () => {
      const r = await descartarImportacaoAction({ id });
      setConfirmarDescarte(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Importação descartada.');
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {muitosSumidos && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            <strong>Muitos sumidos: o arquivo pode estar incompleto.</strong> Confira se o export
            saiu inteiro antes de marcar algum sumido.
          </p>
        </div>
      )}

      <Grupo
        titulo="Novos"
        descricao="Equipamentos do SICAM que o Sigma ainda não tem. Entram sem local, para a vistoria encontrar."
        vazio="Nenhum equipamento novo."
        quantidade={novos.length}
        marcados={novosMarcados.size}
        todosMarcados={novosMarcaveis.length > 0 && novosMarcados.size === novosMarcaveis.length}
        podeMarcarTodos={novosMarcaveis.length > 0}
        aoMarcarTodos={(m) =>
          setNovosMarcados(m ? new Set(novosMarcaveis.map((n) => n.codigo)) : new Set())
        }
      >
        {novos.map((n) => {
          const categoria = categoriaDe[n.codigo];
          return (
            <Linha
              key={n.codigo}
              codigo={n.codigo}
              marcado={novosMarcados.has(n.codigo)}
              desabilitado={!categoria}
              aoMarcar={(m) => setNovosMarcados((s) => alternar(s, n.codigo, m))}
            >
              <p className="text-sm">{n.descricao}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {n.tier && (
                  <Badge variant="outline" className="rounded-full">
                    Tier {n.tier}
                  </Badge>
                )}
                <label className="sr-only" htmlFor={`categoria-${n.codigo}`}>
                  Categoria do ativo {n.codigo}
                </label>
                <select
                  id={`categoria-${n.codigo}`}
                  value={categoria}
                  onChange={(e) => {
                    const valor = e.target.value;
                    setCategoriaDe((c) => ({ ...c, [n.codigo]: valor }));
                    setNovosMarcados((s) => alternar(s, n.codigo, !!valor));
                  }}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Escolha a categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                {n.bloqueio && !categoria && (
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {n.bloqueio}
                  </span>
                )}
              </div>
            </Linha>
          );
        })}
      </Grupo>

      <Grupo
        titulo="Alterados"
        descricao="Equipamentos cujo bloco patrimonial mudou no SICAM. Só esses campos mudam; local, fabricante, série e status ficam como estão."
        vazio="Nenhum dado patrimonial mudou."
        quantidade={alterados.length}
        marcados={alteradosMarcados.size}
        todosMarcados={alterados.length > 0 && alteradosMarcados.size === alterados.length}
        podeMarcarTodos={alterados.length > 0}
        aoMarcarTodos={(m) =>
          setAlteradosMarcados(m ? new Set(alterados.map((a) => a.codigo)) : new Set())
        }
      >
        {alterados.map((a) => (
          <Linha
            key={a.codigo}
            codigo={a.codigo}
            marcado={alteradosMarcados.has(a.codigo)}
            aoMarcar={(m) => setAlteradosMarcados((s) => alternar(s, a.codigo, m))}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm">{a.descricao}</p>
              {a.retornou && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                  <Undo2 className="h-3 w-3" aria-hidden />
                  Retornou
                </span>
              )}
            </div>
            {a.campos.length > 0 ? (
              <dl className="mt-2 grid gap-1.5 text-sm">
                {a.campos.map((c) => (
                  <div key={c.campo} className="flex flex-wrap items-baseline gap-x-2">
                    <dt className="text-muted-foreground">{c.rotulo}:</dt>
                    <dd className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-muted-foreground line-through decoration-muted-foreground/50">
                        {c.antes ?? 'vazio'}
                      </span>
                      <ArrowRight
                        className="h-3 w-3 self-center text-muted-foreground"
                        aria-label="para"
                      />
                      <span className="font-medium">{c.depois ?? 'vazio'}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {a.retornou
                  ? 'Voltou ao export do SICAM: a marca de ausente sai.'
                  : 'Passa a ter o bloco patrimonial do SICAM.'}
              </p>
            )}
          </Linha>
        ))}
      </Grupo>

      <Grupo
        titulo="Sumidos"
        descricao="Equipamentos que já vieram do SICAM e não estão neste arquivo. Marcar só põe o aviso de ausente; o status não muda. Começam desmarcados."
        vazio="Nenhum equipamento sumiu."
        quantidade={sumidos.length}
        marcados={sumidosMarcados.size}
        todosMarcados={sumidos.length > 0 && sumidosMarcados.size === sumidos.length}
        podeMarcarTodos={sumidos.length > 0}
        aoMarcarTodos={(m) =>
          setSumidosMarcados(m ? new Set(sumidos.map((s) => s.codigo)) : new Set())
        }
      >
        {sumidos.map((s) => (
          <Linha
            key={s.codigo}
            codigo={s.codigo}
            marcado={sumidosMarcados.has(s.codigo)}
            aoMarcar={(m) => setSumidosMarcados((c) => alternar(c, s.codigo, m))}
          >
            <p className="text-sm">{s.descricao}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.local}</p>
          </Linha>
        ))}
      </Grupo>

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/95 p-4 shadow-lg backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{total}</span>{' '}
          {total === 1 ? 'item marcado' : 'itens marcados'}. O que ficar desmarcado é registrado
          como não aplicado.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={aplicando || descartando}
            onClick={() => setConfirmarDescarte(true)}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Descartar
          </Button>
          <Button
            disabled={aplicando || descartando}
            onClick={() =>
              muitosSumidos && sumidosMarcados.size > 0 ? setConfirmarSumidos(true) : aplicar(false)
            }
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
          >
            {aplicando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Check className="h-4 w-4" aria-hidden />
            )}
            Aplicar
          </Button>
        </div>
      </div>

      <Dialog open={confirmarSumidos} onOpenChange={setConfirmarSumidos}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar {sumidosMarcados.size} como ausentes?</DialogTitle>
            <DialogDescription>
              Este arquivo deixou de fora muitos equipamentos que o SICAM já trouxe. Se o export
              saiu incompleto, eles vão aparecer como ausentes sem estar. Continue só se você
              conferiu o arquivo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Voltar</Button>
            </DialogClose>
            <Button disabled={aplicando} onClick={() => aplicar(true)}>
              {aplicando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Conferi, aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmarDescarte} onOpenChange={setConfirmarDescarte}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar esta importação?</DialogTitle>
            <DialogDescription>
              Nada do que ainda não foi aplicado muda no inventário. O detalhe da revisão é apagado
              e fica só o resumo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button variant="destructive" disabled={descartando} onClick={descartar}>
              {descartando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Grupo({
  titulo,
  descricao,
  vazio,
  quantidade,
  marcados,
  todosMarcados,
  podeMarcarTodos,
  aoMarcarTodos,
  children,
}: {
  titulo: string;
  descricao: string;
  vazio: string;
  quantidade: number;
  marcados: number;
  todosMarcados: boolean;
  podeMarcarTodos: boolean;
  aoMarcarTodos: (marcar: boolean) => void;
  children: ReactNode;
}) {
  const idTitulo = `grupo-${titulo.toLowerCase()}`;
  return (
    <section
      aria-labelledby={idTitulo}
      className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm"
    >
      <header className="flex flex-col gap-3 border-b border-border/50 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={idTitulo} className="text-base font-semibold">
            {titulo}{' '}
            <span className="font-normal tabular-nums text-muted-foreground">
              ({marcados} de {quantidade} marcados)
            </span>
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>
        </div>
        {podeMarcarTodos && (
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={todosMarcados}
              onCheckedChange={(v) => aoMarcarTodos(v === true)}
              aria-label={`Marcar todos os ${titulo.toLowerCase()}`}
            />
            Marcar todos
          </label>
        )}
      </header>
      {quantidade === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="divide-y divide-border/60">{children}</ul>
      )}
    </section>
  );
}

function Linha({
  codigo,
  marcado,
  desabilitado,
  aoMarcar,
  children,
}: {
  codigo: string;
  marcado: boolean;
  desabilitado?: boolean;
  aoMarcar: (marcar: boolean) => void;
  children: ReactNode;
}) {
  return (
    <li className={cn('flex gap-3 px-5 py-3', marcado && 'bg-primary/[0.03]')}>
      <Checkbox
        className="mt-0.5"
        checked={marcado}
        disabled={desabilitado}
        onCheckedChange={(v) => aoMarcar(v === true)}
        aria-label={`Marcar ${codigo}`}
      />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-semibold text-primary">{codigo}</p>
        {children}
      </div>
    </li>
  );
}
