'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatarMes } from '@/shared/contratos/janela';

export type OpcaoContrato = {
  id: string;
  rotulo: string;
  /** Meses permitidos (AC-5), do mais recente para o mais antigo. */
  meses: string[];
};

const CLASSE_SELECT =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

/**
 * Contrato e mês do relatório (spec 0016, AC-5): formulário GET como o do
 * IMR. Os meses mudam com o contrato escolhido, sem ida ao servidor.
 */
export function SeletorContratoMes({
  opcoes,
  contratoId,
  mes,
}: {
  opcoes: OpcaoContrato[];
  contratoId?: string;
  mes?: string;
}) {
  const inicial = opcoes.find((o) => o.id === contratoId) ?? opcoes[0];
  const [escolhido, setEscolhido] = useState(inicial?.id ?? '');
  const meses = opcoes.find((o) => o.id === escolhido)?.meses ?? [];
  const mesInicial = escolhido === contratoId && mes && meses.includes(mes) ? mes : meses[0];

  return (
    <form method="GET" action="/relatorios/contrato" className="flex flex-wrap items-end gap-4">
      <div className="w-full space-y-2 sm:w-[22rem]">
        <Label htmlFor="contratoId" className="text-xs">
          Contrato
        </Label>
        <select
          id="contratoId"
          name="contratoId"
          value={escolhido}
          onChange={(e) => setEscolhido(e.target.value)}
          className={CLASSE_SELECT}
        >
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </div>
      <div className="w-full space-y-2 sm:w-40">
        <Label htmlFor="mes" className="text-xs">
          Mês
        </Label>
        <select
          key={escolhido}
          id="mes"
          name="mes"
          defaultValue={mesInicial}
          disabled={meses.length === 0}
          className={CLASSE_SELECT}
          aria-describedby={meses.length === 0 ? 'mes-vazio' : undefined}
        >
          {meses.map((m) => (
            <option key={m} value={m}>
              {formatarMes(m)}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={meses.length === 0}>
        Ver relatório
      </Button>
      {meses.length === 0 ? (
        <p id="mes-vazio" className="w-full text-sm text-muted-foreground">
          Este contrato ainda não tem meses para relatar.
        </p>
      ) : null}
    </form>
  );
}
