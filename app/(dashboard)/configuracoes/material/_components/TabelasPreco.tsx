'use client';

import { AlertTriangle, FileUp, Loader2, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { CaixaRolavel } from '@/app/(dashboard)/cotacoes/_components/detalhe/CaixaRolavel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { ItemSemCodigo } from '@/lib/material/cadastro';
import type { MudancaRevisao } from '@/lib/material/importacao/revisao';
import type {
  ContratoAnexoV,
  ImportacaoAberta,
  ItemAnexoVLinha,
  TabelasPreco,
} from '@/lib/material/tabelas';
import { cn } from '@/lib/utils';
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import {
  COLUNAS_ANEXO_V,
  COLUNAS_SINAPI,
  TEXTO_CURTO_MAX,
  TEXTO_CURTO_MIN,
  type TipoImportacaoMaterial,
} from '@/shared/material/material.constants';
import {
  mesCurto,
  ROTULO_FECHAR_DIALOGO,
  ROTULO_SECAO_CADASTRO,
  TEXTO_CADASTRO_TABELAS as TT,
  TEXTO_IMPORTACAO_CADASTRO,
  textoMarcaAnomalia,
} from '@/shared/material/mensagens';

import {
  aplicarImportacaoAction,
  corrigirCodigoSinapiAction,
  descartarImportacaoAction,
  marcarAnomaliaAction,
} from '../actions';
import { CabecalhoSecao, CARTAO_CADASTRO } from './CabecalhoSecao';

type Resultado = { ok: true } | { ok: false; error: string };

const R = TT.revisao;
const TI = TEXTO_IMPORTACAO_CADASTRO;
const TE = TI.enviar;
const TR = TI.revisao;
const TT_I = TI.item;

const mesBr = (ref: string | null) => (ref ? ref.split('-').reverse().join('/') : '—');
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Belem',
    dateStyle: 'short',
    timeStyle: 'short',
  });

function useAcao() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  function executar(fn: () => Promise<Resultado>, sucesso: string, depois?: () => void) {
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(sucesso);
      depois?.();
      router.refresh();
    });
  }
  return { pendente, executar, router };
}

/** Um aviso da seção (contrato sem Anexo V, SINAPI atrasado), em laranja. */
function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-orange-300/70 bg-orange-50/80 p-3 text-sm text-orange-950 dark:border-orange-700/50 dark:bg-orange-950/30 dark:text-orange-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Envio do CSV
// ---------------------------------------------------------------------------

type RecusaEnvio = {
  error: string;
  colunasFaltando?: string[];
  linhas?: { linha: number; motivo: string }[];
};

function LayoutCsv({ tipo }: { tipo: TipoImportacaoMaterial }) {
  const layout = tipo === 'anexo_v' ? COLUNAS_ANEXO_V : COLUNAS_SINAPI;
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">{TI.layout.titulo}</p>
      <p className="mt-1">
        {TI.layout.csv} <span className="font-mono">{layout.obrigatorias.join(' ; ')}</span>
        {layout.opcionais.length > 0 && (
          <>
            {' '}
            · {TI.layout.opcional} <span className="font-mono">{layout.opcionais.join(' ; ')}</span>
          </>
        )}
        {TI.layout.cabecalho}
      </p>
      {tipo === 'anexo_v' ? (
        <p className="mt-1">{TI.layout.anexo}</p>
      ) : (
        <p className="mt-1">{TI.layout.sinapi}</p>
      )}
    </div>
  );
}

