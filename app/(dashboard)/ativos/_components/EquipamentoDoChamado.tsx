'use client';

import { Loader2, PackageSearch, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { ItemSeletorAtivo, ResumoAtivoChamado } from '@/shared/ativos/seletor.types';

import { SeletorAtivo } from './SeletorAtivo';

/**
 * Linha "Equipamento" do chamado (spec 0011, AC-16). Sem `onVincular`, só
 * mostra. Com ele (só a tela de gestão passa), vincula, troca ou remove.
 */
export function EquipamentoDoChamado({
  ativo,
  onVincular,
}: {
  ativo: ResumoAtivoChamado | null;
  onVincular?: (
    ativo: ItemSeletorAtivo | null,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!ativo && !onVincular) return null;

  async function aplicar(item: ItemSeletorAtivo | null) {
    if (!onVincular) return;
    setSalvando(true);
    setErro(null);
    const r = await onVincular(item);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setEditando(false);
  }

  return (
    <div className="px-3.5 py-3 transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
          <PackageSearch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Equipamento</p>
          {ativo ? (
            <p className="text-sm text-foreground">
              <Link
                href={`/ativos/${ativo.id}`}
                className="font-mono font-medium text-primary underline-offset-4 hover:underline"
              >
                {ativo.codigo}
              </Link>
              <span className="block truncate text-xs text-muted-foreground">
                {ativo.descricao}
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum equipamento vinculado</p>
          )}
        </div>
        {onVincular && !editando && (
          <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {ativo ? 'Trocar' : 'Vincular'}
          </Button>
        )}
      </div>

      {onVincular && editando && (
        <div className="mt-3 space-y-2">
          <SeletorAtivo
            valor={null}
            onChange={(item) => item && void aplicar(item)}
            disabled={salvando}
          />
          <div className="flex flex-wrap items-center gap-2">
            {ativo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void aplicar(null)}
                disabled={salvando}
              >
                Remover equipamento
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditando(false);
                setErro(null);
              }}
              disabled={salvando}
            >
              Cancelar
            </Button>
            {salvando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
