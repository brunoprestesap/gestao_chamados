'use client';

import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_ITENS_COTACAO } from '@/shared/material/material.constants';
import { TEXTO_EDITOR as T } from '@/shared/material/mensagens';

import { daTabela, type ItemDoFormulario } from './formulario';
import { SecaoDoPasso } from './PassosMontagem';

export type CampoDoItem = 'descricao' | 'unidade' | 'quantidade' | 'motivo';

/**
 * Passo 1, os itens (AC-12): descrição, unidade, quantidade e para que serve.
 * Os itens do diagnóstico do técnico não mudam de descrição, unidade nem
 * quantidade, e a unidade do item classificado é a da tabela (spec 0019, AC-26).
 */
export function PassoItens({
  itens,
  onMudar,
  onTirar,
  onAcrescentar,
}: {
  itens: readonly ItemDoFormulario[];
  onMudar: (id: string, campo: CampoDoItem, valor: string) => void;
  onTirar: (id: string) => void;
  onAcrescentar: () => void;
}) {
  return (
    <SecaoDoPasso titulo={T.itensTitulo} ajuda={T.itensAjuda}>
      <div className="space-y-3 px-5 pb-5">
        {itens.map((i, n) => (
          <fieldset
            key={i.id}
            className="grid gap-3 rounded-xl border border-border/60 p-4 sm:grid-cols-[minmax(0,1fr)_6rem_7rem]"
          >
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              {T.item(n + 1)}
              {i.doDiagnostico ? ` · ${T.doDiagnostico}` : ''}
            </legend>
            <div className="min-w-0 space-y-1">
              <Label htmlFor={`d-${i.id}`} className="text-xs">
                {T.descricao}
              </Label>
              <Input
                id={`d-${i.id}`}
                value={i.descricao}
                readOnly={i.doDiagnostico}
                onChange={(e) => onMudar(i.id, 'descricao', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`u-${i.id}`} className="text-xs">
                {T.unidade}
              </Label>
              <Input
                id={`u-${i.id}`}
                value={i.unidade}
                readOnly={i.doDiagnostico || daTabela(i)}
                onChange={(e) => onMudar(i.id, 'unidade', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`q-${i.id}`} className="text-xs">
                {T.quantidade}
              </Label>
              <Input
                id={`q-${i.id}`}
                inputMode="decimal"
                value={i.quantidade}
                readOnly={i.doDiagnostico}
                onChange={(e) => onMudar(i.id, 'quantidade', e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-3">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor={`m-${i.id}`} className="text-xs">
                  {T.paraQueServe}
                </Label>
                <Input
                  id={`m-${i.id}`}
                  value={i.motivo}
                  onChange={(e) => onMudar(i.id, 'motivo', e.target.value)}
                />
              </div>
              {!i.doDiagnostico && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={T.tirarItem(n + 1)}
                  onClick={() => onTirar(i.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </div>
          </fieldset>
        ))}
        {itens.length < MAX_ITENS_COTACAO && (
          <Button type="button" variant="outline" className="gap-2" onClick={onAcrescentar}>
            <Plus aria-hidden="true" />
            {T.acrescentarItem}
          </Button>
        )}
      </div>
    </SecaoDoPasso>
  );
}
