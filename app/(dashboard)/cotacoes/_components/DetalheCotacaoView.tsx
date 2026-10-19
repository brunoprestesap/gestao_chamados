'use client';

import { AlertTriangle, History, Landmark, Loader2, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { DetalheCotacao } from '@/lib/material/leitura';
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import { formatarCnpj } from '@/shared/contratos/cnpj';
import {
  type CodigoControle,
  CONTROLES,
  ROTULO_ACAO,
  ROTULO_PAPEL,
  ROTULO_SITUACAO,
  textoDoMotivo,
} from '@/shared/material/mensagens';
import { valorDaLinhaCentavos } from '@/shared/material/valores';

import {
  alterarAction,
  aprovarAction,
  assumirAction,
  cancelarAction,
  devolverAction,
  encaminharAction,
  reprovarAction,
} from '../actions';
import { SituacaoBadge } from './apoio';
import { AtesteCotacao } from './AtesteCotacao';
import { BotaoPdfCotacao } from './BotaoPdfCotacao';
import { DialogExecucao } from './DialogExecucao';
import { DialogMaterial } from './DialogMaterial';
import { EditorContratada } from './EditorContratada';

type ResultadoAcao = { ok: true } | { ok: false; error: string; impedimentos?: CodigoControle[] };

type ComMotivo = 'devolver' | 'reprovar' | 'cancelar';

const TITULO_MOTIVO: Record<ComMotivo, string> = {
  devolver: 'Devolver para correção',
  reprovar: 'Reprovar a cotação',
  cancelar: 'Cancelar a cotação',
};

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Belem',
    dateStyle: 'short',
    timeStyle: 'short',
  });

