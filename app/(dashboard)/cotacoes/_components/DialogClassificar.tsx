'use client';

import { Loader2, Search } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ResultadoBusca } from '@/lib/material/precos';
import { formatarReais } from '@/shared/chamados/custo';
import { BUSCA_PRECO_MIN_LETRAS } from '@/shared/material/material.constants';

import { buscarItensPrecoAction } from '../actions';

export type EscolhaTabela = { anexoVItemId: string } | { sinapiCodigo: string };

const mesBr = (ref: string | null) => (ref ? ref.split('-').reverse().join('/') : '');

/**
 * Busca no Anexo V do contrato do chamado e no SINAPI do mês mais recente
 * (spec 0019, AC-26, AC-30). Preço e unidade aparecem só para leitura: quem
 * escolhe manda só o item da tabela, e o servidor deriva a origem e copia o
 * preço.
 */
export function DialogClassificar({
  cotacaoId,
  item,
  open,
  onOpenChange,
  onEscolher,
  escolhendo,
}: {
  cotacaoId: string;
  item: { id: string; descricao: string };
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEscolher: (escolha: EscolhaTabela) => void;
  escolhendo: boolean;
}) {
  const [texto, setTexto] = useState(item.descricao);
  const [resultado, setResultado] = useState<ResultadoBusca | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, iniciar] = useTransition();

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

  const nada = resultado && resultado.anexoV.length === 0 && resultado.sinapi.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Buscar preço para: {item.descricao || 'item'}</DialogTitle>
          <DialogDescription>
            O preço e a unidade vêm da tabela e não se editam. Item do Anexo V que também está no
            SINAPI entra com as duas bases, e o fiscal escolhe qual vale.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            buscar();
          }}
        >
          <div className="flex-1 space-y-1">
            <Label htmlFor="busca-preco">Descrição, número do item ou código SINAPI</Label>
            <Input
              id="busca-preco"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              minLength={BUSCA_PRECO_MIN_LETRAS}
            />
          </div>
          <Button type="submit" disabled={buscando} className="gap-2">
            {buscando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            Buscar
          </Button>
        </form>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        {resultado && (
          <div className="space-y-4" aria-live="polite">
            <p className="text-xs text-muted-foreground">
              {resultado.contrato
                ? `Anexo V do contrato ${resultado.contrato}`
                : 'Sem contrato vigente com Anexo V para o tipo de serviço deste chamado'}
              {' · '}
              {resultado.mes ? `SINAPI de ${mesBr(resultado.mes)}` : 'sem SINAPI importado'}
            </p>
            {nada && <p className="text-sm text-muted-foreground">Nada encontrado.</p>}
            {resultado.anexoV.length > 0 && (
              <section aria-labelledby="res-anexo" className="space-y-2">
                <h3 id="res-anexo" className="text-sm font-semibold">
                  Anexo V
                </h3>
                <ul className="space-y-2">
                  {resultado.anexoV.map((a) => (
                    <li
                      key={a.anexoVItemId}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 p-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p>
                          <span className="font-medium">Item {a.numero}</span> · {a.descricao}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatarReais(a.precoCentavos)} por {a.unidade}
                          {a.equivalenteSinapi && (
                            <Badge variant="outline" className="ml-2">
                              tem equivalente SINAPI {a.equivalenteSinapi}
                            </Badge>
                          )}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={escolhendo}
                        onClick={() => onEscolher({ anexoVItemId: a.anexoVItemId })}
                      >
                        Usar
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {resultado.sinapi.length > 0 && (
              <section aria-labelledby="res-sinapi" className="space-y-2">
                <h3 id="res-sinapi" className="text-sm font-semibold">
                  SINAPI
                </h3>
                <ul className="space-y-2">
                  {resultado.sinapi.map((s) => (
                    <li
                      key={s.codigo}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 p-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p>
                          <span className="font-mono font-medium">{s.codigo}</span> · {s.descricao}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatarReais(s.precoCentavos)} por {s.unidade}
                          {s.equivaleAoAnexoV.length > 0 && (
                            <Badge variant="outline" className="ml-2">
                              equivale ao item {s.equivaleAoAnexoV.join(', ')} do Anexo V
                            </Badge>
                          )}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={escolhendo}
                        onClick={() => onEscolher({ sinapiCodigo: s.codigo })}
                      >
                        Usar
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