function EnviarCsv({
  tipo,
  contratos,
  bloqueado,
}: {
  tipo: TipoImportacaoMaterial;
  contratos?: ContratoAnexoV[];
  bloqueado: boolean;
}) {
  const router = useRouter();
  const [contratoId, setContratoId] = useState('');
  const [referencia, setReferencia] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recusa, setRecusa] = useState<RecusaEnvio | null>(null);
  const idArquivo = `csv-${tipo}`;

  async function enviar() {
    setRecusa(null);
    if (!arquivo) {
      setRecusa({ error: TE.semArquivo });
      return;
    }
    const form = new FormData();
    form.set('tipo', tipo);
    form.set('arquivo', arquivo);
    if (tipo === 'anexo_v') form.set('contratoId', contratoId);
    else form.set('referencia', referencia);
    setEnviando(true);
    try {
      const resp = await fetch('/api/material/importacoes', { method: 'POST', body: form });
      const corpo = (await resp.json().catch(() => ({}))) as Partial<RecusaEnvio>;
      if (!resp.ok) {
        setRecusa({
          error: corpo.error ?? TE.falhou,
          colunasFaltando: corpo.colunasFaltando,
          linhas: corpo.linhas,
        });
        return;
      }
      toast.success(TE.lido);
      setArquivo(null);
      router.refresh();
    } catch {
      setRecusa({ error: TE.falhouTente });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section
      aria-labelledby={`enviar-${tipo}`}
      className={cn(CARTAO_CADASTRO, 'space-y-3 p-4 sm:p-5')}
    >
      <h3 id={`enviar-${tipo}`} className="text-sm font-semibold">
        {tipo === 'anexo_v' ? TE.tituloAnexo : TE.tituloSinapi}
      </h3>
      <LayoutCsv tipo={tipo} />
      {bloqueado ? (
        <p className="text-sm text-muted-foreground">{TE.bloqueado}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          {tipo === 'anexo_v' ? (
            <div className="space-y-1">
              <Label htmlFor="imp-contrato">{TE.contrato}</Label>
              <Select value={contratoId || undefined} onValueChange={setContratoId}>
                <SelectTrigger id="imp-contrato" className="w-full">
                  <SelectValue placeholder={TE.escolhaContrato} />
                </SelectTrigger>
                <SelectContent>
                  {(contratos ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.numero} · {c.empresa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="imp-mes">{TE.mes}</Label>
              <Input
                id="imp-mes"
                type="month"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor={idArquivo}>{TE.arquivo}</Label>
            <Input
              id={idArquivo}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button variant="gradiente" onClick={enviar} disabled={enviando} className="gap-2">
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileUp className="h-4 w-4" aria-hidden="true" />
            )}
            {TE.botao}
          </Button>
        </div>
      )}
      {recusa && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300/60 bg-rose-50/70 p-3 text-sm text-rose-900 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-100"
        >
          <p className="font-medium">{recusa.error}</p>
          {recusa.linhas && recusa.linhas.length > 0 && (
            <ul className="mt-1 list-disc pl-6">
              {recusa.linhas.map((l) => (
                <li key={`${l.linha}-${l.motivo}`}>{TE.linha(l.linha, l.motivo)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Revisão da importação aberta
// ---------------------------------------------------------------------------

const ROTULO_CAMPO = TI.campo;

function valorCampo(campo: string, v: string | number | null): string {
  if (v == null || v === '') return 'vazio';
  if (campo === 'precoCentavos') return formatarReais(Number(v));
  if (campo === 'quantidadeEstimada') return formatarQuantidade(Number(v));
  return String(v);
}

/** O valor antigo riscado ao lado do novo (spec 0021, AC-22), lido também pelo leitor de tela. */
function Mudanca({ m }: { m: MudancaRevisao }) {
  return (
    <span className="block">
      <span className="text-muted-foreground">{ROTULO_CAMPO[m.campo] ?? m.campo}</span>{' '}
      <span className="sr-only">de </span>
      <del className="text-muted-foreground">{valorCampo(m.campo, m.antes)}</del>{' '}
      <span aria-hidden="true">→</span>
      <span className="sr-only"> para</span> <strong>{valorCampo(m.campo, m.depois)}</strong>
    </span>
  );
}

type Grupo = 'novos' | 'alterados' | 'removidos';

function RevisaoAberta({ imp }: { imp: ImportacaoAberta }) {
  const { pendente, executar } = useAcao();
  const anexo = imp.tipo === 'anexo_v';
  const grupos: { chave: Grupo; titulo: string; total: number }[] = [
    { chave: 'novos', titulo: R.novos, total: imp.resumo.novos },
    { chave: 'alterados', titulo: R.alterados, total: imp.resumo.alterados },
    {
      chave: 'removidos',
      titulo: anexo ? R.removidosAnexo : R.removidosSinapi,
      total: imp.resumo.removidos,
    },
  ];
  const [grupo, setGrupo] = useState<Grupo>(
    () =>
      (['alterados', 'novos', 'removidos'] as const).find((g) => imp.resumo[g] > 0) ?? 'alterados',
  );
  const titulo = anexo
    ? `Anexo V do contrato ${imp.contratoNumero ?? '—'}`
    : `SINAPI de ${mesBr(imp.referencia)}`;
  const contraQue = anexo
    ? imp.versaoBase
      ? `comparado com a versão ${imp.versaoBase}, a vigente`
      : 'primeira importação deste contrato'
    : imp.comparadoCom
      ? `comparado com ${mesBr(imp.comparadoCom)}, o mês mais recente (só para leitura)`
      : 'primeiro mês importado';
  const linhas = imp.revisao?.[grupo] ?? [];
  const total = imp.resumo[grupo];
  const semMudanca =
    grupo === 'novos' ? (anexo ? R.entra : R.novoNoMes) : anexo ? R.sai : R.foraDoMes;

  return (
    <section
      aria-labelledby={`rev-${imp.id}`}
      className={cn(CARTAO_CADASTRO, 'overflow-hidden border-indigo-200 dark:border-indigo-800/60')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-indigo-50/60 px-4 py-4 dark:bg-indigo-950/20 sm:px-5">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`rev-${imp.id}`} className="text-[15px] font-semibold">
              {R.titulo}: {titulo}
            </h3>
            <Badge variant="outline">
              {imp.estado === 'aplicando' ? 'Aplicação parada' : 'Pendente'}
            </Badge>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {imp.arquivoNome} · enviado por {imp.enviadaPor} em {dataHora(imp.criadaEm)} ·{' '}
            {contraQue}.
            {imp.estado === 'pendente' && ` Expira sem aplicar em ${dataHora(imp.expiraEm)}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {imp.estado === 'pendente' && (
            <Button
              variant="ghost"
              disabled={pendente}
              onClick={() =>
                executar(() => descartarImportacaoAction({ importacaoId: imp.id }), TR.descartada)
              }
            >
              {TR.descartar}
            </Button>
          )}
          <Button
            variant="gradiente"
            disabled={pendente}
            className="gap-2"
            onClick={() =>
              executar(
                () => aplicarImportacaoAction({ importacaoId: imp.id }),
                anexo ? TR.aplicadoAnexo : TR.aplicadoSinapi,
              )
            }
          >
            {pendente ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : imp.estado === 'aplicando' ? (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            ) : null}
            {imp.estado === 'aplicando' ? TR.retomar : anexo ? TR.aplicarAnexo : TR.aplicarSinapi}
          </Button>
        </div>
      </div>

      {imp.estado === 'aplicando' && (
        <p className="flex items-center gap-2 px-4 pt-4 text-sm text-orange-900 dark:text-orange-100 sm:px-5">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {TR.parada}
        </p>
      )}

      <div
        role="group"
        aria-label={R.filtros}
        className="grid grid-cols-3 gap-2 px-4 py-4 sm:gap-3 sm:px-5"
      >
        {grupos.map((g) => (
          <button
            key={g.chave}
            type="button"
            aria-pressed={grupo === g.chave}
            onClick={() => setGrupo(g.chave)}
            className={cn(
              'flex min-h-11 flex-col items-start gap-0.5 rounded-xl border bg-card p-3 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              grupo === g.chave
                ? 'border-indigo-400 ring-1 ring-indigo-400 dark:border-indigo-500 dark:ring-indigo-500'
                : 'border-border/60 hover:bg-muted/50',
            )}
          >
            <span className="text-xs text-muted-foreground">{g.titulo}</span>
            <span
              className={cn(
                'text-xl font-bold tabular-nums sm:text-2xl',
                g.chave === 'removidos' && g.total > 0 && 'text-orange-800 dark:text-orange-300',
              )}
            >
              {g.total}
            </span>
          </button>
        ))}
      </div>

      {total === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-5">{R.vazio}</p>
      ) : (
        <>
          <CaixaRolavel rotulo={grupos.find((g) => g.chave === grupo)!.titulo}>
            <Table className="min-w-[36rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24 pl-4 sm:pl-5">{anexo ? R.numero : R.codigo}</TableHead>
                  <TableHead>{R.item}</TableHead>
                  <TableHead>{R.oQueMuda}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.chave}>
                    <TableCell className="pl-4 font-mono text-[13px] sm:pl-5">{l.chave}</TableCell>
                    <TableCell className="whitespace-normal">{l.descricao}</TableCell>
                    <TableCell className="whitespace-normal text-sm">
                      {l.mudancas?.length ? (
                        l.mudancas.map((m) => <Mudanca key={m.campo} m={m} />)
                      ) : (
                        <span className="text-muted-foreground">{semMudanca}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CaixaRolavel>
          {total > linhas.length && (
            <p className="px-4 py-3 text-xs text-muted-foreground sm:px-5">
              {R.mostrando(linhas.length, total)}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Seção do Anexo V
// ---------------------------------------------------------------------------

type DialogoItem =
  | { tipo: 'marca'; item: ItemAnexoVLinha; marcar: boolean; motivo: string }
  | { tipo: 'codigo'; item: ItemAnexoVLinha; codigo: string; motivo: string };

function ItensDoContrato({
  contrato,
  percentual,
  mes,
  onEditar,
}: {
  contrato: ContratoAnexoV;
  percentual: number;
  mes: string | null;
  onEditar: (d: DialogoItem) => void;
}) {
  const marcados = contrato.itens.filter((i) => i.automatica || i.manual).length;
  return (
    <details className={cn(CARTAO_CADASTRO, 'p-4 sm:p-5')} open={contrato.itens.length <= 30}>
      <summary className="cursor-pointer">
        <span className="font-medium">
          Contrato {contrato.numero} · {contrato.empresa}
        </span>{' '}
        <span className="text-sm text-muted-foreground">
          · versão {contrato.versao} · {contrato.itens.length} itens · {marcados} na conferência
          obrigatória
          {contrato.atualizadoEm && ` · aplicada em ${dataHora(contrato.atualizadoEm)}`}
        </span>
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        A marca automática compara o preço com o SINAPI de {mesBr(mes)} e o percentual de{' '}
        {percentual}%; ela muda sozinha quando entra um mês novo. A marca do Admin fica até ser
        tirada.
      </p>
      <div className="mt-3 overflow-hidden rounded-xl border border-border/50">
        <CaixaRolavel rotulo={`Itens do contrato ${contrato.numero}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{TI.tabela.numero}</TableHead>
                <TableHead>{TI.tabela.descricao}</TableHead>
                <TableHead className="text-right">{TI.tabela.quantidade}</TableHead>
                <TableHead className="text-right">{TI.tabela.preco}</TableHead>
                <TableHead>{TI.tabela.sinapi}</TableHead>
                <TableHead>{TI.tabela.conferencia}</TableHead>
                <TableHead className="text-right">{TI.tabela.acoes}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contrato.itens.map((i) => {
                const marca = textoMarcaAnomalia(i);
                return (
                  <TableRow key={i.id}>
                    <TableCell className="tabular-nums">{i.numero}</TableCell>
                    <TableCell>
                      <p>{i.descricao}</p>
                      <p className="text-xs text-muted-foreground">{i.unidade}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarQuantidade(i.quantidadeEstimada)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarReais(i.precoCentavos)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {i.sinapiCodigo ? (
                        <>
                          <span className="font-mono">{i.sinapiCodigo}</span>
                          <span className="block text-xs text-muted-foreground">
                            {i.sinapiPrecoCentavos != null
                              ? formatarReais(i.sinapiPrecoCentavos)
                              : TI.tabela.foraDoMes}
                          </span>
                        </>
                      ) : (
                        <span className="text-orange-800 dark:text-orange-300">
                          {TI.tabela.semCodigo}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {marca ? (
                        <Badge
                          variant="outline"
                          className="border-orange-300 text-orange-900 dark:text-orange-200"
                          title={i.motivoManual ?? undefined}
                        >
                          {marca}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${i.manual ? TT_I.desmarcar : TT_I.marcar} o item ${i.numero}`}
                          onClick={() =>
                            onEditar({ tipo: 'marca', item: i, marcar: !i.manual, motivo: '' })
                          }
                        >
                          {i.manual ? TT_I.desmarcar : TT_I.marcar}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Código SINAPI do item ${i.numero}`}
                          onClick={() =>
                            onEditar({
                              tipo: 'codigo',
                              item: i,
                              codigo: i.sinapiCodigo ?? '',
                              motivo: '',
                            })
                          }
                        >
                          {TT_I.codigo}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CaixaRolavel>
      </div>
    </details>
  );
}

export function AbaAnexoV({
  tabelas,
  contratosSemAnexo,
  itensSemCodigo,
}: {
  tabelas: TabelasPreco;
  contratosSemAnexo: string[];
  itensSemCodigo: ItemSemCodigo[];
}) {
  const { pendente, executar } = useAcao();
  const [dialogo, setDialogo] = useState<DialogoItem | null>(null);
  const aberta = tabelas.abertas.find((a) => a.tipo === 'anexo_v');
  const comAnexo = tabelas.contratos.filter((c) => c.versao != null);

  function confirmar() {
    if (!dialogo) return;
    if (dialogo.tipo === 'marca') {
      executar(
        () =>
          marcarAnomaliaAction({
            anexoVItemId: dialogo.item.id,
            marcada: dialogo.marcar,
            motivo: dialogo.motivo,
          }),
        dialogo.marcar ? TT_I.marcado : TT_I.desmarcado,
        () => setDialogo(null),
      );
    } else {
      executar(
        () =>
          corrigirCodigoSinapiAction({
            anexoVItemId: dialogo.item.id,
            codigo: dialogo.codigo.trim() === '' ? null : dialogo.codigo,
            motivo: dialogo.motivo,
          }),
        TT_I.codigoCorrigido,
        () => setDialogo(null),
      );
    }
  }

  return (
    <section aria-label={ROTULO_SECAO_CADASTRO['anexo-v']} className="space-y-4">
      <CabecalhoSecao
        titulo={ROTULO_SECAO_CADASTRO['anexo-v']}
        descricao="Os itens pactuados de cada contrato, com o preço e o código SINAPI de referência. Cada importação vira uma versão nova."
      />
      {contratosSemAnexo.map((n) => (
        <Aviso key={n}>{TT.contratoSemAnexo(n)}</Aviso>
      ))}
      {aberta && <RevisaoAberta imp={aberta} />}
      <EnviarCsv tipo="anexo_v" contratos={tabelas.contratos} bloqueado={!!aberta} />
      {itensSemCodigo.length > 0 && (
        <details className={cn(CARTAO_CADASTRO, 'p-4 text-sm sm:p-5')}>
          <summary className="cursor-pointer font-medium">
            {TT.semCodigoLista(itensSemCodigo.length)}
          </summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-6 text-muted-foreground">
            {itensSemCodigo.map((i) => (
              <li key={`${i.contrato}-${i.numero}`}>
                Contrato {i.contrato}, item {i.numero}: {i.descricao}
              </li>
            ))}
          </ul>
        </details>
      )}
      {comAnexo.length === 0 ? (
        <p className="text-sm text-muted-foreground">{TT.semAnexo}</p>
      ) : (
        comAnexo.map((c) => (
          <ItensDoContrato
            key={c.id}
            contrato={c}
            percentual={tabelas.percentualSinapi}
            mes={tabelas.mesMaisRecente}
            onEditar={setDialogo}
          />
        ))
      )}

      <Dialog open={!!dialogo} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialogo?.tipo === 'codigo'
                ? TT_I.tituloCodigo(dialogo.item.numero)
                : dialogo?.marcar
                  ? TT_I.tituloMarcar(dialogo.item.numero)
                  : TT_I.tituloDesmarcar(dialogo?.item.numero ?? 0)}
            </DialogTitle>
            <DialogDescription>
              {dialogo?.tipo === 'codigo' ? TT_I.efeitoCodigo : TT_I.efeitoMarca}
            </DialogDescription>
          </DialogHeader>
          {dialogo?.tipo === 'codigo' && (
            <div className="space-y-1.5">
              <Label htmlFor="codigo-sinapi">{TT_I.campoCodigo}</Label>
              <Input
                id="codigo-sinapi"
                inputMode="numeric"
                value={dialogo.codigo}
                onChange={(e) => setDialogo({ ...dialogo, codigo: e.target.value })}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="motivo-item">{TT_I.motivo}</Label>
            <Textarea
              id="motivo-item"
              value={dialogo?.motivo ?? ''}
              maxLength={TEXTO_CURTO_MAX}
              aria-describedby="motivo-item-ajuda"
              onChange={(e) => dialogo && setDialogo({ ...dialogo, motivo: e.target.value })}
            />
            <p id="motivo-item-ajuda" className="text-xs text-muted-foreground">
              {TT_I.tamanhoMotivo(TEXTO_CURTO_MIN, TEXTO_CURTO_MAX)}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={pendente}>
              {ROTULO_FECHAR_DIALOGO}
            </Button>
            <Button variant="gradiente" onClick={confirmar} disabled={pendente}>
              {TT_I.confirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Seção do SINAPI
// ---------------------------------------------------------------------------

export function AbaSinapi({ tabelas, atrasado }: { tabelas: TabelasPreco; atrasado: boolean }) {
  const aberta = tabelas.abertas.find((a) => a.tipo === 'sinapi');
  return (
    <section aria-label={ROTULO_SECAO_CADASTRO.sinapi} className="space-y-4">
      <CabecalhoSecao
        titulo={ROTULO_SECAO_CADASTRO.sinapi}
        descricao="Os insumos da Caixa, um mês por importação. A cotação usa sempre o mês mais recente."
      />
      {atrasado && tabelas.mesMaisRecente && <Aviso>{TT.atrasado(tabelas.mesMaisRecente)}</Aviso>}
      {aberta && <RevisaoAberta imp={aberta} />}
      <EnviarCsv tipo="sinapi" bloqueado={!!aberta} />
      <section aria-labelledby="meses-sinapi" className={cn(CARTAO_CADASTRO, 'px-4 py-2 sm:px-5')}>
        <h3 id="meses-sinapi" className="sr-only">
          Meses importados
        </h3>
        {tabelas.meses.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{TT.semMes}</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {tabelas.meses.map((m) => (
              <li
                key={m.referencia}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className={cn(m.referencia === tabelas.mesMaisRecente && 'font-semibold')}>
                    {mesCurto(m.referencia)}
                  </span>
                  {m.referencia === tabelas.mesMaisRecente && (
                    <Badge
                      variant="outline"
                      className="border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200"
                    >
                      {TT.emUso}
                    </Badge>
                  )}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {m.quantidade} insumos · aplicado em {dataHora(m.em)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
