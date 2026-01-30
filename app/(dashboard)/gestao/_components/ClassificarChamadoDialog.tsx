'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Zap } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { ChamadoDTO } from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import { classificarChamadoAction, type ClassificarResult } from '@/app/(dashboard)/gestao/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FINAL_PRIORITY_VALUES, type FinalPriority } from '@/shared/chamados/chamado.constants';
import {
  ClassificarChamadoSchema,
  type ClassificarChamadoInput,
} from '@/shared/chamados/chamado.schemas';
import { NATUREZA_OPTIONS } from '@/shared/chamados/new-ticket.schemas';
import { BUSINESS_MINUTES_PER_DAY } from '@/shared/sla/sla-config.schemas';

type SlaConfigItem = {
  priority: string;
  responseTargetMinutes: number | null;
  resolutionTargetMinutes: number | null;
  businessHoursOnly: boolean | null;
};

/** Formata minutos da config SLA e retorna partes para o bloco institucional */
function formatSlaParts(
  responseTargetMinutes: number,
  resolutionTargetMinutes: number,
  businessHoursOnly: boolean,
): { respText: string; resText: string; regime: string } {
  const fmt = (min: number, business: boolean) => {
    if (business) {
      if (min >= BUSINESS_MINUTES_PER_DAY && min % BUSINESS_MINUTES_PER_DAY === 0) {
        const d = min / BUSINESS_MINUTES_PER_DAY;
        return d === 1 ? '1 dia útil' : `${d} dias úteis`;
      }
      const h = min / 60;
      return h === 1 ? '1 hora útil' : `${Math.round(h * 10) / 10} horas úteis`;
    }
    if (min >= 24 * 60 && min % (24 * 60) === 0) {
      const d = min / (24 * 60);
      return d === 1 ? '1 dia' : `${d} dias`;
    }
    const h = min / 60;
    return h === 1 ? '1 hora' : `${Math.round(h * 10) / 10} horas`;
  };
  const respText = fmt(responseTargetMinutes, businessHoursOnly);
  const resText = fmt(resolutionTargetMinutes, businessHoursOnly);
  const regime = businessHoursOnly ? 'horário comercial' : '24x7';
  return { respText, resText, regime };
}

/** Valores iguais a NATUREZA_OPTIONS; labels para o select (natureza aprovada pela gestão) */
const NATUREZA_LABELS: Record<(typeof NATUREZA_OPTIONS)[number], string> = {
  Padrão: 'Padrão (08h–18h, seg–sex)',
  Urgente: 'Urgente (24x7)',
};

const PRIORIDADE_LABELS: Record<FinalPriority, string> = {
  BAIXA: 'Baixa',
  NORMAL: 'Normal',
  ALTA: 'Alta',
  EMERGENCIAL: 'Emergencial',
};

const formSchema = ClassificarChamadoSchema.omit({ chamadoId: true });

type FormValues = z.infer<typeof formSchema>;

type UnitOption = { id: string; name: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamado: ChamadoDTO | null;
  onSuccess: () => void;
}

async function fetchUnits(): Promise<UnitOption[]> {
  const res = await fetch('/api/units', { cache: 'no-store' });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as {
    items?: { _id?: string; id?: string; name: string }[];
  };
  return (data.items ?? []).map((u) => ({
    id: String(u._id ?? u.id ?? ''),
    name: u.name,
  }));
}

