'use client';

import { ExternalLink, Hammer, Package, PackagePlus, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { CartaoCotacao } from '@/lib/material/leitura';
import { formatarReais } from '@/shared/chamados/custo';
import { ROTULO_SITUACAO, textoDoMotivo } from '@/shared/material/mensagens';

import { SituacaoBadge } from './apoio';
import { DialogExecucao } from './DialogExecucao';
import { DialogMaterial } from './DialogMaterial';

/**
 * O cartão da cotação de material no chamado (spec 0019): situação, número e
 * link; para o técnico, `Registrar material` e `Registrar execução`. O
 * solicitante vê só uma linha com a situação.
 */
export function CartaoCotacaoMaterial({
  chamadoId,
  onAlterado,
}: {
  chamadoId: string;
  onAlterado?: () => void;
}) {
  const [cartao, setCartao] = useState<CartaoCotacao | null>(null);
  const [dialogo, setDialogo] = useState<'criar' | 'editar' | 'executar' | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/chamados/${chamadoId}/cotacao-material`, { cache: 'no-store' });
      setCartao(res.ok ? ((await res.json()) as CartaoCotacao) : null);
    } catch {
      setCartao(null);
    }
  }, [chamadoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const depois = useCallback(() => {
    void carregar();
    onAlterado?.();
  }, [carregar, onAlterado]);

  if (!cartao || (!cartao.cotacao && !cartao.podeCriar)) return null;
  const cot = cartao.cotacao;

  if (cot?.visao === 'solicitante') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Package className="h-4 w-4" aria-hidden="true" />
        Material do chamado: <SituacaoBadge situacao={cot.situacao} />
      </p>
    );
  }

  const acoes = cartao.acoes;
  return (
    <section
      aria-labelledby={`material-${chamadoId}`}
      className="rounded-2xl border border-border/60 bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={`material-${chamadoId}`}
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
            <Package
              className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
          </span>
          Material
        </h2>
        {cot && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium tabular-nums">{cot.numero}</span>
            <SituacaoBadge situacao={cot.situacao} />
          </div>
        )}
      </div>

      {cot && (
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          <p>
            {cot.itens?.length ?? 0} {cot.itens?.length === 1 ? 'item' : 'itens'}
            {cot.valorTotalCentavos ? ` · ${formatarReais(cot.valorTotalCentavos)}` : ''}
          </p>
          {cot.ultimoMotivo && (cot.situacao === 'devolvida' || cot.situacao === 'reprovada') && (
            <p>
              {ROTULO_SITUACAO[cot.situacao]}: {textoDoMotivo(cot.ultimoMotivo)}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {cartao.podeCriar && (
          <Button size="sm" className="gap-2" onClick={() => setDialogo('criar')}>
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Registrar material
          </Button>
        )}
        {acoes?.editarDiagnostico && (
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => setDialogo('editar')}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Editar material
          </Button>
        )}
        {acoes?.executar && (
          <Button size="sm" className="gap-2" onClick={() => setDialogo('executar')}>
            <Hammer className="h-4 w-4" aria-hidden="true" />
            Registrar execução
          </Button>
        )}
        {cot && (
          <Button size="sm" variant="ghost" className="gap-2" asChild>
            <Link href={`/cotacoes/${cot.id}`}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Abrir cotação
            </Link>
          </Button>
        )}
      </div>

      {dialogo === 'criar' && (
        <DialogMaterial
          modo="criar"
          chamadoId={chamadoId}
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          onSalvo={depois}
        />
      )}
      {dialogo === 'editar' && cot?.itens && (
        <DialogMaterial
          modo="editar"
          cotacaoId={cot.id}
          versao={cot.versao}
          itens={cot.itens}
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          onSalvo={depois}
        />
      )}
      {dialogo === 'executar' && cot?.itens && (
        <DialogExecucao
          cotacaoId={cot.id}
          versao={cot.versao}
          itens={cot.itens}
          evidencias={(cot.arquivos ?? []).filter((a) => a.tipo === 'evidencia')}
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          // Só o cartão: recarregar a tela do técnico desmonta o diálogo aberto.
          onArquivos={() => void carregar()}
          onAlterado={depois}
        />
      )}
    </section>
  );
}
