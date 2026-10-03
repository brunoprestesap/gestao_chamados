'use client';

import { X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FILTRO_SITUACAO_LABELS, FILTROS_SITUACAO } from '@/shared/ativos/documento.constants';

const TODOS = '__todos__';

/** Filtros do painel de documentos (spec 0013, AC-9), guardados na URL. */
export function FiltrosDocumentos({
  visao,
  tipos,
  predios,
}: {
  visao: 'documentos' | 'faltando';
  tipos: { chave: string; nome: string }[];
  predios: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, iniciar] = useTransition();

  function aplicar(chave: string, valor: string | null) {
    const p = new URLSearchParams(params.toString());
    if (valor) p.set(chave, valor);
    else p.delete(chave);
    p.delete('pagina');
    const qs = p.toString();
    iniciar(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  const chaves = visao === 'documentos' ? ['tipo', 'situacao', 'predio'] : ['tipo', 'predio'];
  const temFiltro = chaves.some((k) => params.get(k));

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

  function limpar() {
    const p = new URLSearchParams();
    if (visao === 'faltando') p.set('visao', 'faltando');
    const qs = p.toString();
    iniciar(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-border/50 bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      {seletor(
        'tipo',
        'Tipo',
        tipos.map((t) => ({ valor: t.chave, rotulo: t.nome })),
      )}
      {visao === 'documentos' &&
        seletor(
          'situacao',
          'Situação',
          FILTROS_SITUACAO.map((s) => ({ valor: s, rotulo: FILTRO_SITUACAO_LABELS[s] })),
        )}
      {seletor(
        'predio',
        'Prédio',
        predios.map((p) => ({ valor: p.id, rotulo: p.nome })),
      )}
      {temFiltro && (
        <Button variant="ghost" onClick={limpar} className="justify-self-start">
          <X className="h-4 w-4" aria-hidden />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
