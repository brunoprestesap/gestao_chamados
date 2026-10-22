'use client';

import { CircleCheck, ClipboardCheck, Loader2, Paperclip } from 'lucide-react';
import { type ReactNode, useCallback, useState, useTransition } from 'react';
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
import type { CotacaoDTO } from '@/lib/material/serializar';
import { cn } from '@/lib/utils';
import { PRAZO_ATESTE_DIAS } from '@/shared/material/material.constants';
import { TEXTO_ATESTE as T } from '@/shared/material/mensagens';

import { registrarRecebimentoAction, removerArquivoAction } from '../actions';
import { diaEmBelem, DialogNotaFiscal } from './ateste/DialogNotaFiscal';
import { TabelaAplicado } from './ateste/TabelaAplicado';

/** O que o painel "Sua vez" pede ao ateste: o diálogo de cada registro. */
export type PedidoAteste = 'provisorio' | 'definitivo' | 'nota_fiscal';

/** O ateste aparece da execução em diante, só para o TRF1 e a contratada. */
export function atesteVisivel(c: CotacaoDTO): boolean {
  return (
    (c.situacao === 'executada' || c.situacao === 'atestada') &&
    (c.visao === 'trf1' || c.visao === 'contratada')
  );
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Belem',
    dateStyle: 'short',
    timeStyle: 'short',
  });

const dataCurta = (dia: string) => dia.split('-').reverse().join('/');

/** Dias corridos de `venceEm` até hoje, em Belém; os dois em `YYYY-MM-DD`. */
function diasDeAtraso(venceEm: string): number {
  return Math.round((Date.parse(diaEmBelem()) - Date.parse(venceEm)) / 86_400_000);
}

type Estado = 'feito' | 'agora' | 'atrasado' | 'depois';

const COR_ESTADO: Record<Estado, { caixa: string; rotulo: string }> = {
  feito: {
    caixa: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-950/20',
    rotulo: 'text-emerald-800 dark:text-emerald-300',
  },
  agora: {
    caixa: 'border-indigo-200 bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-indigo-950/30',
    rotulo: 'text-indigo-800 dark:text-indigo-300',
  },
  atrasado: {
    caixa: 'border-orange-200 bg-orange-50 dark:border-orange-800/60 dark:bg-orange-950/30',
    rotulo: 'text-orange-800 dark:text-orange-300',
  },
  depois: { caixa: 'border-border/60', rotulo: 'text-muted-foreground' },
};

function Etapa({
  n,
  titulo,
  estado,
  rotulo,
  children,
}: {
  n: number;
  titulo: string;
  estado: Estado;
  rotulo: string;
  children: ReactNode;
}) {
  const cor = COR_ESTADO[estado];
  return (
    <li
      aria-current={estado === 'agora' || estado === 'atrasado' ? 'step' : undefined}
      className={cn('flex flex-col gap-1.5 rounded-xl border p-4', cor.caixa)}
    >
      <span
        className={cn(
          'flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase',
          cor.rotulo,
        )}
      >
        {estado === 'feito' && <CircleCheck className="size-3.5" aria-hidden="true" />}
        {n} · {rotulo}
      </span>
      <span className="text-[15px] font-semibold">{titulo}</span>
      <div className="space-y-1 text-[13px] text-muted-foreground">{children}</div>
    </li>
  );
}

/**
 * O estado da etapa em aberto: o prazo e o atraso saem de `prazoAteste`, que
 * só a visão TRF1 recebe (AC-21 da 0019); a contratada vê só que espera.
 */
function etapaEmAberto(
  c: CotacaoDTO,
  etapa: 'provisorio' | 'definitivo',
): { estado: Estado; rotulo: string; prazo: string | null } {
  const prazo = c.prazoAteste?.etapa === etapa ? c.prazoAteste : null;
  if (!prazo) return { estado: 'agora', rotulo: T.estadoAgora, prazo: null };
  if (prazo.atrasado) {
    return {
      estado: 'atrasado',
      rotulo: T.estadoAtrasado(diasDeAtraso(prazo.venceEm)),
      prazo: T.prazoEra(dataCurta(prazo.venceEm)),
    };
  }
  return { estado: 'agora', rotulo: T.estadoAgora, prazo: T.prazoAte(dataCurta(prazo.venceEm)) };
}

