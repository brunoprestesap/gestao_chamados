'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ItemDTO } from '@/lib/material/serializar';
import { formatarQuantidade } from '@/shared/chamados/custo';
import { MAX_ITENS_COTACAO } from '@/shared/material/material.constants';
import { TEXTO_DIALOGO_MATERIAL as T } from '@/shared/material/mensagens';

import { criarCotacaoAction, salvarRascunhoAction } from '../actions';
import { novoId, numeroBr } from './apoio';

type Linha = { id: string; descricao: string; unidade: string; quantidade: string; motivo: string };

const linhaVazia = (): Linha => ({
  id: novoId(),
  descricao: '',
  unidade: 'un',
  quantidade: '',
  motivo: '',
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSalvo: () => void;
} & (
  | { modo: 'criar'; chamadoId: string }
  | { modo: 'editar'; cotacaoId: string; versao: number; itens: ItemDTO[] }
);

/**
 * O técnico registra o material do diagnóstico (spec 0019, AC-1): cria o
 * rascunho, ou edita os itens enquanto nenhum responsável técnico salvou.
 * Visual da spec 0021 (fatia 6): um cartão por item, textos em `mensagens.ts`.
 */
export function DialogMaterial(props: Props) {
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    props.modo === 'editar'
      ? props.itens.map((i) => ({
          id: i.id,
          descricao: i.descricao,
          unidade: i.unidade,
          quantidade: formatarQuantidade(i.quantidade),
          motivo: i.motivo,
        }))
      : [linhaVazia()],
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function mudar(id: string, campo: keyof Linha, valor: string) {
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }

  function salvar() {
    setErro(null);
    const itens = linhas.map((l) => ({
      id: l.id,
      descricao: l.descricao,
      unidade: l.unidade,
      quantidade: numeroBr(l.quantidade),
      motivo: l.motivo,
    }));
    iniciar(async () => {
      const r =
        props.modo === 'criar'
          ? await criarCotacaoAction({
              chamadoId: props.chamadoId,
              // Item novo ainda não tem id no servidor: vai sem o id da tela.
              itens: itens.map((i) => ({
                descricao: i.descricao,
                unidade: i.unidade,
                quantidade: i.quantidade,
                motivo: i.motivo,
              })),
            })
          : await salvarRascunhoAction({ id: props.cotacaoId, versao: props.versao, itens });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success(props.modo === 'criar' ? T.registrado : T.atualizado);
      props.onOpenChange(false);
      props.onSalvo();
    });
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => !pendente && props.onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>{props.modo === 'criar' ? T.tituloCriar : T.tituloEditar}</DialogTitle>
          <DialogDescription>{T.descricao}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {linhas.map((l, n) => (
            <fieldset
              key={l.id}
              className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-3.5 sm:grid-cols-[1fr_5.5rem_6.5rem]"
            >
              <legend className="rounded-md bg-card px-1.5 text-xs font-semibold text-foreground">
                {T.item(n + 1)}
              </legend>
              <div className="space-y-1">
                <Label htmlFor={`desc-${l.id}`} className="text-xs">
                  {T.descricaoItem}
                </Label>
                <Input
                  id={`desc-${l.id}`}
                  value={l.descricao}
                  onChange={(e) => mudar(l.id, 'descricao', e.target.value)}
                  placeholder={T.descricaoExemplo}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`un-${l.id}`} className="text-xs">
                  {T.unidade}
                </Label>
                <Input
                  id={`un-${l.id}`}
                  value={l.unidade}
                  onChange={(e) => mudar(l.id, 'unidade', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`qtd-${l.id}`} className="text-xs">
                  {T.quantidade}
                </Label>
                <Input
                  id={`qtd-${l.id}`}
                  inputMode="decimal"
                  value={l.quantidade}
                  onChange={(e) => mudar(l.id, 'quantidade', e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2 sm:col-span-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`mot-${l.id}`} className="text-xs">
                    {T.paraQueServe}
                  </Label>
                  <Input
                    id={`mot-${l.id}`}
                    value={l.motivo}
                    onChange={(e) => mudar(l.id, 'motivo', e.target.value)}
                    placeholder={T.paraQueServeExemplo}
                  />
                </div>
                {linhas.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    aria-label={T.tirarItem(n + 1)}
                    onClick={() => setLinhas((ls) => ls.filter((x) => x.id !== l.id))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </fieldset>
          ))}
          {linhas.length < MAX_ITENS_COTACAO ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full gap-2 border-dashed"
              onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {T.acrescentarItem}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">{T.limiteItens(MAX_ITENS_COTACAO)}</p>
          )}
        </div>

        {erro && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {erro}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => props.onOpenChange(false)}
            disabled={pendente}
          >
            {T.cancelar}
          </Button>
          <Button variant="gradiente" className="min-h-11" onClick={salvar} disabled={pendente}>
            {pendente && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {props.modo === 'criar' ? T.registrar : T.salvar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
