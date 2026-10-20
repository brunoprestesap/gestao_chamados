'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ItemDTO } from '@/lib/material/serializar';
import { formatarReais } from '@/shared/chamados/custo';
import {
  type BaseDeAmbas,
  TEXTO_CURTO_MAX,
  TEXTO_CURTO_MIN,
} from '@/shared/material/material.constants';
import { textoMarcaAnomalia } from '@/shared/material/mensagens';

export type EscolhasEncaminhar = {
  bases: { itemId: string; base: BaseDeAmbas; justificativa: string }[];
  conferencias: { itemId: string; texto: string }[];
};

/**
 * O fiscal encaminha escolhendo a base de cada item que está no Anexo V e no
 * SINAPI, com justificativa (AC-27), e registrando a conferência de cada item
 * da lista de conferência obrigatória (AC-29). O servidor confere de novo.
 */
export function DialogEncaminhar({
  numero,
  ambas,
  naLista,
  open,
  onOpenChange,
  pendente,
  onConfirmar,
}: {
  numero: string;
  ambas: ItemDTO[];
  naLista: ItemDTO[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pendente: boolean;
  onConfirmar: (escolhas: EscolhasEncaminhar) => void;
}) {
  const [bases, setBases] = useState<Record<string, { base: BaseDeAmbas | ''; texto: string }>>({});
  const [conferencias, setConferencias] = useState<Record<string, string>>({});

  const curto = (t: string) => t.trim().length < TEXTO_CURTO_MIN;
  const incompleto =
    ambas.some((i) => !bases[i.id]?.base || curto(bases[i.id]?.texto ?? '')) ||
    naLista.some((i) => curto(conferencias[i.id] ?? ''));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Encaminhar {numero} para aprovação</DialogTitle>
          <DialogDescription>
            A escolha de cada base e as conferências vão para a trilha. Justificativas e
            conferências têm de {TEXTO_CURTO_MIN} a {TEXTO_CURTO_MAX} caracteres.
          </DialogDescription>
        </DialogHeader>

        {ambas.length > 0 && (
          <section aria-labelledby="enc-bases" className="space-y-3">
            <h3 id="enc-bases" className="text-sm font-semibold">
              Base de preço dos itens que estão nas duas tabelas
            </h3>
            {ambas.map((i) => {
              const atual = bases[i.id] ?? { base: '', texto: '' };
              const mudar = (m: Partial<typeof atual>) =>
                setBases((b) => ({ ...b, [i.id]: { ...atual, ...m } }));
              return (
                <fieldset key={i.id} className="space-y-2 rounded-xl border border-border/60 p-3">
                  <legend className="px-1 text-sm font-medium">{i.descricao}</legend>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`base-${i.id}`}
                        checked={atual.base === 'anexo_v'}
                        onChange={() => mudar({ base: 'anexo_v' })}
                      />
                      Anexo V, item {i.anexoVNumero}:{' '}
                      {i.anexoVPrecoCentavos != null ? formatarReais(i.anexoVPrecoCentavos) : '—'}
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`base-${i.id}`}
                        checked={atual.base === 'sinapi'}
                        onChange={() => mudar({ base: 'sinapi' })}
                      />
                      SINAPI {i.sinapiCodigo}:{' '}
                      {i.sinapiPrecoCentavos != null ? formatarReais(i.sinapiPrecoCentavos) : '—'}
                    </label>
                  </div>
                  <Label htmlFor={`just-${i.id}`} className="text-xs">
                    Justificativa
                  </Label>
                  <Textarea
                    id={`just-${i.id}`}
                    value={atual.texto}
                    maxLength={TEXTO_CURTO_MAX}
                    onChange={(e) => mudar({ texto: e.target.value })}
                  />
                </fieldset>
              );
            })}
          </section>
        )}

        {naLista.length > 0 && (
          <section aria-labelledby="enc-conf" className="space-y-3">
            <h3 id="enc-conf" className="text-sm font-semibold">
              Conferência obrigatória
            </h3>
            {naLista.map((i) => (
              <div key={i.id} className="space-y-1">
                <Label htmlFor={`conf-${i.id}`} className="text-sm">
                  {i.descricao} (Anexo V, item {i.anexoVNumero}
                  {i.marcaAnomalia ? `: ${textoMarcaAnomalia(i.marcaAnomalia)}` : ''})
                </Label>
                <Textarea
                  id={`conf-${i.id}`}
                  value={conferencias[i.id] ?? ''}
                  maxLength={TEXTO_CURTO_MAX}
                  placeholder="O que foi conferido e o resultado"
                  onChange={(e) => setConferencias((c) => ({ ...c, [i.id]: e.target.value }))}
                />
              </div>
            ))}
          </section>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pendente}>
            Voltar
          </Button>
          <Button
            disabled={pendente || incompleto}
            onClick={() =>
              onConfirmar({
                bases: ambas.map((i) => ({
                  itemId: i.id,
                  base: bases[i.id]!.base as BaseDeAmbas,
                  justificativa: bases[i.id]!.texto,
                })),
                conferencias: naLista.map((i) => ({ itemId: i.id, texto: conferencias[i.id]! })),
              })
            }
          >
            Encaminhar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
