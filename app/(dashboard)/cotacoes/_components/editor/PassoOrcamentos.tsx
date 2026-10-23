'use client';

import { FileUp, Loader2, Plus, Trash2 } from 'lucide-react';

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
import { cn } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';
import type { ReferenciaEntrada } from '@/shared/material/cotacao.schemas';
import {
  MAX_ORCAMENTOS_COTACAO,
  MAX_REFERENCIAS_POR_PAPEL,
  MIN_ORCAMENTOS_POR_ITEM,
} from '@/shared/material/material.constants';
import { TEXTO_EDITOR as T } from '@/shared/material/mensagens';

import { CaixaRolavel } from '../detalhe/CaixaRolavel';
import { FormReferencia, ListaReferencias } from '../ReferenciasPreco';
import {
  daTabela,
  empresasDoItem,
  type ItemDoFormulario,
  menorPrecoDoItem,
  type OrcamentoDoFormulario,
  precosDoItem,
  type RefLocal,
} from './formulario';
import { SecaoDoPasso } from './PassosMontagem';

export type CampoDoOrcamento = 'fornecedor' | 'cnpj' | 'data' | 'validade';

const dataBr = (ymd: string) => ymd.split('-').reverse().join('/');

/** O nome do fornecedor na grade, ou "Orçamento N" enquanto não foi digitado. */
const nomeDoOrcamento = (o: OrcamentoDoFormulario, n: number) =>
  o.fornecedor.trim() || T.orcamento(n + 1);

/** O que falta no fornecedor para o envio, para o cabeçalho da coluna (AC-14). */
function faltasDoOrcamento(o: OrcamentoDoFormulario): string[] {
  const faltas: string[] = [];
  if (!o.validade) faltas.push(T.faltaValidade);
  if (!o.arquivoId) faltas.push(T.faltaArquivo);
  return faltas;
}

/** A referência da contratada como aparece: a gravada, ou a nova ainda sem o preço SINAPI. */
function textoDaReferencia(r: RefLocal) {
  if (r.gravada) {
    const g = r.gravada;
    return `${formatarReais(g.valorUnitarioCentavos)}${g.unidade ? ` por ${g.unidade}` : ''} · ${g.fonte} · ${dataBr(g.data)}`;
  }
  const e = r.entrada;
  if ('sinapiCodigo' in e) return T.referenciaNova(e.sinapiCodigo);
  return `${formatarReais(e.valorUnitarioCentavos)} · ${e.fonte} · ${dataBr(e.data)}`;
}

/**
 * Passo 3, os orçamentos (AC-14): os dados de cada fornecedor, a grade de
 * preços (só os itens que vão para orçamento, um campo por célula, o menor
 * preço destacado e "N de 3" por item) e as referências de preço de cada item.
 */
