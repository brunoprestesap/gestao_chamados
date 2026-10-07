'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  ATIVO_STATUS_LABELS,
  ATIVO_STATUSES,
  STATUS_CADASTRO,
  STATUS_CADASTRO_LABELS,
} from '@/shared/ativos/ativo.constants';

const TODOS = '__todos__';

/** Busca e filtros de `/ativos` (spec 0011, AC-10), guardados na URL. */
export function FiltrosAtivos({
  predios,
  categorias,
  gestao = false,
}: {
  predios: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
  /** Admin e Preposto veem o filtro "Substituição" (spec 0015, AC-9). */
  gestao?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [, iniciar] = useTransition();

  function aplicar(chave: string, valor: string | null) {
    const p = new URLSearchParams(params.toString());
    if (valor) p.set(chave, valor);
    else p.delete(chave);
    p.delete('pagina');
    const qs = p.toString();
    iniciar(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  useEffect(() => {
    const atual = params.get('q') ?? '';
    if (q.trim() === atual) return;
    const t = window.setTimeout(() => aplicar('q', q.trim() || null), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const temFiltro = ['q', 'local', 'categoria', 'status', 'cadastro', 'substituicao'].some((k) =>
    params.get(k),
  );

  const seletor = (chave: string, rotulo: string, opcoes: { valor: string; rotulo: string }[]) => (
    <Select
      value={params.get(chave) || TODOS}
      onValueChange={(v) => v && aplicar(chave, v === TODOS ? null : v)}
    >
      <SelectTrigger aria-label={rotulo} className="w-full min-w-0 bg-background">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{rotulo}: todos</SelectItem>
        {opcoes.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div
      className={cn(
        'grid gap-3 rounded-2xl border border-border/50 bg-card p-4 shadow-sm sm:grid-cols-2',
        gestao ? 'lg:grid-cols-4 xl:grid-cols-7' : 'lg:grid-cols-6',
      )}
    >
      <div className="relative sm:col-span-2">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Código ou trecho da descrição"
          aria-label="Buscar ativos por código ou descrição"
          className="bg-background pl-9"
        />
      </div>
      {seletor('local', 'Local', [
        { valor: 'sem', rotulo: 'Sem local' },
        ...predios.map((p) => ({ valor: p.id, rotulo: p.nome })),
      ])}
      {seletor(
        'categoria',
        'Categoria',
        categorias.map((c) => ({ valor: c.id, rotulo: c.nome })),
      )}
      {seletor(
        'status',
        'Status',
        ATIVO_STATUSES.map((s) => ({ valor: s, rotulo: ATIVO_STATUS_LABELS[s] })),
      )}
      {gestao &&
        seletor('substituicao', 'Substituição', [
          { valor: 'candidatos', rotulo: 'Candidatos à substituição' },
          { valor: 'dispensados', rotulo: 'Candidatos dispensados' },
        ])}
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          {seletor(
            'cadastro',
            'Cadastro',
            STATUS_CADASTRO.map((s) => ({ valor: s, rotulo: STATUS_CADASTRO_LABELS[s] })),
          )}
        </div>
        {temFiltro && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Limpar filtros"
            onClick={() => {
              setQ('');
              iniciar(() => router.replace(pathname));
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
