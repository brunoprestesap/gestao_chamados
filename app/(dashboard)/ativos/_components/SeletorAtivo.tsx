'use client';

import { Loader2, MapPin, PackageSearch, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ItemSeletorAtivo } from '@/shared/ativos/seletor.types';

/**
 * Busca de equipamento (spec 0011, AC-14 e AC-16): combobox acessível que
 * consulta `GET /api/ativos/busca` (só Tier A ou B, nunca `baixado`). Com um
 * ativo escolhido, mostra o cartão dele com o botão de limpar.
 */
export function SeletorAtivo({
  valor,
  onChange,
  id,
  disabled,
  descricaoId,
}: {
  valor: ItemSeletorAtivo | null;
  onChange: (item: ItemSeletorAtivo | null) => void;
  id?: string;
  disabled?: boolean;
  descricaoId?: string;
}) {
  const gerado = useId();
  const inputId = id ?? `seletor-ativo-${gerado}`;
  const listaId = `${inputId}-lista`;
  const [consulta, setConsulta] = useState('');
  const [itens, setItens] = useState<ItemSeletorAtivo[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ativoIdx, setAtivoIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  // Fechamento adiado do blur (deixa o clique na opção chegar antes). Voltar ao
  // campo cancela: senão o fechamento velho fecha a lista que acabou de abrir.
  const fecharRef = useRef<number | null>(null);
  const cancelarFechamento = () => {
    if (fecharRef.current !== null) window.clearTimeout(fecharRef.current);
    fecharRef.current = null;
  };

  useEffect(() => cancelarFechamento, []);

  const termo = consulta.trim();
  const buscavel = termo.length >= 2;

  useEffect(() => {
    if (!buscavel) return;
    const controle = new AbortController();
    const t = window.setTimeout(async () => {
      setCarregando(true);
      setErro(null);
      try {
        const res = await fetch(`/api/ativos/busca?q=${encodeURIComponent(termo)}&limite=20`, {
          cache: 'no-store',
          signal: controle.signal,
        });
        const data = (await res.json().catch(() => ({}))) as { items?: ItemSeletorAtivo[] };
        if (!res.ok) throw new Error();
        setItens(data.items ?? []);
        setAtivoIdx(-1);
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') {
          setItens([]);
          setErro('Não foi possível buscar agora.');
        }
      } finally {
        // Também quando abortada: se o texto encolheu para menos de 2 letras,
        // nenhuma busca nova vai desligar o indicador.
        setCarregando(false);
      }
    }, 250);
    return () => {
      controle.abort();
      window.clearTimeout(t);
    };
  }, [termo, buscavel]);

  function escolher(item: ItemSeletorAtivo) {
    onChange(item);
    setConsulta('');
    setItens([]);
    setAberto(false);
  }

  if (valor) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <PackageSearch className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            <span className="font-mono">{valor.codigo}</span>
            <span className="text-muted-foreground"> · {valor.categoriaNome}</span>
          </p>
          <p className="line-clamp-2 text-sm text-muted-foreground">{valor.descricao}</p>
          {valor.caminho && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" aria-hidden />
              {valor.caminho}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            onChange(null);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          disabled={disabled}
          aria-label={`Remover o equipamento ${valor.codigo}`}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    );
  }

  const mostrarLista = aberto && buscavel;

  return (
    <div className="relative">
      <div className="relative">
        <PackageSearch
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={inputId}
          ref={inputRef}
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-describedby={descricaoId}
          aria-activedescendant={ativoIdx >= 0 ? `${listaId}-${ativoIdx}` : undefined}
          autoComplete="off"
          disabled={disabled}
          value={consulta}
          placeholder="Tombamento ou parte da descrição"
          className="pl-9"
          onChange={(e) => {
            setConsulta(e.target.value);
            setAberto(true);
          }}
          onFocus={() => {
            cancelarFechamento();
            setAberto(true);
          }}
          onBlur={() => {
            cancelarFechamento();
            fecharRef.current = window.setTimeout(() => setAberto(false), 150);
          }}
          onKeyDown={(e) => {
            // Escape fecha a lista mesmo sem resultado ou ainda carregando.
            if (e.key === 'Escape') {
              setAberto(false);
              return;
            }
            if (!mostrarLista || itens.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setAtivoIdx((i) => (i + 1) % itens.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setAtivoIdx((i) => (i <= 0 ? itens.length - 1 : i - 1));
            } else if (e.key === 'Enter' && ativoIdx >= 0) {
              e.preventDefault();
              escolher(itens[ativoIdx]);
            }
          }}
        />
        {carregando && (
          <span role="status" className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
            <span className="sr-only">Buscando</span>
          </span>
        )}
      </div>
      {mostrarLista && (
        <ul
          id={listaId}
          role="listbox"
          aria-label="Equipamentos encontrados"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg"
        >
          {erro && <li className="px-3 py-2 text-sm text-destructive">{erro}</li>}
          {!erro && !carregando && itens.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Nenhum equipamento encontrado.
            </li>
          )}
          {itens.map((item, i) => (
            <li
              key={item.id}
              id={`${listaId}-${i}`}
              role="option"
              aria-selected={i === ativoIdx}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => escolher(item)}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-2 text-sm',
                i === ativoIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              <span className="font-mono font-medium">{item.codigo}</span>
              <span className="text-muted-foreground"> · {item.categoriaNome}</span>
              <span className="line-clamp-1 text-xs text-muted-foreground">{item.descricao}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
