'use client';

import { AlertCircle, CheckCircle2, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { BarraSaldoEmpenho } from '@/app/(dashboard)/cotacoes/_components/compartilhado/BarraSaldoEmpenho';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  DesignacaoLinha,
  EmpenhoLinha,
  FaixaLinha,
  ItemPrimeiraCotacao,
  NotasCadastro,
  PainelMaterial,
} from '@/lib/material/cadastro';
import type { ParametrosComHistorico } from '@/lib/material/parametros';
import type { TabelasPreco } from '@/lib/material/tabelas';
import { cn } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';
import {
  dataHoraDoCadastro,
  escadaDeFaixas,
  linhaDoTempoDoEmpenho,
  type SecaoCadastro,
  SECOES_CADASTRO,
} from '@/shared/material/cadastro';
import {
  PAPEIS_DESIGNACAO,
  type PapelDesignacao,
  PERFIS_POR_PAPEL,
} from '@/shared/material/material.constants';
import {
  ROTULO_FECHAR_DIALOGO,
  ROTULO_PAPEL_DESIGNACAO,
  ROTULO_SECAO_CADASTRO,
  TEXTO_CADASTRO,
  TEXTO_CADASTRO_SECOES,
  TEXTO_CONFIRMACAO_CADASTRO,
  TEXTO_FORMULARIOS_CADASTRO,
  TEXTO_HISTORICO_CADASTRO,
  textoProjecaoCurta,
} from '@/shared/material/mensagens';
import { reaisParaCentavos } from '@/shared/material/valores';

import {
  alterarSituacaoEmpenhoAction,
  criarDesignacaoAction,
  criarEmpenhoAction,
  criarFaixaAction,
  desativarFaixaAction,
  movimentarEmpenhoAction,
  revogarDesignacaoAction,
} from '../actions';
import { CabecalhoSecao, CARTAO_CADASTRO } from './CabecalhoSecao';
import { DialogConfirmacao } from './DialogConfirmacao';
import { AbaParametros } from './ParametrosMaterial';
import { AbaAnexoV, AbaSinapi } from './TabelasPreco';

type Falha = { ok: false; error: string; campo?: 'motivo' };
type Resultado = { ok: true } | Falha;
type Executar = (
  fn: () => Promise<Resultado>,
  sucesso: string,
  depois?: () => void,
  noErro?: (falha: Falha) => void,
) => void;

/** O erro que volta ao campo de motivo (spec 0022, AC-5); os outros ficam só no toast. */
const erroDoCampo = (definir: (erro: string) => void) => (f: Falha) => {
  if (f.campo === 'motivo') definir(f.error);
};

const T = TEXTO_CADASTRO;
const E = TEXTO_CADASTRO_SECOES.empenhos;
const D = TEXTO_CADASTRO_SECOES.designacoes;
const F = TEXTO_CADASTRO_SECOES.faixas;
const C = TEXTO_CONFIRMACAO_CADASTRO;
const H = TEXTO_HISTORICO_CADASTRO;
const F_ = TEXTO_FORMULARIOS_CADASTRO;
const FE = F_.empenho;
const FM = F_.movimento;
const FD = F_.designacao;
const FF = F_.faixa;

const FORM_EMPENHO_VAZIO = () => ({
  numero: '',
  exercicio: String(new Date().getFullYear()),
  valor: '',
  vigenciaFim: '',
});

const FORM_DESIGNACAO_VAZIO = () => ({
  userId: '',
  papel: 'fiscal' as PapelDesignacao,
  faixaId: '',
  vigenciaInicio: '',
  vigenciaFim: '',
  ato: '',
});

