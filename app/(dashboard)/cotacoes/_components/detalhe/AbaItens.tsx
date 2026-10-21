'use client';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CotacaoDTO } from '@/lib/material/serializar';
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import { TEXTO_DETALHE as T } from '@/shared/material/mensagens';
import { precoParaValor, valorDaLinhaCentavos } from '@/shared/material/valores';

import { OrigemDoItem } from '../OrigemDoItem';
import { ListaReferencias } from '../ReferenciasPreco';
import { CaixaRolavel } from './CaixaRolavel';

/**
 * A aba Itens e preços do detalhe (spec 0021, AC-7): origem e referência por
 * item, quantidade, unitário, valor e, depois da execução, o aplicado.
 */
export function AbaItens({
  cotacao: c,
  desabilitado,
  onRetirarReferencia,
  onAcrescentarReferencia,
}: {
  cotacao: CotacaoDTO;
  desabilitado: boolean;
  /** Só o fiscal que assumiu (`acoes.referenciasDoFiscal`). */
  onRetirarReferencia?: (itemId: string, referenciaId: string) => void;
  onAcrescentarReferencia?: (itemId: string) => void;
}) {
  const trf1 = c.visao === 'trf1';
  const mostraOrigem = trf1 || c.visao === 'contratada';
  const colunas = 4 + (mostraOrigem ? 1 : 0);

  return (
    <CaixaRolavel rotulo={T.tabelaItens}>
      <Table className="min-w-[520px]">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">{T.colunaItem}</TableHead>
            {mostraOrigem && <TableHead>{T.colunaOrigem}</TableHead>}
            <TableHead className="text-right">{T.colunaQuantidade}</TableHead>
            <TableHead className="text-right">{T.colunaUnitario}</TableHead>
            <TableHead className="text-right">{T.colunaValor}</TableHead>
            {c.executadoEm && <TableHead className="pr-5 text-right">{T.colunaAplicado}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(c.itens ?? []).map((i) => {
            const preco = precoParaValor({
              quantidade: i.quantidade,
              precoAplicadoCentavos: i.precoAplicadoCentavos,
              origem: i.origem,
              anexoVPrecoCentavos: i.anexoVPrecoCentavos,
              sinapiPrecoCentavos: i.sinapiPrecoCentavos,
            });
            return (
              <TableRow key={i.id} className="align-top">
                <TableCell className="max-w-[300px] pl-5 whitespace-normal">
                  <p className="font-medium">{i.descricao}</p>
                  <p className="text-xs text-muted-foreground">{i.motivo}</p>
                  {mostraOrigem && i.origem === 'orcamento' && i.referencias && (
                    <div className="mt-1.5 space-y-1">
                      <ListaReferencias
                        referencias={i.referencias}
                        desabilitado={desabilitado}
                        onRetirar={
                          onRetirarReferencia
                            ? (referenciaId) => onRetirarReferencia(i.id, referenciaId)
                            : undefined
                        }
                      />
                      {onAcrescentarReferencia && (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-left text-xs whitespace-normal"
                          onClick={() => onAcrescentarReferencia(i.id)}
                        >
                          {T.acrescentarReferencia}
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
                {mostraOrigem && (
                  <TableCell className="text-sm whitespace-normal">
                    <OrigemDoItem item={i} trf1={trf1} />
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  {formatarQuantidade(i.quantidade)} {i.unidade}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {preco != null ? formatarReais(preco) : '—'}
                  {i.valorProvisorio && preco != null && (
                    <span className="block text-xs text-muted-foreground">{T.provisorio}</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {preco != null ? formatarReais(valorDaLinhaCentavos(i.quantidade, preco)) : '—'}
                </TableCell>
                {c.executadoEm && (
                  <TableCell className="pr-5 text-right tabular-nums">
                    {formatarQuantidade(i.quantidadeExecutada ?? 0)} ·{' '}
                    {formatarReais(i.valorExecutadoCentavos ?? 0)}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter className="bg-transparent">
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={colunas - 1} className="text-right font-semibold">
              {T.total}
            </TableCell>
            <TableCell className="text-right font-bold tabular-nums">
              {formatarReais(c.valorTotalCentavos ?? 0)}
            </TableCell>
            {c.executadoEm && (
              <TableCell className="pr-5 text-right font-bold tabular-nums">
                {formatarReais(c.valorExecutadoCentavos ?? 0)}
              </TableCell>
            )}
          </TableRow>
        </TableFooter>
      </Table>
    </CaixaRolavel>
  );
}