export function PassoOrcamentos({
  itens,
  orcamentos,
  enviandoArquivo,
  pendente,
  onMudarOrcamento,
  onMudarPreco,
  onAnexar,
  onTirarOrcamento,
  onAcrescentarOrcamento,
  onAcrescentarReferencia,
  onTirarReferencia,
}: {
  itens: readonly ItemDoFormulario[];
  orcamentos: readonly OrcamentoDoFormulario[];
  enviandoArquivo: string | null;
  pendente: boolean;
  onMudarOrcamento: (id: string, campo: CampoDoOrcamento, valor: string) => void;
  onMudarPreco: (orcamentoId: string, itemId: string, valor: string) => void;
  onAnexar: (orcamentoId: string, arquivo: File | undefined) => void;
  onTirarOrcamento: (id: string) => void;
  onAcrescentarOrcamento: () => void;
  onAcrescentarReferencia: (itemId: string, r: ReferenciaEntrada) => void;
  onTirarReferencia: (itemId: string, referenciaId: string) => void;
}) {
  const doCaminho3 = itens.filter((i) => !daTabela(i));
  const comTabela = itens.filter(daTabela);

  if (doCaminho3.length === 0 && orcamentos.length === 0) {
    return (
      <SecaoDoPasso titulo={T.fornecedores}>
        <p className="px-5 pb-5 text-sm text-muted-foreground">{T.semItemParaOrcamento}</p>
      </SecaoDoPasso>
    );
  }

  return (
    <div className="space-y-5">
      <SecaoDoPasso titulo={T.fornecedores} ajuda={T.orcamentosAjuda(MIN_ORCAMENTOS_POR_ITEM)}>
        <div className="space-y-3 px-5 pb-5">
          {orcamentos.length === 0 && (
            <p className="text-sm text-muted-foreground">{T.semOrcamentos}</p>
          )}
          {orcamentos.map((o, n) => (
            <fieldset key={o.id} className="space-y-3 rounded-xl border border-border/60 p-4">
              <legend className="px-1 text-xs font-medium text-muted-foreground">
                {T.orcamento(n + 1)}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor={`f-${o.id}`} className="text-xs">
                    {T.fornecedor}
                  </Label>
                  <Input
                    id={`f-${o.id}`}
                    value={o.fornecedor}
                    onChange={(e) => onMudarOrcamento(o.id, 'fornecedor', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`c-${o.id}`} className="text-xs">
                    {T.cnpj}
                  </Label>
                  <Input
                    id={`c-${o.id}`}
                    value={o.cnpj}
                    inputMode="numeric"
                    onChange={(e) => onMudarOrcamento(o.id, 'cnpj', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`dt-${o.id}`} className="text-xs">
                    {T.data}
                  </Label>
                  <Input
                    id={`dt-${o.id}`}
                    type="date"
                    value={o.data}
                    onChange={(e) => onMudarOrcamento(o.id, 'data', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`v-${o.id}`} className="text-xs">
                    {T.validade}
                  </Label>
                  <Input
                    id={`v-${o.id}`}
                    type="date"
                    value={o.validade}
                    onChange={(e) => onMudarOrcamento(o.id, 'validade', e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Label
                    htmlFor={`a-${o.id}`}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 font-normal hover:bg-muted"
                  >
                    {enviandoArquivo === o.id ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileUp className="size-4" aria-hidden="true" />
                    )}
                    {o.arquivoId ? T.trocarArquivo : T.anexarArquivo}
                  </Label>
                  <input
                    id={`a-${o.id}`}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    className="sr-only"
                    onChange={(e) => {
                      onAnexar(o.id, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  {o.arquivoId && (
                    <span className="truncate text-muted-foreground">{o.arquivoNome}</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-destructive hover:text-destructive"
                  onClick={() => onTirarOrcamento(o.id)}
                >
                  <Trash2 aria-hidden="true" />
                  {T.tirarOrcamento}
                </Button>
              </div>
            </fieldset>
          ))}
          {orcamentos.length < MAX_ORCAMENTOS_COTACAO && (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={onAcrescentarOrcamento}
            >
              <Plus aria-hidden="true" />
              {T.acrescentarOrcamento}
            </Button>
          )}
        </div>
      </SecaoDoPasso>

      {doCaminho3.length > 0 && orcamentos.length > 0 && (
        <SecaoDoPasso titulo={T.gradeTitulo} ajuda={T.gradeAjuda}>
          <CaixaRolavel rotulo={T.gradeRotulo}>
            <Table className="min-w-[36rem]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="w-[34%] min-w-48 align-bottom">
                    {T.colunaItem}
                  </TableHead>
                  {orcamentos.map((o, n) => {
                    const faltas = faltasDoOrcamento(o);
                    return (
                      <TableHead
                        key={o.id}
                        scope="col"
                        className="h-auto min-w-36 py-3 align-bottom whitespace-normal"
                      >
                        <span className="block font-semibold text-foreground">
                          {nomeDoOrcamento(o, n)}
                        </span>
                        <span
                          className={cn(
                            'block text-xs font-normal',
                            faltas.length
                              ? 'text-amber-800 dark:text-amber-200'
                              : 'text-muted-foreground',
                          )}
                        >
                          {faltas.length
                            ? T.faltaNoFornecedor(faltas)
                            : T.validadeAte(dataBr(o.validade))}
                        </span>
                      </TableHead>
                    );
                  })}
                  <TableHead scope="col" className="text-right align-bottom">
                    {T.colunaBase}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doCaminho3.map((i) => {
                  const menor = menorPrecoDoItem(orcamentos, i.id);
                  const cotaram = precosDoItem(orcamentos, i.id).length;
                  const empresas = empresasDoItem(orcamentos, i.id);
                  const descricao = i.descricao || T.semDescricao;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="whitespace-normal">
                        <span className="block font-medium">{descricao}</span>
                        <span className="block text-xs text-muted-foreground">
                          {i.quantidade || '—'} {i.unidade}
                        </span>
                      </TableCell>
                      {orcamentos.map((o, n) => {
                        const valor = o.precos[i.id] ?? '';
                        const eMenor =
                          menor != null &&
                          precosDoItem([o], i.id).some((p) => p.centavos === menor);
                        return (
                          <TableCell key={o.id}>
                            <Input
                              inputMode="decimal"
                              value={valor}
                              placeholder={T.naoCotou}
                              aria-label={T.precoDaCelula(descricao, nomeDoOrcamento(o, n))}
                              onChange={(e) => onMudarPreco(o.id, i.id, e.target.value)}
                              className={cn(
                                'text-right tabular-nums',
                                eMenor &&
                                  'border-emerald-400 bg-emerald-50 font-semibold text-emerald-900 dark:border-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-100',
                                !valor && 'bg-muted/40',
                              )}
                            />
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            'inline-flex rounded-md px-2 py-0.5 text-xs font-semibold',
                            cotaram >= MIN_ORCAMENTOS_POR_ITEM
                              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100'
                              : cotaram > 0
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100'
                                : 'bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-100',
                          )}
                        >
                          {T.contagemDoItem(cotaram, MIN_ORCAMENTOS_POR_ITEM)}
                        </span>
                        {cotaram > 0 && (
                          <span className="block pt-1 text-xs text-muted-foreground">
                            {T.empresasDiferentes(empresas)}
                          </span>
                        )}
                        {menor != null && (
                          <span className="block text-sm font-semibold tabular-nums">
                            {formatarReais(menor)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CaixaRolavel>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-3 rounded-sm border border-emerald-400 bg-emerald-50 dark:bg-emerald-500/15"
              />
              {T.menorPreco}
            </span>
            {comTabela.length > 0 && (
              <span>
                {T.itensComTabela}{' '}
                <span className="font-medium text-foreground">
                  {comTabela.map((i) => i.descricao || T.semDescricao).join(', ')}
                </span>
              </span>
            )}
          </div>
        </SecaoDoPasso>
      )}

      {doCaminho3.length > 0 && (
        <SecaoDoPasso titulo={T.referenciasTitulo} ajuda={T.referenciasAjuda}>
          <ul className="space-y-3 px-5 pb-5">
            {doCaminho3.map((i) => (
              <li key={i.id} className="space-y-2 rounded-xl border border-border/60 p-4">
                <p className="text-sm font-medium">{i.descricao || T.semDescricao}</p>
                {i.referencias.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {i.referencias.map((r) => (
                      <li key={r.entrada.id} className="flex flex-wrap items-center gap-2">
                        <span className="tabular-nums">{textoDaReferencia(r)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={T.tirarReferencia}
                          onClick={() => onTirarReferencia(i.id, r.entrada.id)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {i.referenciasFiscal.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {T.referenciasDoFiscal}
                    </p>
                    <ListaReferencias referencias={i.referenciasFiscal} />
                  </div>
                )}
                {i.referencias.length < MAX_REFERENCIAS_POR_PAPEL && (
                  <FormReferencia
                    desabilitado={pendente}
                    onAdicionar={(r) => onAcrescentarReferencia(i.id, r)}
                  />
                )}
              </li>
            ))}
          </ul>
        </SecaoDoPasso>
      )}
    </div>
  );
}