function EtapasAteste({ cotacao: c }: { cotacao: CotacaoDTO }) {
  const trf1 = c.visao === 'trf1';
  const provisorio = c.recebimentoProvisorio;
  const definitivo = c.recebimentoDefinitivo;
  const nota = c.notaFiscal;
  const aberto = (etapa: 'provisorio' | 'definitivo', ajuda: string) => {
    const e = etapaEmAberto(c, etapa);
    return (
      <Etapa
        n={etapa === 'provisorio' ? 1 : 2}
        titulo={etapa === 'provisorio' ? T.provisorio : T.definitivo}
        estado={e.estado}
        rotulo={e.rotulo}
      >
        {e.prazo && <p>{e.prazo}</p>}
        <p>{trf1 ? ajuda : T.esperaTrf1}</p>
      </Etapa>
    );
  };

  return (
    <ol aria-label={T.etapas} className="grid gap-3 sm:grid-cols-3">
      {provisorio ? (
        <Etapa n={1} titulo={T.provisorio} estado="feito" rotulo={T.estadoFeito}>
          <p>{T.registradoEm(dataHora(provisorio.em), provisorio.porNome)}</p>
        </Etapa>
      ) : (
        aberto('provisorio', T.provisorioAjuda)
      )}

      {definitivo ? (
        <Etapa n={2} titulo={T.definitivo} estado="feito" rotulo={T.estadoFeito}>
          <p>{T.registradoEm(dataHora(definitivo.em), definitivo.porNome)}</p>
        </Etapa>
      ) : provisorio ? (
        aberto('definitivo', T.definitivoAjuda)
      ) : (
        <Etapa n={2} titulo={T.definitivo} estado="depois" rotulo={T.estadoDepois}>
          <p>{T.definitivoDepois}</p>
        </Etapa>
      )}

      {nota ? (
        <Etapa n={3} titulo={T.notaFiscal} estado="feito" rotulo={T.estadoFeito}>
          <p>{T.notaRegistrada(nota.numero, dataCurta(nota.data))}</p>
          <a
            href={`/api/cotacoes/arquivos/${nota.arquivoId}`}
            className="inline-flex min-h-6 items-center gap-1 font-medium text-primary hover:underline"
          >
            <Paperclip className="size-3.5" aria-hidden="true" />
            {T.arquivoDaNota}
          </a>
        </Etapa>
      ) : c.situacao === 'atestada' ? (
        <Etapa n={3} titulo={T.notaFiscal} estado="agora" rotulo={T.estadoAgora}>
          <p>{T.notaEsperando}</p>
        </Etapa>
      ) : (
        <Etapa n={3} titulo={T.notaFiscal} estado="depois" rotulo={T.estadoDepois}>
          <p>{T.notaDepois}</p>
        </Etapa>
      )}
    </ol>
  );
}

type Props = {
  cotacao: CotacaoDTO;
  /** O diálogo aberto pelo painel "Sua vez"; o painel só oferece o que `acoes` liberou. */
  pedido: PedidoAteste | null;
  onPedido: (pedido: PedidoAteste | null) => void;
  onAlterado: () => void;
};

/**
 * O ateste da cotação (spec 0019, fatia 2), repaginado pela spec 0021 (AC-9):
 * as três etapas em ordem, o autorizado e o aplicado por item e as
 * evidências. Os registros saem do painel "Sua vez" do detalhe, que abre o
 * diálogo de cada um por `pedido`.
 */
export function AtesteCotacao({ cotacao: c, pedido, onPedido, onAlterado }: Props) {
  // Anexos já removidos nesta tela, até a página recarregar a lista do servidor.
  const [removidos, setRemovidos] = useState<ReadonlySet<string>>(new Set());
  const [pendente, iniciar] = useTransition();

  /**
   * O arquivo enviado e ainda não ligado à nota é removido ao trocar o anexo
   * ou desistir, para uma tentativa recusada não deixar arquivo preso nem
   * gastar o limite de 10 (AC-22). Falha aqui não atrapalha o registro.
   */
  const soltarAnexo = useCallback((arquivoId: string) => {
    setRemovidos((atual) => new Set(atual).add(arquivoId));
    void removerArquivoAction({ arquivoId }).catch(() => undefined);
  }, []);

  if (!atesteVisivel(c)) return null;

  const recebimento = pedido === 'provisorio' || pedido === 'definitivo' ? pedido : null;

  function receber(etapa: 'provisorio' | 'definitivo') {
    iniciar(async () => {
      const r = await registrarRecebimentoAction({ id: c.id, versao: c.versao, etapa });
      if (!r.ok) {
        toast.error(r.error);
        onAlterado();
        return;
      }
      toast.success(etapa === 'provisorio' ? T.okProvisorio : T.okDefinitivo);
      onPedido(null);
      onAlterado();
    });
  }

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="ateste-titulo"
        className="space-y-4 rounded-2xl border border-border/50 bg-card p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="ateste-titulo" className="flex items-center gap-2 text-base font-semibold">
            <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            {T.titulo}
          </h2>
          <p className="text-[13px] text-muted-foreground">{T.regraDoPrazo(PRAZO_ATESTE_DIAS)}</p>
        </div>
        <EtapasAteste cotacao={c} />
      </section>

      <TabelaAplicado cotacao={c} />

      <Dialog open={!!recebimento} onOpenChange={(o) => !o && !pendente && onPedido(null)}>
        <DialogContent className="sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {recebimento === 'definitivo' ? T.tituloDefinitivo : T.tituloProvisorio}
            </DialogTitle>
            <DialogDescription>
              {recebimento === 'definitivo' ? T.descricaoDefinitivo : T.descricaoProvisorio}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onPedido(null)} disabled={pendente}>
              {T.cancelar}
            </Button>
            <Button
              variant="gradiente"
              disabled={pendente}
              onClick={() => recebimento && receber(recebimento)}
            >
              {pendente && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {T.confirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pedido === 'nota_fiscal' && (
        <DialogNotaFiscal
          cotacao={c}
          removidos={removidos}
          onSoltar={soltarAnexo}
          onFechar={() => onPedido(null)}
          onAlterado={onAlterado}
        />
      )}
    </div>
  );
}
