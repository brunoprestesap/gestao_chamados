'use client';

import { Search, X } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';
import { TEXTO_EDITOR as T } from '@/shared/material/mensagens';

import { BuscaPrecoNoItem, type EscolhaTabela } from './BuscaPrecoNoItem';
import { daTabela, type ItemDoFormulario } from './formulario';
import { SecaoDoPasso } from './PassosMontagem';

const mesBr = (ref: string | null) => (ref ? ref.split('-').reverse().join('/') : '');

/** A etiqueta da origem do preço do item, com a cor da tabela. */
function OrigemDoItem({ item: i }: { item: ItemDoFormulario }) {
  const [texto, cor] =
    i.origem === 'anexo_v'
      ? [`Anexo V · item ${i.anexoVNumero}`, 'indigo']
      : i.origem === 'sinapi'
        ? [`SINAPI ${i.sinapiCodigo} · ${mesBr(i.sinapiReferencia)}`, 'sky']
        : i.origem === 'ambas'
          ? [`Anexo V · item ${i.anexoVNumero} e SINAPI ${i.sinapiCodigo}`, 'indigo']
          : i.origem === 'orcamento'
            ? [T.tresOrcamentos, 'slate']
            : [T.semPrecoAinda, 'amber'];
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent font-semibold',
        cor === 'indigo' && 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
        cor === 'sky' && 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
        cor === 'slate' && 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
        cor === 'amber' && 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
      )}
    >
      {texto}
    </Badge>
  );
}

/**
 * Passo 2, o preço de tabela (AC-12, AC-13): cada item diz de onde vem o
 * preço, e a busca no Anexo V e no SINAPI abre dentro do próprio item, com
 * "Usar três orçamentos" como saída. Escolher salva o rascunho antes (para o
 * item novo existir no servidor) e a tela recarrega com o preço da tabela.
 */
export function PassoPrecoTabela({
  cotacaoId,
  itens,
  pendente,
  onClassificar,
}: {
  cotacaoId: string;
  itens: readonly ItemDoFormulario[];
  pendente: boolean;
  onClassificar: (itemId: string, escolha: EscolhaTabela | { orcamento: true }) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const resolvidos = itens.filter((i) => i.origem != null).length;

  return (
    <SecaoDoPasso
      titulo={T.tabelaTitulo}
      ajuda={T.tabelaAjuda}
      canto={
        <span className="text-sm text-muted-foreground">
          {T.resolvidos(resolvidos, itens.length)}
        </span>
      }
    >
      <ul className="border-t border-border/60">
        {itens.map((i) => {
          const eAberto = aberto === i.id;
          const descricao = i.descricao || T.semDescricao;
          return (
            <li key={i.id} className="border-b border-border/60 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium">{descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.quantidade || '—'} {i.unidade}
                    {i.doDiagnostico ? ` · ${T.doDiagnostico}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <OrigemDoItem item={i} />
                  {daTabela(i) && i.precoTabelaCentavos != null && (
                    <span className="text-sm font-semibold tabular-nums">
                      {T.porUnidade(formatarReais(i.precoTabelaCentavos), i.unidade)}
                    </span>
                  )}
                  {i.valorProvisorio && (
                    <span className="text-xs text-muted-foreground">{T.valorProvisorio}</span>
                  )}
                  <Button
                    type="button"
                    variant={!eAberto && i.origem == null ? 'outline' : 'ghost'}
                    size="sm"
                    className="gap-1.5"
                    aria-expanded={eAberto}
                    aria-label={eAberto ? `${T.fecharBusca}: ${descricao}` : undefined}
                    disabled={pendente}
                    onClick={() => setAberto(eAberto ? null : i.id)}
                  >
                    {eAberto ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
                    {eAberto
                      ? T.fecharBusca
                      : daTabela(i)
                        ? T.trocar
                        : i.origem === 'orcamento'
                          ? T.buscarNaTabela
                          : T.buscarPreco}
                  </Button>
                  {daTabela(i) && !eAberto && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pendente}
                      onClick={() => onClassificar(i.id, { orcamento: true })}
                    >
                      {T.usarTresOrcamentos}
                    </Button>
                  )}
                </div>
              </div>
              {eAberto && (
                <BuscaPrecoNoItem
                  cotacaoId={cotacaoId}
                  item={i}
                  escolhendo={pendente}
                  onEscolher={(escolha) => onClassificar(i.id, escolha)}
                  onTresOrcamentos={() => onClassificar(i.id, { orcamento: true })}
                />
              )}
            </li>
          );
        })}
      </ul>
    </SecaoDoPasso>
  );
}