async function fetchSlaConfigs(): Promise<SlaConfigItem[]> {
  const res = await fetch('/api/sla/configs', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { items?: SlaConfigItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

export function ClassificarChamadoDialog({ open, onOpenChange, chamado, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitName, setUnitName] = useState<string | null>(null);
  const [slaConfigs, setSlaConfigs] = useState<SlaConfigItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const defaultValues = useMemo<FormValues>(
    () => ({
      naturezaAtendimento: 'Padrão',
      finalPriority: 'EMERGENCIAL' as FinalPriority,
      classificationNotes: '',
    }),
    [],
  );

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues,
  });

  useEffect(() => {
    if (!open || !chamado) {
      setError(null);
      setUnitName(null);
      setSlaConfigs([]);
      return;
    }
    form.reset(defaultValues);
    setError(null);
    const load = async () => {
      const [units, configs, sessionRes] = await Promise.all([
        fetchUnits(),
        fetchSlaConfigs(),
        fetch('/api/session', { cache: 'no-store' }),
      ]);
      const u = units.find((x) => x.id === chamado.unitId);
      setUnitName(u?.name ?? null);
      setSlaConfigs(configs);
      const sessionData = await sessionRes.json().catch(() => ({}));
      setIsAdmin(sessionData?.role === 'Admin');
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chamado?._id, chamado?.unitId]);

  const onSubmit = useCallback(
    async (values: FormValues) => {
      if (!chamado) return;
      setSubmitting(true);
      setError(null);
      try {
        const payload: ClassificarChamadoInput = {
          chamadoId: chamado._id,
          ...values,
        };
        const result: ClassificarResult = await classificarChamadoAction(payload);
        if (result.ok) {
          onOpenChange(false);
          onSuccess();
        } else {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao classificar. Tente novamente.');
      } finally {
        setSubmitting(false);
      }
    },
    [chamado, onOpenChange, onSuccess],
  );

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!submitting) onOpenChange(v);
    },
    [submitting, onOpenChange],
  );

  const finalPriority = form.watch('finalPriority');

  const slaParts = useMemo(() => {
    const config = slaConfigs.find((c) => c.priority === finalPriority);
    if (
      !config ||
      config.responseTargetMinutes == null ||
      config.resolutionTargetMinutes == null ||
      config.businessHoursOnly == null
    ) {
      return null;
    }
    return formatSlaParts(
      config.responseTargetMinutes,
      config.resolutionTargetMinutes,
      config.businessHoursOnly,
    );
  }, [slaConfigs, finalPriority]);

  if (!chamado) return null;

  const headerSubtitle = [unitName, chamado.localExato].filter(Boolean).join(' • ') || '—';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg overflow-y-auto sm:max-h-[90vh]" showCloseButton>
        <DialogHeader>
          <DialogTitle>Classificar Chamado</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
          <p className="font-semibold text-foreground">#{chamado.ticket_number}</p>
          <p className="text-sm text-muted-foreground">{chamado.titulo || 'Sem título'}</p>
          <p className="text-xs text-muted-foreground">{headerSubtitle}</p>
          <p className="text-xs text-muted-foreground pt-1">
            <strong>Solicitação do usuário:</strong>{' '}
            {chamado.naturezaAtendimento === 'Urgente' ? 'Atendimento Urgente' : 'Atendimento Padrão'}
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="naturezaAtendimento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    Natureza do Atendimento (Aprovada) <span className="text-destructive">*</span>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  </FormLabel>
                  <FormDescription className="text-xs">
                    Define o regime de atendimento autorizado pela gestão (horário comercial ou
                    atendimento fora do horário).
                  </FormDescription>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NATUREZA_OPTIONS.map((v) => (
                        <SelectItem key={v} value={v}>
                          {NATUREZA_LABELS[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="finalPriority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Prioridade Final <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormDescription className="text-xs">
                    Define o nível de prioridade institucional do chamado e determina os prazos de SLA
                    aplicáveis.
                  </FormDescription>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FINAL_PRIORITY_VALUES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {PRIORIDADE_LABELS[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {slaParts && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200 space-y-1">
                      <p className="font-medium">
                        SLA aplicado automaticamente conforme configuração institucional:
                      </p>
                      <p>
                        Resposta em até <strong>{slaParts.respText}</strong> • Solução em até{' '}
                        <strong>{slaParts.resText}</strong> ({slaParts.regime})
                      </p>
                      {isAdmin && (
                        <p className="pt-1">
                          <Link
                            href="/sla"
                            className="text-blue-700 underline underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
                          >
                            Configurações de SLA
                          </Link>
                        </p>
                      )}
                    </div>
                  )}
                  {!slaParts && (
                    <p className="text-xs text-muted-foreground">
                      Configure os prazos de SLA por prioridade em Configurações SLA (/sla) para
                      exibir o SLA aqui.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="classificationNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações da Classificação</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Registre justificativas ou orientações relevantes para o atendimento."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/30 space-y-1">
              <p className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 shrink-0 text-amber-500" />
                Atribuição Automática de Técnico{' '}
                <span className="text-muted-foreground font-normal">(em breve)</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Quando habilitado, o sistema atribuirá o chamado ao técnico disponível com a
                especialidade adequada.
              </p>
              <label className="flex cursor-not-allowed items-center gap-2 opacity-70">
                <input
                  type="checkbox"
                  disabled
                  className="h-4 w-4 rounded border-gray-300"
                  aria-hidden
                />
                <span className="text-sm text-muted-foreground">Indisponível</span>
              </label>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Classificando…' : 'Classificar Chamado'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