function dataBr(ymd: string): string {
  const [a, m, d] = ymd.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

const CARTAO = CARTAO_CADASTRO;

/**
 * O cadastro de material (spec 0019, AC-19, e o Anexo V e o SINAPI da fatia 3)
 * em seções no endereço, com a navegação lateral e a lista "Para aprovar a
 * primeira cotação" no topo (spec 0021, AC-18 a AC-21).
 */
export function GerirMaterial({
  secao,
  painel,
  tabelas,
  parametros,
}: {
  secao: SecaoCadastro;
  painel: PainelMaterial;
  /** Só nas seções Anexo V e SINAPI; nas outras a página nem lê. */
  tabelas: TabelasPreco | null;
  /** Só na seção Parâmetros. */
  parametros: ParametrosComHistorico | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const executar: Executar = (fn, sucesso, depois, noErro) => {
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        noErro?.(r);
        return;
      }
      toast.success(sucesso);
      depois?.();
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <PrimeiraCotacao itens={painel.primeiraCotacao} />

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
        <NavSecoes atual={secao} notas={painel.notas} />

        <div className="min-w-0">
          {secao === 'empenhos' && (
            <Empenhos empenhos={painel.empenhos} pendente={pendente} executar={executar} />
          )}
          {secao === 'designacoes' && (
            <Designacoes painel={painel} pendente={pendente} executar={executar} />
          )}
          {secao === 'faixas' && <Faixas painel={painel} pendente={pendente} executar={executar} />}
          {secao === 'anexo-v' && tabelas && (
            <AbaAnexoV
              tabelas={tabelas}
              contratosSemAnexo={painel.contratosSemAnexo}
              itensSemCodigo={painel.itensSemCodigo}
            />
          )}
          {secao === 'sinapi' && tabelas && (
            <AbaSinapi tabelas={tabelas} atrasado={painel.sinapiAtrasado} />
          )}
          {secao === 'parametros' && parametros && (
            // A chave remonta o formulário quando os valores gravados mudam.
            <AbaParametros
              key={JSON.stringify([
                parametros.percentualSinapi,
                parametros.janelaDias,
                parametros.parcelaRelevantePercentual,
                parametros.prazoFornecimentoDiasUteis,
                parametros.raizCnpjContratada,
              ])}
              parametros={parametros}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lista inicial e navegação
// ---------------------------------------------------------------------------

function tituloEDetalhe(item: ItemPrimeiraCotacao): { titulo: string; detalhe: string } {
  switch (item.chave) {
    case 'empenho':
      return {
        titulo: T.primeira.empenho.titulo,
        detalhe: T.primeira.empenho.detalhe(item.elegiveis),
      };
    case 'faixas':
      return { titulo: T.primeira.faixas.titulo, detalhe: T.primeira.faixas.detalhe(item.ativas) };
    case 'designacoes':
      return {
        titulo: T.primeira.designacoes.titulo,
        detalhe: T.primeira.designacoes.detalhe(item.faltam),
      };
    case 'semCodigo':
      return {
        titulo: T.primeira.semCodigo.titulo,
        detalhe: T.primeira.semCodigo.detalhe(item.itens),
      };
  }
}

const hrefSecao = (s: SecaoCadastro) => `/configuracoes/material?secao=${s}`;

/** "Para aprovar a primeira cotação" (AC-19): cada item leva à seção que o resolve. */
function PrimeiraCotacao({ itens }: { itens: ItemPrimeiraCotacao[] }) {
  const prontos = itens.filter((i) => i.pronto).length;
  return (
    <section
      aria-labelledby="primeira-cotacao"
      className="space-y-3 rounded-2xl bg-indigo-50/80 p-4 dark:bg-indigo-950/30 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="primeira-cotacao"
          className="text-base font-semibold text-indigo-950 dark:text-indigo-100"
        >
          {T.primeira.titulo}
        </h2>
        <span className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">
          {T.primeira.prontos(prontos, itens.length)}
        </span>
      </div>
      <ol className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {itens.map((item) => {
          const { titulo, detalhe } = tituloEDetalhe(item);
          return (
            <li
              key={item.chave}
              data-pronto={item.pronto}
              className={cn(
                'flex items-start gap-3 rounded-xl border bg-card p-3',
                item.pronto ? 'border-border/60' : 'border-orange-300 dark:border-orange-700/60',
              )}
            >
              {item.pronto ? (
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              ) : (
                <AlertCircle
                  className="mt-0.5 h-5 w-5 shrink-0 text-orange-700 dark:text-orange-400"
                  aria-hidden="true"
                />
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold">
                  {titulo}
                  <span className="sr-only">
                    : {item.pronto ? T.primeira.pronto : T.primeira.falta}
                  </span>
                </span>
                <Link
                  href={hrefSecao(item.secao)}
                  className="text-[13px] text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
                >
                  {detalhe}
                </Link>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function notaDaSecao(s: SecaoCadastro, n: NotasCadastro): string | null {
  switch (s) {
    case 'empenhos':
      return T.nota.empenhos(n.empenhos);
    case 'designacoes':
      return T.nota.designacoes(n.designacoes);
    case 'faixas':
      return T.nota.faixas(n.faixas);
    case 'anexo-v':
      return T.nota.anexoV(n.anexoV);
    case 'sinapi':
      return T.nota.sinapi(n.sinapi);
    case 'parametros':
      return null;
  }
}

/** A navegação lateral (AC-18): a seção vai no endereço, então recarregar a mantém. */
function NavSecoes({ atual, notas }: { atual: SecaoCadastro; notas: NotasCadastro }) {
  return (
    <nav aria-label={T.navegacao}>
      <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
        {SECOES_CADASTRO.map((s) => {
          const nota = notaDaSecao(s, notas);
          const ativa = s === atual;
          return (
            <li key={s} className="min-w-0">
              <Link
                href={hrefSecao(s)}
                scroll={false}
                aria-current={ativa ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-xl px-3 py-2 text-sm transition-colors lg:flex-row lg:items-center lg:justify-between lg:gap-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  ativa
                    ? 'bg-card font-semibold text-foreground shadow-sm ring-1 ring-border'
                    : 'text-foreground/80 hover:bg-muted',
                )}
              >
                <span>{ROTULO_SECAO_CADASTRO[s]}</span>
                {nota && (
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">{nota}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Empenhos
// ---------------------------------------------------------------------------

function SituacaoEmpenho({ e }: { e: EmpenhoLinha }) {
  if (e.elegivel) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
      >
        {E.situacao.elegivel}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={
        e.ativo
          ? 'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200'
          : 'text-muted-foreground'
      }
    >
      {e.ativo ? E.situacao.fora : E.situacao.inativo}
    </Badge>
  );
}

function CartaoEmpenho({
  e,
  pendente,
  onMovimento,
  onSituacao,
}: {
  e: EmpenhoLinha;
  pendente: boolean;
  onMovimento: () => void;
  onSituacao: () => void;
}) {
  return (
    <article
      aria-labelledby={`empenho-${e.id}`}
      className={cn(CARTAO, 'space-y-4 p-4 sm:p-5', !e.ativo && 'bg-muted/30 shadow-none')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h3 id={`empenho-${e.id}`} className="font-mono text-[15px] font-semibold">
            {e.numero}
          </h3>
          <SituacaoEmpenho e={e} />
          <span className="text-[13px] text-muted-foreground">
            {E.exercicio(e.exercicio)} ·{' '}
            {e.vigenciaFim ? E.vigenteAte(dataBr(e.vigenciaFim)) : E.semFim}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" disabled={pendente} onClick={onMovimento}>
            {E.movimento}
          </Button>
          <Button size="sm" variant="ghost" disabled={pendente} onClick={onSituacao}>
            {e.ativo ? `${E.inativar}…` : `${E.reativar}…`}
          </Button>
        </div>
      </div>

      {e.ativo ? (
        <div className="space-y-3">
          <BarraSaldoEmpenho
            variante="compacta"
            className="h-3"
            barra={{
              empenhoId: e.id,
              numero: e.numero,
              liquidoCentavos: e.valorLiquidoCentavos,
              comprometidoCentavos: e.comprometidoCentavos,
              estaCotacaoCentavos: null,
              saldoDepoisCentavos: e.saldoCentavos,
              projecao: e.projecao,
            }}
          />
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ValorEmpenho rotulo={E.liquido} valor={formatarReais(e.valorLiquidoCentavos)} />
            <ValorEmpenho
              rotulo={E.comprometido}
              valor={formatarReais(e.comprometidoCentavos)}
              classe="text-indigo-700 dark:text-indigo-300"
            />
            <ValorEmpenho rotulo={E.saldo} valor={formatarReais(e.saldoCentavos)} />
            {e.projecao && (
              <ValorEmpenho
                rotulo={E.projecao}
                valor={textoProjecaoCurta(e.projecao)}
                classe="text-sm font-medium"
              />
            )}
          </dl>
          {!e.elegivel && (
            <p className="text-[13px] text-muted-foreground">
              {E.naoRecebe(formatarReais(e.saldoCentavos))}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          {E.naoRecebe(formatarReais(e.saldoCentavos))}
        </p>
      )}

      <HistoricoEmpenho e={e} />
    </article>
  );
}

/** A linha do tempo única do empenho, do mais novo ao mais antigo (spec 0022, AC-6 e AC-7). */
function HistoricoEmpenho({ e }: { e: EmpenhoLinha }) {
  const itens = linhaDoTempoDoEmpenho(e);
  return (
    <details className="border-t border-border/50 pt-3 text-[13px]">
      <summary className="cursor-pointer font-medium">{H.historico}</summary>
      {itens.length === 0 ? (
        <p className="mt-2 text-muted-foreground">{H.vazio}</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {itens.map((item, i) => (
            <li key={i} className="border-l-2 border-border pl-3">
              {item.tipo === 'antigo' ? (
                <span className="text-muted-foreground">{H.empenhoAntigo}</span>
              ) : (
                <>
                  <span className="block font-medium">
                    {item.tipo === 'situacao'
                      ? item.ativo
                        ? H.reativado
                        : H.inativado
                      : item.tipoMovimento === 'anulacao'
                        ? H.anulacao(formatarReais(item.valorCentavos))
                        : H.reforco(formatarReais(item.valorCentavos))}
                  </span>
                  <span className="block text-muted-foreground">
                    {H.quemQuando(dataHoraDoCadastro(item.em), item.porNome)}
                  </span>
                  <span className="block text-muted-foreground">
                    {item.tipo === 'movimento' ? H.ato(item.ato) : `${H.motivo}: ${item.motivo}`}
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

function ValorEmpenho({
  rotulo,
  valor,
  classe,
}: {
  rotulo: string;
  valor: string;
  classe?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={cn('text-lg font-semibold tabular-nums', classe)}>{valor}</dd>
    </div>
  );
}

function Empenhos({
  empenhos,
  pendente,
  executar,
}: {
  empenhos: EmpenhoLinha[];
  pendente: boolean;
  executar: Executar;
}) {
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState(FORM_EMPENHO_VAZIO);
  const [movendo, setMovendo] = useState<EmpenhoLinha | null>(null);
  const [mov, setMov] = useState({ tipo: 'reforco' as 'reforco' | 'anulacao', valor: '', ato: '' });
  const [confirmando, setConfirmando] = useState<EmpenhoLinha | null>(null);
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);

  function criar() {
    const valor = reaisParaCentavos(form.valor);
    if (valor == null) {
      toast.error(FE.valorInvalido);
      return;
    }
    executar(
      () =>
        criarEmpenhoAction({
          numero: form.numero,
          exercicio: Number(form.exercicio),
          valorInicialCentavos: valor,
          vigenciaFim: form.vigenciaFim || null,
        }),
      FE.cadastrado,
      () => {
        setNovo(false);
        setForm(FORM_EMPENHO_VAZIO());
      },
    );
  }

  function movimentar() {
    if (!movendo) return;
    const valor = reaisParaCentavos(mov.valor);
    if (valor == null) {
      toast.error(FM.valorInvalido);
      return;
    }
    executar(
      () =>
        movimentarEmpenhoAction({
          empenhoId: movendo.id,
          tipo: mov.tipo,
          valorCentavos: valor,
          ato: mov.ato,
        }),
      FM.registrado(mov.tipo),
      () => setMovendo(null),
    );
  }

  const textoConfirmar = confirmando ? (confirmando.ativo ? C.inativar : C.reativar) : null;

  return (
    <section aria-label={ROTULO_SECAO_CADASTRO.empenhos} className="space-y-4">
      <CabecalhoSecao titulo={ROTULO_SECAO_CADASTRO.empenhos} descricao={E.descricao}>
        <Button variant="gradiente" onClick={() => setNovo(true)} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {E.novo}
        </Button>
      </CabecalhoSecao>

      {empenhos.length === 0 ? (
        <p className={cn(CARTAO, 'p-6 text-center text-sm text-muted-foreground')}>{E.vazio}</p>
      ) : (
        empenhos.map((e) => (
          <CartaoEmpenho
            key={e.id}
            e={e}
            pendente={pendente}
            onMovimento={() => {
              setMovendo(e);
              setMov({ tipo: 'reforco', valor: '', ato: '' });
            }}
            onSituacao={() => {
              setErroMotivo(null);
              setConfirmando(e);
            }}
          />
        ))
      )}

      {confirmando && textoConfirmar && (
        <DialogConfirmacao
          titulo={textoConfirmar.titulo(confirmando.numero)}
          efeito={textoConfirmar.efeito}
          rotuloConfirmar={textoConfirmar.botao}
          destrutiva={confirmando.ativo}
          pendente={pendente}
          erroMotivo={erroMotivo}
          onFechar={() => setConfirmando(null)}
          onConfirmar={(motivo) => {
            setErroMotivo(null);
            executar(
              () =>
                alterarSituacaoEmpenhoAction({
                  empenhoId: confirmando.id,
                  ativo: !confirmando.ativo,
                  motivo,
                }),
              textoConfirmar.sucesso,
              () => setConfirmando(null),
              erroDoCampo(setErroMotivo),
            );
          }}
        />
      )}

      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>{E.novo}</DialogTitle>
            <DialogDescription>{FE.descricao}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="emp-numero">{FE.numero}</Label>
              <Input
                id="emp-numero"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
                placeholder={FE.exemploNumero}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-exercicio">{FE.exercicio}</Label>
              <Input
                id="emp-exercicio"
                inputMode="numeric"
                value={form.exercicio}
                onChange={(e) => setForm({ ...form, exercicio: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-valor">{FE.valor}</Label>
              <Input
                id="emp-valor"
                inputMode="decimal"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                placeholder={FE.exemploValor}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="emp-fim">{FE.fim}</Label>
              <Input
                id="emp-fim"
                type="date"
                value={form.vigenciaFim}
                onChange={(e) => setForm({ ...form, vigenciaFim: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(false)} disabled={pendente}>
              {ROTULO_FECHAR_DIALOGO}
            </Button>
            <Button variant="gradiente" onClick={criar} disabled={pendente} className="gap-2">
              {pendente && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {FE.cadastrar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!movendo} onOpenChange={(o) => !o && setMovendo(null)}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>{FM.titulo(movendo?.numero ?? '')}</DialogTitle>
            <DialogDescription>{FM.descricao}</DialogDescription>
          </DialogHeader>
          {movendo && movendo.movimentos.length > 0 && (
            <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {movendo.movimentos.map((m, i) => (
                <li key={i}>
                  {FM.linha(
                    m.tipo as 'reforco' | 'anulacao',
                    formatarReais(m.valorCentavos),
                    m.ato,
                    dataHoraDoCadastro(m.em),
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mov-tipo">{FM.tipo}</Label>
              <Select
                value={mov.tipo}
                onValueChange={(v) => setMov({ ...mov, tipo: v as 'reforco' | 'anulacao' })}
              >
                <SelectTrigger id="mov-tipo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reforco">{FM.reforco}</SelectItem>
                  <SelectItem value="anulacao">{FM.anulacao}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mov-valor">{FM.valor}</Label>
              <Input
                id="mov-valor"
                inputMode="decimal"
                value={mov.valor}
                onChange={(e) => setMov({ ...mov, valor: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mov-ato">{FM.ato}</Label>
              <Input
                id="mov-ato"
                value={mov.ato}
                onChange={(e) => setMov({ ...mov, ato: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovendo(null)} disabled={pendente}>
              {ROTULO_FECHAR_DIALOGO}
            </Button>
            <Button variant="gradiente" onClick={movimentar} disabled={pendente}>
              {FM.registrar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Designações
// ---------------------------------------------------------------------------

/** A ordem dos grupos: o lado TRF1 na ordem do fluxo, a contratada por último. */
const ORDEM_PAPEIS: readonly PapelDesignacao[] = [
  'fiscal',
  'gestor',
  'aprovador',
  'responsavel_tecnico',
];

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const [primeira, ...resto] = partes;
  return `${primeira?.[0] ?? ''}${resto.at(-1)?.[0] ?? ''}`.toUpperCase() || '?';
}

/** Quem fez e quando, com o motivo; o ato antigo diz que o motivo não foi registrado (spec 0022, AC-7). */
function AtoComMotivo({ texto, motivo }: { texto: string; motivo: string | null }) {
  return (
    <>
      <span className="block">{texto}</span>
      <span className="block">{motivo ? `${H.motivo}: ${motivo}` : H.motivoNaoRegistrado}</span>
    </>
  );
}

function SituacaoDesignacao({ d }: { d: DesignacaoLinha }) {
  if (d.revogadaEm) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {D.situacao.revogada}
      </Badge>
    );
  }
  return d.vigente ? (
    <Badge
      variant="outline"
      className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
    >
      {D.situacao.vigente}
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200"
    >
      {D.situacao.fora}
    </Badge>
  );
}

function Designacoes({
  painel,
  pendente,
  executar,
}: {
  painel: PainelMaterial;
  pendente: boolean;
  executar: Executar;
}) {
  const [nova, setNova] = useState(false);
  const [form, setForm] = useState(FORM_DESIGNACAO_VAZIO);
  const [mostrarRevogadas, setMostrarRevogadas] = useState(false);
  const [revogando, setRevogando] = useState<DesignacaoLinha | null>(null);
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);
  const usuarios = painel.usuarios.filter((u) => PERFIS_POR_PAPEL[form.papel].includes(u.role));
  const faixasAtivas = painel.faixas.filter((f) => f.ativa);
  const limiteDaFaixa = new Map(painel.faixas.map((f) => [f.id, f.limiteCentavos]));
  const lista = painel.designacoes.filter((d) => mostrarRevogadas || !d.revogadaEm);

  function criar() {
    executar(
      () =>
        criarDesignacaoAction({
          userId: form.userId,
          papel: form.papel,
          faixaId: form.papel === 'aprovador' ? form.faixaId || null : null,
          vigenciaInicio: form.vigenciaInicio,
          vigenciaFim: form.vigenciaFim || null,
          ato: form.ato,
        }),
      FD.registrada,
      () => {
        setNova(false);
        setForm(FORM_DESIGNACAO_VAZIO());
      },
    );
  }

  return (
    <section aria-label={ROTULO_SECAO_CADASTRO.designacoes} className="space-y-4">
      <CabecalhoSecao titulo={ROTULO_SECAO_CADASTRO.designacoes} descricao={D.descricao}>
        <div className="flex min-h-10 items-center gap-2">
          <Checkbox
            id="mostrar-revogadas"
            checked={mostrarRevogadas}
            onCheckedChange={(v) => setMostrarRevogadas(v === true)}
          />
          <Label htmlFor="mostrar-revogadas" className="font-normal text-muted-foreground">
            {D.mostrarRevogadas}
          </Label>
        </div>
        <Button variant="gradiente" onClick={() => setNova(true)} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {D.nova}
        </Button>
      </CabecalhoSecao>

      {ORDEM_PAPEIS.map((papel) => {
        const doPapel = lista.filter((d) => d.papel === papel);
        return (
          <section
            key={papel}
            aria-labelledby={`papel-${papel}`}
            className={cn(CARTAO, 'overflow-hidden')}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3 sm:px-5">
              <h3 id={`papel-${papel}`} className="text-[15px] font-semibold">
                {ROTULO_PAPEL_DESIGNACAO[papel]}
              </h3>
              <span className="text-[13px] text-muted-foreground">{D.ajudaPapel[papel]}</span>
            </div>
            {doPapel.length === 0 ? (
              <p className="border-t border-border/50 px-4 py-3 text-sm text-muted-foreground sm:px-5">
                {D.vazioPapel}
              </p>
            ) : (
              <ul>
                {doPapel.map((d) => {
                  const limite = d.faixaId ? limiteDaFaixa.get(d.faixaId) : undefined;
                  const vigencia = D.vigencia(
                    dataBr(d.vigenciaInicio),
                    d.vigenciaFim ? dataBr(d.vigenciaFim) : null,
                  );
                  return (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-4 py-3 sm:px-5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200"
                        >
                          {iniciais(d.nome)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{d.nome}</span>
                          <span className="block text-[13px] text-muted-foreground">
                            {[
                              d.faixa
                                ? D.faixa(d.faixa, limite != null ? formatarReais(limite) : null)
                                : null,
                              vigencia,
                              d.ato,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <SituacaoDesignacao d={d} />
                        {!d.revogadaEm && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pendente}
                            onClick={() => {
                              setErroMotivo(null);
                              setRevogando(d);
                            }}
                            aria-label={D.revogarDe(d.nome)}
                          >
                            {D.revogar}…
                          </Button>
                        )}
                      </div>
                      {d.revogadaEm && (
                        <details className="basis-full text-[13px]">
                          <summary className="cursor-pointer font-medium">{H.historico}</summary>
                          <div className="mt-1 border-l-2 border-border pl-3 text-muted-foreground">
                            <AtoComMotivo
                              texto={H.revogada(
                                dataHoraDoCadastro(d.revogadaEm),
                                d.revogadaPorNome ?? H.usuarioRemovido,
                              )}
                              motivo={d.revogadaMotivo}
                            />
                          </div>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {revogando && (
        <DialogConfirmacao
          titulo={C.revogar.titulo(revogando.nome)}
          efeito={C.revogar.efeito(revogando.papel)}
          rotuloConfirmar={C.revogar.botao}
          destrutiva
          pendente={pendente}
          erroMotivo={erroMotivo}
          onFechar={() => setRevogando(null)}
          onConfirmar={(motivo) => {
            setErroMotivo(null);
            executar(
              () => revogarDesignacaoAction({ designacaoId: revogando.id, motivo }),
              C.revogar.sucesso,
              () => setRevogando(null),
              erroDoCampo(setErroMotivo),
            );
          }}
        />
      )}

      <Dialog open={nova} onOpenChange={setNova}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>{D.nova}</DialogTitle>
            <DialogDescription>{FD.descricao}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="des-papel">{FD.papel}</Label>
              <Select
                value={form.papel}
                onValueChange={(v) =>
                  // A pessoa e a faixa dependem do papel: trocar o papel zera as duas.
                  setForm({ ...form, papel: v as PapelDesignacao, userId: '', faixaId: '' })
                }
              >
                <SelectTrigger id="des-papel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAPEIS_DESIGNACAO.map((p) => (
                    <SelectItem key={p} value={p}>
                      {ROTULO_PAPEL_DESIGNACAO[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="des-user">{FD.pessoa}</Label>
              <Select
                value={form.userId || undefined}
                onValueChange={(v) => setForm({ ...form, userId: v })}
              >
                <SelectTrigger id="des-user" className="w-full">
                  <SelectValue placeholder={F_.escolha} />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {FD.opcaoPessoa(u.nome, u.role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.papel === 'aprovador' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="des-faixa">{FD.faixa}</Label>
                <Select
                  value={form.faixaId || undefined}
                  onValueChange={(v) => setForm({ ...form, faixaId: v })}
                >
                  <SelectTrigger id="des-faixa" className="w-full">
                    <SelectValue placeholder={F_.escolha} />
                  </SelectTrigger>
                  <SelectContent>
                    {faixasAtivas.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {FD.opcaoFaixa(f.nome, formatarReais(f.limiteCentavos))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="des-inicio">{FD.inicio}</Label>
              <Input
                id="des-inicio"
                type="date"
                value={form.vigenciaInicio}
                onChange={(e) => setForm({ ...form, vigenciaInicio: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="des-fim">{FD.fim}</Label>
              <Input
                id="des-fim"
                type="date"
                value={form.vigenciaFim}
                onChange={(e) => setForm({ ...form, vigenciaFim: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="des-ato">{FD.ato}</Label>
              <Input
                id="des-ato"
                value={form.ato}
                onChange={(e) => setForm({ ...form, ato: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNova(false)} disabled={pendente}>
              {ROTULO_FECHAR_DIALOGO}
            </Button>
            <Button variant="gradiente" onClick={criar} disabled={pendente} className="gap-2">
              {pendente && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {FD.designar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Faixas
// ---------------------------------------------------------------------------

const pctLimite = (limite: number, maior: number) =>
  `${maior > 0 ? Math.max(4, Math.min(100, (limite / maior) * 100)) : 0}%`;

function Faixas({
  painel,
  pendente,
  executar,
}: {
  painel: PainelMaterial;
  pendente: boolean;
  executar: Executar;
}) {
  const [form, setForm] = useState({ nome: '', limite: '' });
  const [desativando, setDesativando] = useState<{ faixa: FaixaLinha; aprovadores: number } | null>(
    null,
  );
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);
  const escada = escadaDeFaixas(painel.faixas, painel.designacoes);
  const maior = escada.degraus.at(-1)?.limiteCentavos ?? 0;
  const desativadas = painel.faixas.filter((f) => !f.ativa);

  function criar() {
    const limite = reaisParaCentavos(form.limite);
    if (limite == null) {
      toast.error(FF.limiteInvalido);
      return;
    }
    executar(
      () => criarFaixaAction({ nome: form.nome, limiteCentavos: limite }),
      FF.criada,
      () => setForm({ nome: '', limite: '' }),
    );
  }

  return (
    <section aria-label={ROTULO_SECAO_CADASTRO.faixas} className="space-y-4">
      <CabecalhoSecao titulo={ROTULO_SECAO_CADASTRO.faixas} descricao={F.descricao} />

      <form
        className={cn(CARTAO, 'grid gap-3 p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end')}
        onSubmit={(e) => {
          e.preventDefault();
          criar();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="faixa-nome">{F.nome}</Label>
          <Input
            id="faixa-nome"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder={FF.exemploNome}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="faixa-limite">{F.limite}</Label>
          <Input
            id="faixa-limite"
            inputMode="decimal"
            value={form.limite}
            onChange={(e) => setForm({ ...form, limite: e.target.value })}
          />
        </div>
        <Button type="submit" variant="gradiente" disabled={pendente} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {F.criar}
        </Button>
      </form>

      <div className={cn(CARTAO, 'space-y-1 p-4 sm:p-5')}>
        {escada.degraus.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{F.vazio}</p>
        ) : (
          <ol aria-label={F.escada} className="divide-y divide-border/50">
            {escada.degraus.map((g) => (
              <li
                key={g.id}
                data-aprovadores={g.aprovadores}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[8rem_minmax(6rem,1fr)_auto_auto_auto]"
              >
                <span className="truncate text-sm font-semibold">{g.nome}</span>
                <span
                  aria-hidden="true"
                  className="order-last col-span-2 h-2.5 overflow-hidden rounded-full bg-muted sm:order-none sm:col-span-1"
                >
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      g.aprovadores > 0
                        ? 'bg-indigo-600 dark:bg-indigo-400'
                        : 'bg-indigo-200 dark:bg-indigo-900',
                    )}
                    style={{ width: pctLimite(g.limiteCentavos, maior) }}
                  />
                </span>
                <span className="text-right text-sm tabular-nums">
                  {F.ate(formatarReais(g.limiteCentavos))}
                </span>
                <span
                  className={cn(
                    'text-[13px] sm:text-right',
                    g.aprovadores === 0
                      ? 'font-medium text-orange-800 dark:text-orange-300'
                      : 'text-muted-foreground',
                  )}
                >
                  {F.aprovadores(g.aprovadores)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pendente}
                  className="justify-self-end"
                  aria-label={F.desativarA(g.nome)}
                  onClick={() => {
                    setErroMotivo(null);
                    setDesativando({
                      faixa: painel.faixas.find((f) => f.id === g.id)!,
                      aprovadores: g.aprovadores,
                    });
                  }}
                >
                  {F.desativar}…
                </Button>
              </li>
            ))}
          </ol>
        )}
        {escada.degraus.length > 0 && (
          <p
            className={cn(
              'border-t border-border/50 pt-3 text-[13px]',
              escada.tetoCentavos == null
                ? 'font-medium text-orange-800 dark:text-orange-300'
                : 'text-muted-foreground',
            )}
          >
            {escada.tetoCentavos == null ? F.semTeto : F.teto(formatarReais(escada.tetoCentavos))}
          </p>
        )}
      </div>

      {desativadas.length > 0 && (
        <details className={cn(CARTAO, 'p-4 text-sm sm:p-5')}>
          <summary className="cursor-pointer font-medium">
            {F.desativadas(desativadas.length)}
          </summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {desativadas.map((f) => (
              <li key={f.id}>
                <span className="block font-medium text-foreground">
                  {f.nome} · {F.ate(formatarReais(f.limiteCentavos))}
                </span>
                <span className="mt-0.5 block border-l-2 border-border pl-3 text-[13px]">
                  {f.desativadaEm ? (
                    <AtoComMotivo
                      texto={H.desativada(
                        dataHoraDoCadastro(f.desativadaEm),
                        f.desativadaPorNome ?? H.usuarioRemovido,
                      )}
                      motivo={f.desativadaMotivo}
                    />
                  ) : (
                    H.faixaAntiga
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {desativando && (
        <DialogConfirmacao
          titulo={C.desativar.titulo(desativando.faixa.nome)}
          efeito={C.desativar.efeito(desativando.aprovadores)}
          rotuloConfirmar={C.desativar.botao}
          destrutiva
          pendente={pendente}
          erroMotivo={erroMotivo}
          onFechar={() => setDesativando(null)}
          onConfirmar={(motivo) => {
            setErroMotivo(null);
            executar(
              () => desativarFaixaAction({ faixaId: desativando.faixa.id, motivo }),
              C.desativar.sucesso,
              () => setDesativando(null),
              erroDoCampo(setErroMotivo),
            );
          }}
        />
      )}
    </section>
  );
}
