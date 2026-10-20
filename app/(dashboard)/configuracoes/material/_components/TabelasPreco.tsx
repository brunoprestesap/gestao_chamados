'use client';

import { AlertTriangle, FileUp, Loader2, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type {
  ContratoAnexoV,
  ImportacaoAberta,
  ItemAnexoVLinha,
  TabelasPreco,
} from '@/lib/material/tabelas';
import { formatarQuantidade, formatarReais } from '@/shared/chamados/custo';
import {
  COLUNAS_ANEXO_V,
  COLUNAS_SINAPI,
  TEXTO_CURTO_MAX,
  TEXTO_CURTO_MIN,
  type TipoImportacaoMaterial,
} from '@/shared/material/material.constants';
import { textoMarcaAnomalia } from '@/shared/material/mensagens';

import {
  aplicarImportacaoAction,
  corrigirCodigoSinapiAction,
  descartarImportacaoAction,
  marcarAnomaliaAction,
} from '../actions';

type Resultado = { ok: true } | { ok: false; error: string };

const SELECT =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
      <p className="font-medium text-foreground">Layout do arquivo</p>
      <p className="mt-1">
        CSV separado por ponto e vírgula, como o Excel em português grava. Colunas obrigatórias:{' '}
        <span className="font-mono">{layout.obrigatorias.join(' ; ')}</span>
        {layout.opcionais.length > 0 && (
          <>
            {' '}
            · opcional: <span className="font-mono">{layout.opcionais.join(' ; ')}</span>
          </>
        )}
        . O cabeçalho pode estar em qualquer uma das 20 primeiras linhas, e colunas a mais são
        ignoradas. Preço com vírgula decimal e até 2 casas (R$ opcional).
      </p>
      {tipo === 'anexo_v' ? (
        <p className="mt-1">
          ITEM de 1 a 200, sem repetir. CODIGO_SINAPI vazio mantém o código da versão anterior.
        </p>
      ) : (
        <p className="mt-1">
          Converta a planilha da Caixa (UF AP, não desonerado) e dê à coluna de preço do AP o nome
          PRECO. Um mês por arquivo; mês já importado não entra de novo.
        </p>
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
      setRecusa({ error: 'Escolha o arquivo CSV.' });
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
          error: corpo.error ?? 'Não foi possível enviar o arquivo.',
          colunasFaltando: corpo.colunasFaltando,
          linhas: corpo.linhas,
        });
        return;
      }
      toast.success('Arquivo lido. Confira a revisão antes de aplicar.');
      setArquivo(null);
      router.refresh();
    } catch {
      setRecusa({ error: 'Não foi possível enviar o arquivo. Tente de novo.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section
      aria-labelledby={`enviar-${tipo}`}
      className="space-y-3 rounded-2xl border border-border/50 p-4"
    >
      <h3 id={`enviar-${tipo}`} className="text-sm font-semibold">
        {tipo === 'anexo_v' ? 'Importar o Anexo V de um contrato' : 'Importar um mês do SINAPI'}
      </h3>
      <LayoutCsv tipo={tipo} />
      {bloqueado ? (
        <p className="text-sm text-muted-foreground">
          Há uma importação deste tipo aberta. Aplique ou descarte a que está em revisão antes de
          enviar outra.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          {tipo === 'anexo_v' ? (
            <div className="space-y-1">
              <Label htmlFor="imp-contrato">Contrato</Label>
              <select
                id="imp-contrato"
                className={SELECT}
                value={contratoId}
                onChange={(e) => setContratoId(e.target.value)}
              >
                <option value="">Escolha o contrato</option>
                {(contratos ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} · {c.empresa}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="imp-mes">Mês de referência</Label>
              <Input
                id="imp-mes"
                type="month"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor={idArquivo}>Arquivo CSV</Label>
            <Input
              id={idArquivo}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button onClick={enviar} disabled={enviando} className="gap-2">
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileUp className="h-4 w-4" aria-hidden="true" />
            )}
            Enviar para revisão
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
                <li key={`${l.linha}-${l.motivo}`}>
                  Linha {l.linha}: {l.motivo}
                </li>
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

const ROTULO_CAMPO: Record<string, string> = {
  descricao: 'descrição',
  unidade: 'unidade',
  quantidadeEstimada: 'quantidade estimada',
  precoCentavos: 'preço',
  sinapiCodigo: 'código SINAPI',
};

function valorCampo(campo: string, v: string | number | null): string {
  if (v == null || v === '') return 'vazio';
  if (campo === 'precoCentavos') return formatarReais(Number(v));
  if (campo === 'quantidadeEstimada') return formatarQuantidade(Number(v));
  return String(v);
}

function RevisaoAberta({ imp }: { imp: ImportacaoAberta }) {
  const { pendente, executar } = useAcao();
  const titulo =
    imp.tipo === 'anexo_v'
      ? `Anexo V do contrato ${imp.contratoNumero ?? '—'}`
      : `SINAPI de ${mesBr(imp.referencia)}`;
  const contraQue =
    imp.tipo === 'anexo_v'
      ? imp.versaoBase
        ? `comparado com a versão ${imp.versaoBase}, a vigente`
        : 'primeira importação deste contrato'
      : imp.comparadoCom
        ? `comparado com ${mesBr(imp.comparadoCom)}, o mês mais recente (só para leitura)`
        : 'primeiro mês importado';
  const grupos = [
    { chave: 'novos', titulo: 'Novos', linhas: imp.revisao?.novos ?? [], total: imp.resumo.novos },
    {
      chave: 'alterados',
      titulo: 'Alterados',
      linhas: imp.revisao?.alterados ?? [],
      total: imp.resumo.alterados,
    },
    {
      chave: 'removidos',
      titulo: imp.tipo === 'anexo_v' ? 'Removidos (saem da versão nova)' : 'Fora deste mês',
      linhas: imp.revisao?.removidos ?? [],
      total: imp.resumo.removidos,
    },
  ];

  return (
    <section
      aria-labelledby={`rev-${imp.id}`}
      className="space-y-3 rounded-2xl border border-indigo-300/60 bg-indigo-50/40 p-4 dark:border-indigo-700/50 dark:bg-indigo-950/20"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`rev-${imp.id}`} className="text-sm font-semibold">
          Revisão: {titulo}
        </h3>
        <Badge variant="outline">
          {imp.estado === 'aplicando' ? 'Aplicação parada' : 'Pendente'}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {imp.arquivoNome} · enviado por {imp.enviadaPor} em {dataHora(imp.criadaEm)} · {contraQue}.
        {imp.estado === 'pendente' && ` Expira sem aplicar em ${dataHora(imp.expiraEm)}.`}
      </p>
      <p className="text-sm">
        {imp.resumo.total} linhas · {imp.resumo.novos} novos · {imp.resumo.alterados} alterados ·{' '}
        {imp.resumo.removidos} {imp.tipo === 'anexo_v' ? 'removidos' : 'fora deste mês'}
      </p>
      {imp.estado === 'aplicando' ? (
        <p className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />A aplicação parou no meio. Aplicar
          de novo continua de onde parou, sem duplicar nada.
        </p>
      ) : null}
      {grupos.map((g) =>
        g.total === 0 ? null : (
          <details key={g.chave} className="rounded-xl border border-border/60 bg-background p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {g.titulo} ({g.total}){g.total > g.linhas.length && ` · mostrando ${g.linhas.length}`}
            </summary>
            <ul className="mt-2 space-y-1 text-xs">
              {g.linhas.map((l) => (
                <li key={l.chave}>
                  <span className="font-mono">{l.chave}</span> · {l.descricao}
                  {l.mudancas && (
                    <span className="text-muted-foreground">
                      {' '}
                      ·{' '}
                      {l.mudancas
                        .map(
                          (m) =>
                            `${ROTULO_CAMPO[m.campo] ?? m.campo}: de ${valorCampo(m.campo, m.antes)} para ${valorCampo(m.campo, m.depois)}`,
                        )
                        .join('; ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ),
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pendente}
          className="gap-2"
          onClick={() =>
            executar(
              () => aplicarImportacaoAction({ importacaoId: imp.id }),
              imp.tipo === 'anexo_v' ? 'Anexo V aplicado.' : 'Mês do SINAPI aplicado.',
            )
          }
        >
          {pendente ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : imp.estado === 'aplicando' ? (
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          ) : null}
          {imp.estado === 'aplicando' ? 'Retomar a aplicação' : 'Aplicar'}
        </Button>
        {imp.estado === 'pendente' && (
          <Button
            variant="outline"
            disabled={pendente}
            onClick={() =>
              executar(
                () => descartarImportacaoAction({ importacaoId: imp.id }),
                'Importação descartada.',
              )
            }
          >
            Descartar
          </Button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Aba do Anexo V
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
    <details className="rounded-2xl border border-border/50 p-4" open={contrato.itens.length <= 30}>
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
      <div className="mt-3 overflow-x-auto rounded-xl border border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Nº</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Qtd. estimada</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead>SINAPI</TableHead>
              <TableHead>Conferência</TableHead>
              <TableHead className="text-right">Ações</TableHead>
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
                            : 'fora do mês mais recente'}
                        </span>
                      </>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-300">sem código</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {marca ? (
                      <Badge
                        variant="outline"
                        className="border-amber-300 text-amber-800 dark:text-amber-200"
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
                        onClick={() =>
                          onEditar({ tipo: 'marca', item: i, marcar: !i.manual, motivo: '' })
                        }
                      >
                        {i.manual ? 'Desmarcar' : 'Marcar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          onEditar({
                            tipo: 'codigo',
                            item: i,
                            codigo: i.sinapiCodigo ?? '',
                            motivo: '',
                          })
                        }
                      >
                        Código
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}

export function AbaAnexoV({ tabelas }: { tabelas: TabelasPreco }) {
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
        dialogo.marcar ? 'Item marcado para conferência.' : 'Marca tirada.',
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
        'Código SINAPI corrigido.',
        () => setDialogo(null),
      );
    }
  }

  return (
    <div className="space-y-4">
      {aberta && <RevisaoAberta imp={aberta} />}
      <EnviarCsv tipo="anexo_v" contratos={tabelas.contratos} bloqueado={!!aberta} />
      {comAnexo.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum contrato tem Anexo V carregado. Sem ele, a cotação não oferece o caminho 1.
        </p>
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
                ? `Código SINAPI do item ${dialogo.item.numero}`
                : dialogo?.marcar
                  ? `Marcar o item ${dialogo?.item.numero} para conferência`
                  : `Tirar a marca do item ${dialogo?.item.numero}`}
            </DialogTitle>
            <DialogDescription>
              {dialogo?.tipo === 'codigo'
                ? 'O código antigo e o motivo ficam no histórico do item, e a marca automática é recalculada.'
                : 'Com a marca, o fiscal só encaminha a cotação que usa este item depois de registrar a conferência. O motivo fica no histórico.'}
            </DialogDescription>
          </DialogHeader>
          {dialogo?.tipo === 'codigo' && (
            <div className="space-y-1.5">
              <Label htmlFor="codigo-sinapi">Código SINAPI (vazio tira o código)</Label>
              <Input
                id="codigo-sinapi"
                inputMode="numeric"
                value={dialogo.codigo}
                onChange={(e) => setDialogo({ ...dialogo, codigo: e.target.value })}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="motivo-item">Motivo</Label>
            <Textarea
              id="motivo-item"
              value={dialogo?.motivo ?? ''}
              maxLength={TEXTO_CURTO_MAX}
              onChange={(e) => dialogo && setDialogo({ ...dialogo, motivo: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              De {TEXTO_CURTO_MIN} a {TEXTO_CURTO_MAX} caracteres.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)} disabled={pendente}>
              Voltar
            </Button>
            <Button onClick={confirmar} disabled={pendente}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba do SINAPI
// ---------------------------------------------------------------------------

export function AbaSinapi({ tabelas }: { tabelas: TabelasPreco }) {
  const aberta = tabelas.abertas.find((a) => a.tipo === 'sinapi');
  return (
    <div className="space-y-4">
      {aberta && <RevisaoAberta imp={aberta} />}
      <EnviarCsv tipo="sinapi" bloqueado={!!aberta} />
      <section aria-labelledby="meses-sinapi" className="space-y-2">
        <h3 id="meses-sinapi" className="text-sm font-semibold">
          Meses importados
        </h3>
        {tabelas.meses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum mês importado. Sem SINAPI, a cotação não oferece o caminho 2.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {tabelas.meses.map((m) => (
              <li key={m.referencia}>
                <span className="font-medium">{mesBr(m.referencia)}</span> · {m.quantidade} insumos
                · aplicado em {dataHora(m.em)}
                {m.referencia === tabelas.mesMaisRecente && (
                  <Badge variant="outline" className="ml-2">
                    mais recente
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
