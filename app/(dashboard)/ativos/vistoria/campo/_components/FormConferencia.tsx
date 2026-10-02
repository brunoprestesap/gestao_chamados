'use client';

import { Check, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CAMPOS_TECNICOS, type CampoTecnico } from '@/shared/vistoria/vistoria.constants';
import type { AtivoDoPacote, LocalDoPacote } from '@/shared/vistoria/vistoria.schemas';

import { SeloAusenteSicam } from './SeloAusenteSicam';

export type ValoresTecnicos = Record<CampoTecnico, string>;

const ROTULOS: Record<CampoTecnico, string> = {
  fabricante: 'Fabricante',
  modelo: 'Modelo',
  numeroSerie: 'Número de série',
};

/**
 * Formulário de conferência (spec 0012, AC-4): fabricante, modelo e série
 * atuais já preenchidos. Quem chama decide o que mudou; aqui só se edita.
 */
export function FormConferencia({
  ativo,
  local,
  avisoConferido,
  onCancelar,
  onConfirmar,
}: {
  ativo: AtivoDoPacote;
  local: LocalDoPacote;
  avisoConferido: string | null;
  onCancelar: () => void;
  onConfirmar: (valores: ValoresTecnicos) => Promise<void>;
}) {
  const [valores, setValores] = useState<ValoresTecnicos>({
    fabricante: ativo.fabricante ?? '',
    modelo: ativo.modelo ?? '',
    numeroSerie: ativo.numeroSerie ?? '',
  });
  const [enviando, setEnviando] = useState(false);

  return (
    <section
      aria-labelledby="titulo-conferencia"
      className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-5 shadow-lg shadow-indigo-500/5 sm:p-6"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-indigo-500 via-blue-500 to-sky-400"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm text-muted-foreground">{ativo.codigo}</p>
          <h2 id="titulo-conferencia" className="mt-0.5 text-lg font-semibold leading-snug">
            {ativo.descricao}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Local: {local.caminho}</p>
          {ativo.ausenteNoSicam && <SeloAusenteSicam className="mt-2" />}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar sem conferir"
          onClick={onCancelar}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {avisoConferido && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
          {avisoConferido} nesta campanha. Se você confirmar, a primeira conferência continua
          valendo.
        </p>
      )}

      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setEnviando(true);
          try {
            await onConfirmar(valores);
          } finally {
            setEnviando(false);
          }
        }}
      >
        {CAMPOS_TECNICOS.map((campo) => (
          <div key={campo} className="space-y-1.5">
            <Label htmlFor={`campo-${campo}`}>{ROTULOS[campo]}</Label>
            <Input
              id={`campo-${campo}`}
              value={valores[campo]}
              onChange={(e) => setValores((v) => ({ ...v, [campo]: e.target.value }))}
              maxLength={120}
              autoComplete="off"
              className="h-11 rounded-xl"
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Deixar um campo em branco mantém o valor que está no Sigma.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={enviando}
            className="h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
          >
            <Check className="h-4 w-4" aria-hidden />
            Confirmar conferência
          </Button>
        </div>
      </form>
    </section>
  );
}
