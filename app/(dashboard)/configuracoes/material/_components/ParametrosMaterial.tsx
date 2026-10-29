'use client';

import { Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { CaixaRolavel } from '@/app/(dashboard)/cotacoes/_components/detalhe/CaixaRolavel';
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
import { cn } from '@/lib/utils';
import { formatarDataHoraBelem } from '@/shared/contratos/formato';
import {
  type CampoParametro,
  CAMPOS_PARAMETROS,
  LIMITES_PARAMETROS,
  TAXA_ADMINISTRACAO_MATERIAL,
} from '@/shared/material/material.constants';
import {
  ROTULO_PARAMETRO,
  ROTULO_SECAO_CADASTRO,
  TEXTO_PARAMETROS as T,
  UNIDADE_PARAMETRO,
} from '@/shared/material/mensagens';

import { salvarParametrosAction } from '../actions';
import { CabecalhoSecao, CARTAO_CADASTRO } from './CabecalhoSecao';

type Valores = Record<CampoParametro, string>;

function ajuda(campo: CampoParametro): string {
  const limites = (LIMITES_PARAMETROS as Partial<Record<string, { min: number; max: number }>>)[
    campo
  ];
  return T.ajuda[campo](limites?.min ?? 0, limites?.max ?? 0);
}

function paraTexto(p: ParametrosComHistorico): Valores {
  return {
    percentualSinapi: String(p.percentualSinapi),
    janelaDias: String(p.janelaDias),
    parcelaRelevantePercentual: String(p.parcelaRelevantePercentual),
    prazoFornecimentoDiasUteis: String(p.prazoFornecimentoDiasUteis),
    raizCnpjContratada: p.raizCnpjContratada,
  };
}

/** O valor do histórico com a unidade do campo, quando houver. */
function comUnidade(campo: string, v: string | number | null): string {
  if (v == null || v === '') return '—';
  const unidade = (UNIDADE_PARAMETRO as Record<string, string | null>)[campo];
  return unidade ? `${v} ${unidade}` : String(v);
}

/** O campo com a unidade escrita ao lado, dentro da mesma caixa (spec 0021, AC-22). */
function CaixaComUnidade({
  unidade,
  children,
}: {
  unidade: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-input shadow-xs focus-within:ring-2 focus-within:ring-ring">
      {children}
      {unidade && (
        <span
          aria-hidden="true"
          className="flex items-center border-l border-input bg-muted px-3 text-sm text-muted-foreground"
        >
          {unidade}
        </span>
      )}
    </div>
  );
}

const INPUT_NA_CAIXA =
  'h-10 flex-1 rounded-none border-0 shadow-none tabular-nums focus-visible:ring-0';

/** Os parâmetros do fluxo de material (spec 0019, AC-42), com o histórico de cada mudança. */
export function AbaParametros({ parametros }: { parametros: ParametrosComHistorico }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [valores, setValores] = useState<Valores>(() => paraTexto(parametros));

  const lidos = {
    percentualSinapi: parametros.percentualSinapi,
    janelaDias: parametros.janelaDias,
    parcelaRelevantePercentual: parametros.parcelaRelevantePercentual,
    prazoFornecimentoDiasUteis: parametros.prazoFornecimentoDiasUteis,
    raizCnpjContratada: parametros.raizCnpjContratada,
  };

  function salvar() {
    const novos = {
      percentualSinapi: Number(valores.percentualSinapi),
      janelaDias: Number(valores.janelaDias),
      parcelaRelevantePercentual: Number(valores.parcelaRelevantePercentual),
      prazoFornecimentoDiasUteis: Number(valores.prazoFornecimentoDiasUteis),
      raizCnpjContratada: valores.raizCnpjContratada.trim(),
    };
    iniciar(async () => {
      const r = await salvarParametrosAction({ lidos, novos });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.aviso) toast.warning(r.aviso);
      else toast.success(T.gravados);
      router.refresh();
    });
  }

  return (
    <section aria-label={ROTULO_SECAO_CADASTRO.parametros} className="space-y-4">
      <CabecalhoSecao titulo={ROTULO_SECAO_CADASTRO.parametros} descricao={T.noAto} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        <div className={cn(CARTAO_CADASTRO, 'grid gap-5 p-4 sm:grid-cols-2 sm:p-5')}>
          {CAMPOS_PARAMETROS.map((campo) => {
            const unidade = UNIDADE_PARAMETRO[campo];
            return (
              <div key={campo} className="space-y-1.5">
                <Label htmlFor={`param-${campo}`}>{ROTULO_PARAMETRO[campo]}</Label>
                <CaixaComUnidade unidade={unidade}>
                  <Input
                    id={`param-${campo}`}
                    inputMode="numeric"
                    value={valores[campo]}
                    onChange={(e) => setValores({ ...valores, [campo]: e.target.value })}
                    aria-describedby={`param-${campo}-ajuda`}
                    className={cn(INPUT_NA_CAIXA, campo === 'raizCnpjContratada' && 'font-mono')}
                  />
                </CaixaComUnidade>
                <p id={`param-${campo}-ajuda`} className="text-xs text-muted-foreground">
                  {unidade && <span className="sr-only">Em {unidade}. </span>}
                  {ajuda(campo)}
                </p>
              </div>
            );
          })}
          <div className="space-y-1.5">
            <Label htmlFor="param-taxa">{T.taxa}</Label>
            <CaixaComUnidade unidade="%">
              <Input
                id="param-taxa"
                value={String(TAXA_ADMINISTRACAO_MATERIAL)}
                disabled
                readOnly
                aria-describedby="param-taxa-ajuda"
                className={cn(INPUT_NA_CAIXA, 'bg-muted/50')}
              />
            </CaixaComUnidade>
            <p id="param-taxa-ajuda" className="text-xs text-muted-foreground">
              <span className="sr-only">Em %. </span>
              {T.taxaAjuda}
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="gradiente" disabled={pendente} className="gap-2">
            {pendente ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {T.gravar}
          </Button>
        </div>
      </form>

      <details className={cn(CARTAO_CADASTRO, 'overflow-hidden')}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium sm:px-5">
          {T.historico(parametros.historico.length)}
        </summary>
        {parametros.historico.length === 0 ? (
          <p className="border-t border-border/50 px-4 py-4 text-sm text-muted-foreground sm:px-5">
            {T.semHistorico}
          </p>
        ) : (
          <div className="border-t border-border/50">
            <CaixaRolavel rotulo={T.historico(parametros.historico.length)}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-5">Quando</TableHead>
                    <TableHead>Parâmetro</TableHead>
                    <TableHead>De</TableHead>
                    <TableHead>Para</TableHead>
                    <TableHead>Por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parametros.historico.map((h, n) => (
                    <TableRow key={`${h.em}-${h.campo}-${n}`}>
                      <TableCell className="whitespace-nowrap pl-4 sm:pl-5">
                        {formatarDataHoraBelem(h.em)}
                      </TableCell>
                      <TableCell>
                        {(ROTULO_PARAMETRO as Record<string, string>)[h.campo] ?? h.campo}
                      </TableCell>
                      <TableCell className="tabular-nums">{comUnidade(h.campo, h.de)}</TableCell>
                      <TableCell className="tabular-nums">{comUnidade(h.campo, h.para)}</TableCell>
                      <TableCell>{h.porNome ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CaixaRolavel>
          </div>
        )}
      </details>
    </section>
  );
}
