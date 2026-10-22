'use client';

import { Loader2, Search } from 'lucide-react';
import { useId, useState, useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ResultadoBusca } from '@/lib/material/precos';
import { formatarReais } from '@/shared/chamados/custo';
import { BUSCA_PRECO_MIN_LETRAS } from '@/shared/material/material.constants';
import { TEXTO_EDITOR as T } from '@/shared/material/mensagens';

import { buscarItensPrecoAction } from '../../actions';

export type EscolhaTabela = { anexoVItemId: string } | { sinapiCodigo: string };

/** `2026-09` vira `09/2026`. */
const mesBr = (ref: string | null) => (ref ? ref.split('-').reverse().join('/') : null);

/**
 * A busca no Anexo V do contrato e no SINAPI do mês mais recente, aberta
 * dentro do item (spec 0021, AC-13; regras da spec 0019, AC-26, AC-30). Os
 * resultados das duas tabelas ficam lado a lado; quem escolhe manda só o item
 * da tabela, e o servidor deriva a origem e copia o preço.
 */
export function BuscaPrecoNoItem({
  cotacaoId,
  item,
  escolhendo,
  onEscolher,
  onTresOrcamentos,
}: {
  cotacaoId: string;
  item: { id: string; descricao: string };
  escolhendo: boolean;
  onEscolher: (escolha: EscolhaTabela) => void;
  onTresOrcamentos: () => void;
}) {
  const id = useId();
  const [texto, setTexto] = useState(item.descricao);
  const [resultado, setResultado] = useState<ResultadoBusca | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, iniciar] = useTransition();
  const descricao = item.descricao || T.semDescricao;

  function buscar() {
    setErro(null);
    iniciar(async () => {
      const r = await buscarItensPrecoAction({ cotacaoId, texto });
      if (!r.ok) {
        setErro(r.error);
        setResultado(null);
        return;
      }
      setResultado(r);
    });
  }

  const mes = resultado ? mesBr(resultado.mes) : null;

  return (
    <div className="space-y-4 border-t border-border/60 bg-muted/30 p-4">
      <form
        role="search"
        aria-label={T.campoBusca(descricao)}
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <div className="min-w-0 flex-1 basis-56 space-y-1">
          <Label htmlFor={`busca-${id}`}>{T.campoBusca(descricao)}</Label>
          <Input
            id={`busca-${id}`}
            value={texto}
            minLength={BUSCA_PRECO_MIN_LETRAS}
            aria-describedby={`busca-ajuda-${id}`}
            onChange={(e) => setTexto(e.target.value)}
          />
          <p id={`busca-ajuda-${id}`} className="text-xs text-muted-foreground">
            {T.campoBuscaAjuda}
          </p>
        </div>
        <Button type="submit" variant="gradiente" disabled={buscando} className="mb-5 gap-2">
          {buscando ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
          {T.buscar}
        </Button>
      </form>

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}

      <div aria-live="polite">
        {resultado && (
          <div className="grid gap-4 md:grid-cols-2">
            <section aria-labelledby={`anexo-${id}`} className="min-w-0 space-y-2">
              <h4
                id={`anexo-${id}`}
                className="text-xs font-semibold tracking-wide text-indigo-800 uppercase dark:text-indigo-200"
              >
                {T.anexoV(resultado.contrato, resultado.anexoV.length)}
              </h4>
              {!resultado.contrato ? (
                <p className="text-sm text-muted-foreground">{T.semAnexoV}</p>
              ) : resultado.anexoV.length === 0 ? (
                <p className="text-sm text-muted-foreground">{T.nadaNaTabela}</p>
              ) : (
                <ul className="space-y-2">
                  {resultado.anexoV.map((a) => (
                    <li
                      key={a.anexoVItemId}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3"
                    >
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium">{a.descricao}</p>
                        <p className="text-xs text-muted-foreground">
                          item {a.numero} · {a.unidade} ·{' '}
                          <span className="tabular-nums">{formatarReais(a.precoCentavos)}</span>
                        </p>
                        {a.equivalenteSinapi && (
                          <Badge variant="outline" className="mt-1">
                            {T.temEquivalenteSinapi(a.equivalenteSinapi)}
                          </Badge>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={escolhendo}
                        aria-label={T.usarItem(`Anexo V, item ${a.numero}`)}
                        onClick={() => onEscolher({ anexoVItemId: a.anexoVItemId })}
                      >
                        {T.usar}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby={`sinapi-${id}`} className="min-w-0 space-y-2">
              <h4
                id={`sinapi-${id}`}
                className="text-xs font-semibold tracking-wide text-sky-800 uppercase dark:text-sky-200"
              >
                {T.sinapi(mes, resultado.sinapi.length)}
              </h4>
              {!resultado.mes ? (
                <p className="text-sm text-muted-foreground">{T.semSinapi}</p>
              ) : resultado.sinapi.length === 0 ? (
                <p className="text-sm text-muted-foreground">{T.nadaNaTabela}</p>
              ) : (
                <ul className="space-y-2">
                  {resultado.sinapi.map((s) => (
                    <li
                      key={s.codigo}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3"
                    >
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium">{s.descricao}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{s.codigo}</span> · {s.unidade} ·{' '}
                          <span className="tabular-nums">{formatarReais(s.precoCentavos)}</span>
                        </p>
                        {s.equivaleAoAnexoV.length > 0 && (
                          <Badge variant="outline" className="mt-1">
                            {T.equivaleAoAnexoV(s.equivaleAoAnexoV.join(', '))}
                          </Badge>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={escolhendo}
                        aria-label={T.usarItem(`SINAPI ${s.codigo}`)}
                        onClick={() => onEscolher({ sinapiCodigo: s.codigo })}
                      >
                        {T.usar}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{T.tabelaNaoSeEdita}</p>
      <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-3">
        <span className="text-sm text-muted-foreground">{T.nenhumServe}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={escolhendo}
          onClick={onTresOrcamentos}
        >
          {T.usarTresOrcamentos}
        </Button>
      </div>
    </div>
  );
}
