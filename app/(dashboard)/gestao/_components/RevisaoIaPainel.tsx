'use client';

import { AlertTriangle, Gauge, type LucideIcon, User as UserIcon, Wrench } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { confirmarDecisoesIaAction } from '@/app/(dashboard)/gestao/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { DECISAO_CAMPO_LABELS, type DecisaoCampo } from '@/shared/conversas/conversa.constants';

/**
 * O painel "Serviço, prioridade e técnico" do detalhe do chamado (spec 0009,
 * AC-4/AC-5): uma linha por campo, com o que a IA escolheu e a ação de
 * confirmar. Corrigir prioridade e serviço chegam nos marcos 2 e 3; a linha
 * do técnico já abre o `ReatribuirChamadoDialog` que existe desde a spec 0002.
 */

type ValorDecisaoDto = {
  catalogServiceId: string | null;
  subtypeId: string | null;
  tipoServico: string | null;
  prioridade: string | null;
  tecnicoId: string | null;
  rotulo: string;
};

type CorrecaoDto = {
  anterior: ValorDecisaoDto;
  novo: ValorDecisaoDto;
  userNome: string | null;
  origem: 'solicitante' | 'gestao';
  motivo: string;
  em: string;
};

type DecisaoDto = {
  decididoPor: 'ia' | 'regra';
  efeito: 'sugestao' | 'aplicado';
  valorIa: ValorDecisaoDto;
  valorFinal: ValorDecisaoDto;
  confianca: number | null;
  motivo: string;
  situacao: 'sem_revisao' | 'confirmada' | 'corrigida';
  revisadaEm: string | null;
  correcoes: CorrecaoDto[];
};

type CampoDto = {
  campo: DecisaoCampo;
  atual: ValorDecisaoDto;
  decisao: DecisaoDto | null;
  divergente: boolean;
};

const CAMPO_ICON: Record<DecisaoCampo, LucideIcon> = {
  servico: Wrench,
  prioridade: Gauge,
  tecnico: UserIcon,
};

const SITUACAO_LABEL: Record<DecisaoDto['situacao'], string> = {
  sem_revisao: 'Pendente de revisão',
  confirmada: 'Confirmada',
  corrigida: 'Corrigida',
};

const SITUACAO_BADGE: Record<DecisaoDto['situacao'], string> = {
  sem_revisao:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  confirmada:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  corrigida:
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
};

function ehPendente(decisao: DecisaoDto | null): boolean {
  return decisao?.efeito === 'aplicado' && decisao?.situacao === 'sem_revisao';
}

interface LinhaProps {
  item: CampoDto;
  confirmando: boolean;
  desabilitado: boolean;
  onConfirmar: (campo: DecisaoCampo) => void;
  /** Ação extra da linha (Reatribuir no técnico, Corrigir na prioridade). */
  acaoExtra?: React.ReactNode;
}

