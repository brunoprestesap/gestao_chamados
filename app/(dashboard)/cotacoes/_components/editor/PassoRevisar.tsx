'use client';

import type { ReactNode } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { UrgenciaDTO } from '@/lib/material/serializar';
import { formatarReais } from '@/shared/chamados/custo';
import {
  MIN_ORCAMENTOS_POR_ITEM,
  TEXTO_CURTO_MAX,
  TEXTO_CURTO_MIN,
} from '@/shared/material/material.constants';
import { ROTULO_PASSO_MONTAGEM, TEXTO_EDITOR as T } from '@/shared/material/mensagens';
import { valorDaLinhaCentavos } from '@/shared/material/valores';

import { numeroBr, SeloUrgencia } from '../apoio';
import { CaixaRolavel } from '../detalhe/CaixaRolavel';
import { daTabela, type EstadoDoFormulario, precoDoItem } from './formulario';
import { SecaoDoPasso } from './PassosMontagem';

/**
 * Passo 4, revisar e enviar (AC-12, AC-15): o resumo dos itens com o preço de
 * cada um, a urgência (pedida uma vez, nunca depois de recusada, spec 0019,
 * AC-35) e a lista "Pronta para enviar?", que chega pronta em `lista`.
 */
export function PassoRevisar({
  estado,
  urgencia,
  pedirUrgencia,
  justificativa,
  onPedirUrgencia,
  onJustificativa,
  lista,
}: {
  estado: EstadoDoFormulario;
  urgencia: UrgenciaDTO | null;
  pedirUrgencia: boolean;
  justificativa: string;
  onPedirUrgencia: (v: boolean) => void;
  onJustificativa: (v: string) => void;
  lista: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <SecaoDoPasso titulo={ROTULO_PASSO_MONTAGEM.revisar} ajuda={T.revisarAjuda}>
        <CaixaRolavel rotulo={T.resumoItens}>
          <Table className="min-w-[32rem]">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{T.colunaItem}</TableHead>
                <TableHead scope="col" className="text-right">
                  {T.quantidade}
                </TableHead>
                <TableHead scope="col">{T.origemDoPreco}</TableHead>
                <TableHead scope="col" className="text-right">
                  {T.unitario}
                </TableHead>
                <TableHead scope="col" className="text-right">
                  {T.valorDaLinha}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estado.itens.map((i) => {
                const preco = precoDoItem(estado, i);
                const qtd = numeroBr(i.quantidade);
                return (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-normal font-medium">
                      {i.descricao || T.semDescricao}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i.quantidade || '—'} {i.unidade}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {daTabela(i)
                        ? i.origem === 'sinapi'
                          ? `SINAPI ${i.sinapiCodigo}`
                          : `Anexo V, item ${i.anexoVNumero}`
                        : T.tresOrcamentos}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {preco != null ? formatarReais(preco) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {preco != null && Number.isFinite(qtd)
                        ? formatarReais(valorDaLinhaCentavos(qtd, preco))
                        : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CaixaRolavel>
      </SecaoDoPasso>

      <SecaoDoPasso titulo={T.urgencia}>
        <div className="space-y-3 px-5 pb-5 text-sm">
          {urgencia?.pedida ? (
            <>
              <p className="flex flex-wrap items-center gap-2">
                <SeloUrgencia />
                {urgencia.justificativa && (
                  <span>
                    {T.justificativaPedida}: {urgencia.justificativa}
                  </span>
                )}
              </p>
              <p
                className={
                  urgencia.decisao === 'recusada'
                    ? 'text-amber-900 dark:text-amber-200'
                    : 'text-muted-foreground'
                }
              >
                {urgencia.decisao === 'recusada'
                  ? T.urgenciaRecusada(urgencia.motivoRecusa ?? null, MIN_ORCAMENTOS_POR_ITEM)
                  : T.urgenciaVale(MIN_ORCAMENTOS_POR_ITEM)}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="pedir-urgencia"
                  checked={pedirUrgencia}
                  onCheckedChange={(v) => onPedirUrgencia(v === true)}
                  aria-describedby="pedir-urgencia-ajuda"
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <Label htmlFor="pedir-urgencia" className="font-semibold">
                    {T.pedirUrgencia}
                  </Label>
                  <p id="pedir-urgencia-ajuda" className="text-muted-foreground">
                    {T.pedirUrgenciaAjuda(MIN_ORCAMENTOS_POR_ITEM)}
                  </p>
                </div>
              </div>
              {pedirUrgencia && (
                <div className="space-y-1">
                  <Label htmlFor="urg-just" className="text-xs">
                    {T.justificativaUrgencia(TEXTO_CURTO_MIN, TEXTO_CURTO_MAX)}
                  </Label>
                  <Textarea
                    id="urg-just"
                    value={justificativa}
                    maxLength={TEXTO_CURTO_MAX}
                    onChange={(e) => onJustificativa(e.target.value)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </SecaoDoPasso>

      {lista}
    </div>
  );
}