/** O detalhe da cotação de material (spec 0019), com as ações do papel de quem vê. */
export function DetalheCotacaoView({ detalhe }: { detalhe: DetalheCotacao }) {
  const router = useRouter();
  const { cotacao: c, acoes, chamado } = detalhe;
  const [impedimentos, setImpedimentos] = useState<CodigoControle[]>([]);
  const [motivo, setMotivo] = useState<{ acao: ComMotivo; texto: string } | null>(null);
  const [aprovando, setAprovando] = useState(false);
  const [empenhoId, setEmpenhoId] = useState('');
  const [dialogo, setDialogo] = useState<'editar' | 'executar' | null>(null);
  const [pendente, iniciar] = useTransition();
  const trf1 = c.visao === 'trf1';

  const elegiveisComSaldo = (detalhe.empenhosElegiveis ?? []).filter(
    (e) => e.saldoCentavos >= (c.valorTotalCentavos ?? 0),
  );

  function agir(fn: () => Promise<ResultadoAcao>, sucesso: string, depois?: () => void) {
    setImpedimentos([]);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        setImpedimentos(r.impedimentos ?? []);
        router.refresh();
        return;
      }
      toast.success(sucesso);
      depois?.();
      router.refresh();
    });
  }

  function abrirAprovar() {
    setEmpenhoId(elegiveisComSaldo.length === 1 ? elegiveisComSaldo[0]!.id : '');
    setAprovando(true);
  }

  const base = { id: c.id, versao: c.versao };
  const linkChamado =
    c.visao === 'tecnico' ? `/chamados-atribuidos/${chamado.id}` : `/gestao?chamado=${chamado.id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <SituacaoBadge situacao={c.situacao} className="text-sm" />
        <span>
          Chamado{' '}
          <Link href={linkChamado} className="text-primary hover:underline">
            {chamado.numero}
          </Link>{' '}
          · {chamado.titulo}
        </span>
        {chamado.ativo && <span>· Ativo {chamado.ativo}</span>}
        {acoes.gerarPdf && (
          <span className="ml-auto">
            <BotaoPdfCotacao cotacaoId={c.id} numero={c.numero} />
          </span>
        )}
      </div>

      {c.ultimoMotivo && ['devolvida', 'reprovada', 'cancelada'].includes(c.situacao) && (
        <p className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100">
          {ROTULO_SITUACAO[c.situacao]}: {textoDoMotivo(c.ultimoMotivo)}
        </p>
      )}

      {impedimentos.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300/60 bg-rose-50/70 p-3 text-sm text-rose-900 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-100"
        >
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Impedimentos
          </p>
          <ul className="mt-1 list-disc pl-6">
            {impedimentos.map((i) => (
              <li key={i}>{CONTROLES[i]?.texto ?? i}</li>
            ))}
          </ul>
        </div>
      )}

      {(c.advertencias ?? []).length > 0 && (
        <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-200">
          {(c.advertencias ?? []).map((a) => (
            <li key={a} className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {CONTROLES[a]?.texto ?? a}
            </li>
          ))}
        </ul>
      )}

      {acoes.montar ? (
        <EditorContratada
          key={c.versao}
          cotacao={c}
          onAlterado={() => router.refresh()}
          onImpedimentos={setImpedimentos}
        />
      ) : (
        <>
          <section aria-labelledby="itens-titulo" className="space-y-2">
            <h2 id="itens-titulo" className="text-base font-semibold">
              Itens
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Preço unitário</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    {c.executadoEm && <TableHead className="text-right">Aplicado</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(c.itens ?? []).map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <p className="font-medium">{i.descricao}</p>
                        <p className="text-xs text-muted-foreground">{i.motivo}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatarQuantidade(i.quantidade)} {i.unidade}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {i.precoAplicadoCentavos != null
                          ? formatarReais(i.precoAplicadoCentavos)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {i.precoAplicadoCentavos != null
                          ? formatarReais(
                              valorDaLinhaCentavos(i.quantidade, i.precoAplicadoCentavos),
                            )
                          : '—'}
                      </TableCell>
                      {c.executadoEm && (
                        <TableCell className="text-right tabular-nums">
                          {formatarQuantidade(i.quantidadeExecutada ?? 0)} ·{' '}
                          {formatarReais(i.valorExecutadoCentavos ?? 0)}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-right text-sm">
              Total:{' '}
              <span className="font-semibold">{formatarReais(c.valorTotalCentavos ?? 0)}</span>
              {c.valorExecutadoCentavos != null && (
                <>
                  {' '}
                  · Executado:{' '}
                  <span className="font-semibold">{formatarReais(c.valorExecutadoCentavos)}</span>
                </>
              )}
            </p>
          </section>

          {(c.orcamentos ?? []).length > 0 && (
            <section aria-labelledby="orc-titulo" className="space-y-2">
              <h2 id="orc-titulo" className="text-base font-semibold">
                Orçamentos
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {(c.orcamentos ?? []).map((o) => (
                  <li key={o.id} className="rounded-xl border border-border/60 p-3 text-sm">
                    <p className="font-medium">{o.fornecedor}</p>
                    <p className="text-xs text-muted-foreground">
                      CNPJ {formatarCnpj(o.cnpj)} · {o.data.split('-').reverse().join('/')}
                    </p>
                    <ul className="mt-1 text-xs text-muted-foreground">
                      {o.precos.map((p) => {
                        const item = c.itens?.find((i) => i.id === p.itemId);
                        return (
                          <li key={p.itemId}>
                            {item?.descricao ?? 'item'}: {formatarReais(p.valorUnitarioCentavos)}
                          </li>
                        );
                      })}
                    </ul>
                    <a
                      href={`/api/cotacoes/arquivos/${o.arquivoId}`}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Paperclip className="h-3 w-3" aria-hidden="true" />
                      Arquivo do orçamento
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {(c.arquivos ?? []).some((a) => a.tipo === 'evidencia') && (
        <section aria-labelledby="evid-titulo" className="space-y-1 text-sm">
          <h2 id="evid-titulo" className="text-base font-semibold">
            Evidências da aplicação
          </h2>
          <ul>
            {(c.arquivos ?? [])
              .filter((a) => a.tipo === 'evidencia')
              .map((a) => (
                <li key={a.id}>
                  <a
                    href={`/api/cotacoes/arquivos/${a.id}`}
                    className="text-primary hover:underline"
                  >
                    {a.nomeOriginal}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      )}

      <AtesteCotacao cotacao={c} acoes={acoes} onAlterado={() => router.refresh()} />

      {trf1 && (
        <section
          aria-labelledby="saldo-titulo"
          className="space-y-2 rounded-2xl border border-border/50 p-4 text-sm"
        >
          <h2 id="saldo-titulo" className="flex items-center gap-2 text-base font-semibold">
            <Landmark className="h-4 w-4" aria-hidden="true" />
            Empenho
          </h2>
          {detalhe.empenhoNumero ? (
            <p>
              Reservado no empenho <span className="font-medium">{detalhe.empenhoNumero}</span>:{' '}
              {/* Depois da execução, a reserva é ajustada ao executado (AC-10). */}
              {formatarReais(
                (c.executadoEm ? c.valorExecutadoCentavos : c.valorAutorizadoCentavos) ?? 0,
              )}
              {c.executadoEm && ` (autorizado ${formatarReais(c.valorAutorizadoCentavos ?? 0)})`}
            </p>
          ) : (detalhe.empenhosElegiveis ?? []).length === 0 ? (
            <p className="text-muted-foreground">
              Nenhum empenho elegível cadastrado. A cotação não pode ser encaminhada nem aprovada.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {(detalhe.empenhosElegiveis ?? []).map((e) => (
                <li key={e.id}>
                  {e.numero}: saldo {formatarReais(e.saldoCentavos)}
                </li>
              ))}
            </ul>
          )}
          {c.situacao === 'em_aprovacao' && !acoes.aprovar && (
            <p className="text-muted-foreground">
              Podem aprovar este valor:{' '}
              {(detalhe.aprovadoresQueCobrem ?? []).length
                ? (detalhe.aprovadoresQueCobrem ?? []).map((a) => a.nome).join(', ')
                : 'nenhum aprovador vigente com faixa suficiente'}
              .
            </p>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {acoes.editarDiagnostico && (
          <Button variant="outline" onClick={() => setDialogo('editar')}>
            Editar material
          </Button>
        )}
        {acoes.executar && (
          <Button onClick={() => setDialogo('executar')}>Registrar execução</Button>
        )}
        {acoes.assumir && (
          <Button
            disabled={pendente}
            onClick={() => agir(() => assumirAction(base), 'Análise assumida.')}
          >
            Assumir análise
          </Button>
        )}
        {acoes.encaminhar && (
          <Button
            disabled={pendente}
            onClick={() => agir(() => encaminharAction(base), 'Encaminhada para aprovação.')}
          >
            Encaminhar para aprovação
          </Button>
        )}
        {acoes.aprovar && (
          <Button disabled={pendente} onClick={abrirAprovar}>
            Aprovar
          </Button>
        )}
        {acoes.devolver && (
          <Button
            variant="outline"
            disabled={pendente}
            onClick={() => setMotivo({ acao: 'devolver', texto: '' })}
          >
            Devolver
          </Button>
        )}
        {acoes.reprovar && (
          <Button
            variant="outline"
            disabled={pendente}
            onClick={() => setMotivo({ acao: 'reprovar', texto: '' })}
          >
            Reprovar
          </Button>
        )}
        {acoes.alterar && (
          <Button
            variant="outline"
            disabled={pendente}
            onClick={() =>
              agir(
                () => alterarAction(base),
                'Cotação reaberta para alteração. O saldo foi liberado.',
              )
            }
          >
            Pedir alteração
          </Button>
        )}
        {acoes.cancelar && (
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={pendente}
            onClick={() => setMotivo({ acao: 'cancelar', texto: '' })}
          >
            Cancelar cotação
          </Button>
        )}
        {pendente && (
          <Loader2
            className="h-5 w-5 animate-spin text-muted-foreground"
            aria-label="Processando"
          />
        )}
      </div>

      {(c.trilha ?? []).length > 0 && (
        <section aria-labelledby="trilha-titulo" className="space-y-2">
          <h2 id="trilha-titulo" className="flex items-center gap-2 text-base font-semibold">
            <History className="h-4 w-4" aria-hidden="true" />
            Trilha
          </h2>
          <ol className="space-y-2 border-l border-border pl-4 text-sm">
            {(c.trilha ?? []).map((ev) => (
              <li key={ev.id}>
                <p>
                  <span className="font-medium">
                    {ev.acao === 'conciliar'
                      ? 'Conciliação do saldo'
                      : (ROTULO_ACAO[ev.acao as keyof typeof ROTULO_ACAO] ?? ev.acao)}
                  </span>
                  {ev.de !== ev.para && ` · ${ROTULO_SITUACAO[ev.para]}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dataHora(ev.em)} ·{' '}
                  {ev.autorNome
                    ? `${ev.autorNome} (${ROTULO_PAPEL[ev.papel]})`
                    : ROTULO_PAPEL[ev.papel]}
                  {ev.limiteCentavosNoAto != null &&
                    ` · limite no ato ${formatarReais(ev.limiteCentavosNoAto)}`}
                  {ev.valorCentavos != null &&
                    ` · ${ev.valorCentavos >= 0 ? 'reservado' : 'liberado'} ${formatarReais(Math.abs(ev.valorCentavos))}`}
                </p>
                {ev.motivo && <p className="text-xs">Motivo: {textoDoMotivo(ev.motivo)}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <Dialog open={!!motivo} onOpenChange={(o) => !o && setMotivo(null)}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>{motivo ? TITULO_MOTIVO[motivo.acao] : ''}</DialogTitle>
            <DialogDescription>
              O motivo fica na trilha e vai para quem montou a cotação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Textarea
              id="motivo"
              value={motivo?.texto ?? ''}
              onChange={(e) => motivo && setMotivo({ ...motivo, texto: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMotivo(null)} disabled={pendente}>
              Voltar
            </Button>
            <Button
              disabled={pendente}
              onClick={() => {
                if (!motivo) return;
                const entrada = { ...base, motivo: motivo.texto };
                const fn =
                  motivo.acao === 'devolver'
                    ? () => devolverAction(entrada)
                    : motivo.acao === 'reprovar'
                      ? () => reprovarAction(entrada)
                      : () => cancelarAction(entrada);
                agir(fn, 'Feito.', () => setMotivo(null));
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aprovando} onOpenChange={setAprovando}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Aprovar {c.numero}</DialogTitle>
            <DialogDescription>
              Aprovar reserva {formatarReais(c.valorTotalCentavos ?? 0)} no empenho escolhido e
              autoriza a compra.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Empenho</legend>
            {(detalhe.empenhosElegiveis ?? []).map((e) => {
              const cabe = e.saldoCentavos >= (c.valorTotalCentavos ?? 0);
              return (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="empenho"
                    value={e.id}
                    checked={empenhoId === e.id}
                    disabled={!cabe}
                    onChange={() => setEmpenhoId(e.id)}
                  />
                  {e.numero} · saldo {formatarReais(e.saldoCentavos)}
                  {!cabe && ' (sem saldo)'}
                </label>
              );
            })}
          </fieldset>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAprovando(false)} disabled={pendente}>
              Voltar
            </Button>
            <Button
              disabled={pendente || !empenhoId}
              onClick={() =>
                agir(
                  () => aprovarAction({ ...base, empenhoId }),
                  'Cotação autorizada.',
                  () => setAprovando(false),
                )
              }
            >
              Aprovar e reservar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dialogo === 'editar' && c.itens && (
        <DialogMaterial
          modo="editar"
          cotacaoId={c.id}
          versao={c.versao}
          itens={c.itens}
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          onSalvo={() => router.refresh()}
        />
      )}
      {dialogo === 'executar' && c.itens && (
        <DialogExecucao
          cotacaoId={c.id}
          versao={c.versao}
          itens={c.itens}
          evidencias={(c.arquivos ?? []).filter((a) => a.tipo === 'evidencia')}
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          onArquivos={() => router.refresh()}
          onAlterado={() => router.refresh()}
        />
      )}
    </div>
  );
}
