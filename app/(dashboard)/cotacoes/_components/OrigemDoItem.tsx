'use client';

import { AlertTriangle, ClipboardCheck } from 'lucide-react';

import type { ItemDTO } from '@/lib/material/serializar';
import { formatarReais } from '@/shared/chamados/custo';
import {
  CONTROLES,
  ROTULO_BASE,
  ROTULO_ORIGEM,
  textoMarcaAnomalia,
} from '@/shared/material/mensagens';

const mesBr = (ref: string | null | undefined) => (ref ? ref.split('-').reverse().join('/') : '');

/**
 * A origem do preço de um item (spec 0019, fatia 3). O lado TRF1 vê as duas
 * bases lado a lado, a base escolhida com a justificativa, as advertências do
 * item e a marca de conferência obrigatória (AC-27 a AC-29); a contratada vê
 * só a origem e a referência na tabela (AC-15).
 */
export function OrigemDoItem({ item: i, trf1 }: { item: ItemDTO; trf1: boolean }) {
  const origem = i.origem ?? 'orcamento';
  const marca = i.marcaAnomalia ? textoMarcaAnomalia(i.marcaAnomalia) : null;
  return (
    <div className="space-y-1">
      <p className="font-medium">{ROTULO_ORIGEM[origem] ?? origem}</p>
      {i.anexoVNumero != null && (
        <p className="text-xs text-muted-foreground">
          Anexo V, item {i.anexoVNumero}
          {trf1 && i.anexoVPrecoCentavos != null && `: ${formatarReais(i.anexoVPrecoCentavos)}`}
        </p>
      )}
      {i.sinapiCodigo && (
        <p className="text-xs text-muted-foreground">
          SINAPI {i.sinapiCodigo} ({mesBr(i.sinapiReferencia)})
          {trf1 && i.sinapiPrecoCentavos != null && `: ${formatarReais(i.sinapiPrecoCentavos)}`}
        </p>
      )}
      {trf1 && origem === 'ambas' && (
        <p className="text-xs">
          {i.baseAplicada
            ? `Base escolhida: ${ROTULO_BASE[i.baseAplicada] ?? i.baseAplicada}. ${i.justificativaBase ?? ''}`
            : 'Base ainda não escolhida pelo fiscal.'}
        </p>
      )}
      {trf1 &&
        (i.advertencias ?? []).map((a) => (
          <p key={a} className="flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {CONTROLES[a]?.texto ?? a}
          </p>
        ))}
      {trf1 && marca && (
        <p className="flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200">
          <ClipboardCheck className="h-3 w-3" aria-hidden="true" />
          Conferência obrigatória ({marca})
        </p>
      )}
      {trf1 && i.conferencia && (
        <p className="text-xs">
          Conferido{i.conferencia.porNome ? ` por ${i.conferencia.porNome}` : ''}:{' '}
          {i.conferencia.texto}
        </p>
      )}
    </div>
  );
}