function LinhaDecisao({ item, confirmando, desabilitado, onConfirmar, acaoExtra }: LinhaProps) {
  const Icon = CAMPO_ICON[item.campo];
  const pendente = ehPendente(item.decisao);
  const confiancaTexto = item.decisao
    ? item.decisao.decididoPor === 'regra'
      ? 'regra'
      : item.decisao.confianca != null
        ? `${Math.round(item.decisao.confianca * 100)}% de confiança`
        : null
    : null;

  return (
    <div className="space-y-2.5 rounded-xl border border-border/50 bg-card px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40">
            <Icon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold capitalize text-foreground">
            {DECISAO_CAMPO_LABELS[item.campo]}
          </span>
        </div>
        {item.decisao && (
          <Badge
            variant="outline"
            className={cn('text-xs font-medium', SITUACAO_BADGE[item.decisao.situacao])}
          >
            {SITUACAO_LABEL[item.decisao.situacao]}
          </Badge>
        )}
      </div>

      <p className="text-sm text-foreground">
        <span className="text-muted-foreground">Atual: </span>
        {item.atual.rotulo}
      </p>

      {item.decisao && (
        <div className="space-y-1.5 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">
              {item.decisao.decididoPor === 'ia' ? 'A IA escolheu: ' : 'A regra escolheu: '}
            </span>
            {item.decisao.valorIa.rotulo}
            {confiancaTexto && ` (${confiancaTexto})`}
          </p>
          {item.decisao.motivo && <p>Motivo: {item.decisao.motivo}</p>}
          {item.decisao.correcoes.length > 0 && (
            <ul className="space-y-1 border-t border-border/40 pt-1.5">
              {item.decisao.correcoes.map((c, i) => (
                <li key={i}>
                  {c.userNome ?? 'Alguém'} corrigiu de &ldquo;{c.anterior.rotulo}&rdquo; para
                  &ldquo;{c.novo.rotulo}&rdquo;
                  {c.motivo && ` — ${c.motivo}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {item.divergente && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />O valor atual do
          chamado já não é o que a decisão registra.
        </p>
      )}

      {(pendente || acaoExtra) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {pendente && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={desabilitado}
              onClick={() => onConfirmar(item.campo)}
            >
              {confirmando ? 'Confirmando…' : 'Confirmar'}
            </Button>
          )}
          {acaoExtra}
        </div>
      )}
    </div>
  );
}

function PainelSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-border/50 bg-card px-4 py-3.5">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-4 w-40 rounded-md" />
        </div>
      ))}
    </div>
  );
}

interface RevisaoIaPainelProps {
  chamadoId: string;
  /** A linha do técnico abre o `ReatribuirChamadoDialog` que já existe (só `em atendimento`). */
  podeReatribuirTecnico: boolean;
  onReatribuirTecnico?: () => void;
  /** A linha da prioridade abre o `CorrigirPrioridadeDialog` (spec 0009, AC-7). */
  podeCorrigirPrioridade: boolean;
  onCorrigirPrioridade?: () => void;
  /** A linha do serviço abre o `CorrigirServicoDialog` (spec 0009, AC-11). */
  podeCorrigirServico: boolean;
  onCorrigirServico?: () => void;
}

export function RevisaoIaPainel({
  chamadoId,
  podeReatribuirTecnico,
  onReatribuirTecnico,
  podeCorrigirPrioridade,
  onCorrigirPrioridade,
  podeCorrigirServico,
  onCorrigirServico,
}: RevisaoIaPainelProps) {
  const [loading, setLoading] = useState(true);
  const [campos, setCampos] = useState<CampoDto[]>([]);
  const [confirmando, setConfirmando] = useState<DecisaoCampo | 'todas' | null>(null);

  const carregar = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/gestao/chamados/${chamadoId}/decisoes-ia`, {
          cache: 'no-store',
          signal,
        });
        if (!res.ok) {
          setCampos([]);
          return;
        }
        const data = await res.json().catch(() => ({}));
        setCampos(Array.isArray(data.campos) ? data.campos : []);
      } catch {
        setCampos([]);
      } finally {
        setLoading(false);
      }
    },
    [chamadoId],
  );

  useEffect(() => {
    const controller = new AbortController();
    carregar(controller.signal);
    return () => controller.abort();
  }, [carregar]);

  const confirmar = useCallback(
    async (campoAlvo?: DecisaoCampo) => {
      setConfirmando(campoAlvo ?? 'todas');
      try {
        const resultado = await confirmarDecisoesIaAction({
          chamadoId,
          campos: campoAlvo ? [campoAlvo] : undefined,
        });
        if (!resultado.ok) {
          toast.error(resultado.error);
          return;
        }
        const sucessos = resultado.resultados.filter((r) => r.ok);
        const falhas = resultado.resultados.filter((r) => !r.ok);
        if (sucessos.length > 0) {
          toast.success(
            sucessos.length === 1
              ? `Decisão de ${DECISAO_CAMPO_LABELS[sucessos[0].campo]} confirmada.`
              : `${sucessos.length} decisões confirmadas.`,
          );
        }
        if (falhas.length > 0) {
          toast.error(
            'O valor já mudou desde a última leitura. Atualize a página e tente de novo.',
          );
        }
        await carregar();
      } catch {
        toast.error('Não foi possível confirmar agora. Tente de novo.');
      } finally {
        setConfirmando(null);
      }
    },
    [chamadoId, carregar],
  );

  if (loading) return <PainelSkeleton />;

  const pendentes = campos.filter((c) => ehPendente(c.decisao));

  return (
    <div className="space-y-3">
      {pendentes.length > 1 && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={confirmando !== null}
            onClick={() => confirmar()}
          >
            {confirmando === 'todas' ? 'Confirmando…' : `Confirmar todas (${pendentes.length})`}
          </Button>
        </div>
      )}
      {campos.map((item) => (
        <LinhaDecisao
          key={item.campo}
          item={item}
          confirmando={confirmando === item.campo || confirmando === 'todas'}
          desabilitado={confirmando !== null}
          onConfirmar={confirmar}
          acaoExtra={
            item.campo === 'tecnico' && podeReatribuirTecnico && onReatribuirTecnico ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={onReatribuirTecnico}
              >
                Reatribuir
              </Button>
            ) : item.campo === 'prioridade' && podeCorrigirPrioridade && onCorrigirPrioridade ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={onCorrigirPrioridade}
              >
                Corrigir
              </Button>
            ) : item.campo === 'servico' && podeCorrigirServico && onCorrigirServico ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={onCorrigirServico}
              >
                Corrigir
              </Button>
            ) : undefined
          }
        />
      ))}
    </div>
  );
}
