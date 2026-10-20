'use client';

import { Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ParametrosComHistorico } from '@/lib/material/parametros';
import { formatarDataHoraBelem } from '@/shared/contratos/formato';
import {
  type CampoParametro,
  CAMPOS_PARAMETROS,
  LIMITES_PARAMETROS,
} from '@/shared/material/material.constants';
import { ROTULO_PARAMETRO } from '@/shared/material/mensagens';

import { salvarParametrosAction } from '../actions';

type Valores = Record<CampoParametro, string>;

const AJUDA: Record<CampoParametro, string> = {
  percentualSinapi: `Quanto o preço pode passar da referência (SINAPI ou outra) antes de travar ou avisar. De ${LIMITES_PARAMETROS.percentualSinapi.min} a ${LIMITES_PARAMETROS.percentualSinapi.max}. Mudar refaz a marca automática de anomalia do Anexo V.`,
  janelaDias: `Quantos dias para trás contam no fracionamento e na reincidência. De ${LIMITES_PARAMETROS.janelaDias.min} a ${LIMITES_PARAMETROS.janelaDias.max}.`,
  parcelaRelevantePercentual: `A partir de que parte do saldo do empenho o aprovador vê a projeção de esgotamento. De ${LIMITES_PARAMETROS.parcelaRelevantePercentual.min} a ${LIMITES_PARAMETROS.parcelaRelevantePercentual.max}.`,
  raizCnpjContratada:
    'Os 8 primeiros dígitos do CNPJ da contratada: orçamento com essa raiz é recusado.',
};

function paraTexto(p: ParametrosComHistorico): Valores {
  return {
    percentualSinapi: String(p.percentualSinapi),
    janelaDias: String(p.janelaDias),
    parcelaRelevantePercentual: String(p.parcelaRelevantePercentual),
    raizCnpjContratada: p.raizCnpjContratada,
  };
}

/** Os parâmetros do fluxo de material (spec 0019, AC-42), com o histórico de cada mudança. */
export function AbaParametros({ parametros }: { parametros: ParametrosComHistorico }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [valores, setValores] = useState<Valores>(() => paraTexto(parametros));

  const lidos = {
    percentualSinapi: parametros.percentualSinapi,
    janelaDias: parametros.janelaDias,
    parcelaRelevantePercentual: parametros.parcelaRelevantePercentual,
    raizCnpjContratada: parametros.raizCnpjContratada,
  };

  function salvar() {
    const novos = {
      percentualSinapi: Number(valores.percentualSinapi),
      janelaDias: Number(valores.janelaDias),
      parcelaRelevantePercentual: Number(valores.parcelaRelevantePercentual),
      raizCnpjContratada: valores.raizCnpjContratada.trim(),
    };
    iniciar(async () => {
      const r = await salvarParametrosAction({ lidos, novos });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.aviso) toast.warning(r.aviso);
      else toast.success('Parâmetros gravados.');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form
        className="grid gap-4 rounded-2xl border border-border/50 p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        {CAMPOS_PARAMETROS.map((campo) => (
          <div key={campo} className="space-y-1.5">
            <Label htmlFor={`param-${campo}`}>{ROTULO_PARAMETRO[campo]}</Label>
            <Input
              id={`param-${campo}`}
              inputMode="numeric"
              value={valores[campo]}
              onChange={(e) => setValores({ ...valores, [campo]: e.target.value })}
              aria-describedby={`param-${campo}-ajuda`}
            />
            <p id={`param-${campo}-ajuda`} className="text-xs text-muted-foreground">
              {AJUDA[campo]}
            </p>
          </div>
        ))}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pendente} className="gap-2">
            {pendente ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            Gravar parâmetros
          </Button>
        </div>
      </form>
      <p className="text-xs text-muted-foreground">
        Cada ato da cotação guarda na trilha os valores vigentes naquele momento: mudar aqui não
        muda o que já foi registrado.
      </p>

      <section aria-labelledby="historico-parametros" className="space-y-2">
        <h3 id="historico-parametros" className="text-sm font-semibold">
          Histórico
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-border/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Parâmetro</TableHead>
                <TableHead>De</TableHead>
                <TableHead>Para</TableHead>
                <TableHead>Por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parametros.historico.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Nenhuma mudança registrada: valem os padrões.
                  </TableCell>
                </TableRow>
              )}
              {parametros.historico.map((h, n) => (
                <TableRow key={`${h.em}-${h.campo}-${n}`}>
                  <TableCell className="whitespace-nowrap">{formatarDataHoraBelem(h.em)}</TableCell>
                  <TableCell>{ROTULO_PARAMETRO[h.campo] ?? h.campo}</TableCell>
                  <TableCell className="tabular-nums">{h.de ?? '—'}</TableCell>
                  <TableCell className="tabular-nums">{h.para ?? '—'}</TableCell>
                  <TableCell>{h.porNome ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
