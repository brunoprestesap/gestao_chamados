'use client';

import { Clock, Loader2, UserCheck, UserX } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';

import { reassignTicketAction, type ReassignTicketResult } from '@/app/(dashboard)/gestao/actions';
import type { ChamadoDTO } from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
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
import { Textarea } from '@/components/ui/textarea';
import { type EligibleTechnician } from '@/shared/chamados/assignment.schemas';

interface AssignmentHistoryItem {
  _id: string;
  action: string;
  observacoes: string;
  createdAt: string;
  user: { name: string; username: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamado: ChamadoDTO | null;
  onSuccess: () => void;
}

async function fetchAssignmentHistory(
  chamadoId: string,
  signal?: AbortSignal,
): Promise<AssignmentHistoryItem[]> {
  const res = await fetch(`/api/gestao/chamados/${chamadoId}/assignment-history`, {
    cache: 'no-store',
    signal,
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

async function fetchEligibleTechniciansReassign(
  chamadoId: string,
  signal?: AbortSignal,
): Promise<EligibleTechnician[]> {
  const res = await fetch(`/api/gestao/chamados/${chamadoId}/eligible-technicians-reassign`, {
    cache: 'no-store',
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || 'Erro ao buscar técnicos elegíveis');
  }
  const data = await res.json();
  return data.items || [];
}

export function ReatribuirChamadoDialog({ open, onOpenChange, chamado, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [technicians, setTechnicians] = useState<EligibleTechnician[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<AssignmentHistoryItem[]>([]);
  const notesHelperId = useId();

  const notesLength = notes.trim().length;
  const notesValid = notesLength >= 10;

  useEffect(() => {
    if (!open || !chamado) {
      setError(null);
      setSelectedTechnicianId(null);
      setNotes('');
      setTechnicians([]);
      setHistory([]);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      fetchEligibleTechniciansReassign(chamado._id, controller.signal),
      fetchAssignmentHistory(chamado._id, controller.signal),
    ])
      .then(([techItems, historyItems]) => {
        setTechnicians(techItems);
        setHistory(historyItems);
        if (techItems.length === 0) {
          setError('Nenhum outro técnico disponível para esta especialidade no momento.');
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar técnicos');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, chamado]);

  const handleReassign = useCallback(async () => {
    if (!chamado || !selectedTechnicianId) return;

    setSubmitting(true);
    setError(null);

    try {
      const result: ReassignTicketResult = await reassignTicketAction({
        ticketId: chamado._id,
        preferredTechnicianId: selectedTechnicianId,
        notes: notes.trim(),
      });

      if (result.ok) {
        onOpenChange(false);
        onSuccess();
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao reatribuir chamado. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }, [chamado, selectedTechnicianId, notes, onOpenChange, onSuccess]);

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!submitting) onOpenChange(v);
    },
    [submitting, onOpenChange],
  );

  if (!chamado) return null;

  const hasEligibleTechnicians = technicians.length > 0;
  const selectedTechnician = technicians.find((t) => t._id === selectedTechnicianId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-lg flex-col gap-4 overflow-y-auto p-4 sm:max-h-[90vh] sm:p-6 [&>button]:right-3 [&>button]:top-3 sm:[&>button]:right-4 sm:[&>button]:top-4"
        showCloseButton
      >
        <DialogHeader className="pr-8 sm:pr-0">
          <DialogTitle className="text-base font-semibold sm:text-lg">
            Reatribuir Técnico
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Selecione um técnico para continuar o atendimento.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/30 p-3 space-y-1 sm:p-4">
          <p className="font-semibold text-foreground text-sm wrap-break-word sm:text-base">
            #{chamado.ticket_number}
          </p>
          <p className="text-xs text-muted-foreground wrap-break-word sm:text-sm">
            {chamado.titulo || 'Sem título'}
          </p>
        </div>

        <div aria-live="polite" aria-atomic="true">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive bg-destructive/10 p-3 text-xs text-destructive sm:text-sm"
            >
              {error}
            </div>
          )}
        </div>

        {loading ? (
          <div
            role="status"
            aria-label="Carregando técnicos elegíveis"
            className="flex justify-center items-center gap-2 py-8"
          >
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Carregando técnicos elegíveis...</p>
          </div>
        ) : !hasEligibleTechnicians ? (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">
            <p className="font-medium">Nenhum outro técnico disponível</p>
            <p className="mt-1 text-xs">
              Não há outros técnicos com a especialidade necessária ou todos estão sobrecarregados.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium" id="tech-list-label">
              Selecione o novo técnico:
            </p>
            <div
              role="radiogroup"
              aria-labelledby="tech-list-label"
              className="space-y-2 max-h-[280px] overflow-y-auto"
            >
              {technicians.map((tech) => {
                const isSelected = selectedTechnicianId === tech._id;
                const isDisabled = tech.isOverloaded;

                return (
                  <button
                    key={tech._id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-disabled={isDisabled}
                    onClick={() => {
                      if (!isDisabled) {
                        setSelectedTechnicianId(tech._id);
                        setError(null);
                      }
                    }}
                    disabled={isDisabled}
                    className={`w-full rounded-xl border p-3 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : isDisabled
                          ? 'border-muted bg-muted/50 opacity-50 cursor-not-allowed'
                          : 'border-border hover:bg-muted/50 hover:-translate-y-0.5 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{tech.name}</p>
                          {isDisabled && (
                            <span className="text-xs text-muted-foreground">(Sobrecarregado)</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Matrícula: {tech.username}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p
                            className={`text-sm font-medium ${
                              tech.isOverloaded ? 'text-destructive' : 'text-foreground'
                            }`}
                          >
                            {tech.currentLoad}/{tech.maxAssignedTickets}
                          </p>
                          <p className="text-xs text-muted-foreground">chamados</p>
                        </div>
                        {isSelected ? (
                          <UserCheck className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
                        ) : isDisabled ? (
                          <UserX
                            className="h-5 w-5 text-muted-foreground shrink-0"
                            aria-hidden="true"
                          />
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedTechnician && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
              >
                <p className="font-medium">
                  Reatribuir a {selectedTechnician.name} ({selectedTechnician.currentLoad}/
                  {selectedTechnician.maxAssignedTickets} chamados)
                </p>
              </div>
            )}

            {history.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Histórico de atribuições
                </p>
                <div className="max-h-[160px] overflow-y-auto rounded-xl border bg-muted/20 p-3">
                  <div className="relative space-y-3">
                    {history.map((item, idx) => (
                      <div key={item._id} className="relative flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 ring-1 ring-indigo-200 dark:bg-indigo-950/60 dark:ring-indigo-800/50">
                            <Clock
                              className="h-3 w-3 text-indigo-600 dark:text-indigo-400"
                              aria-hidden="true"
                            />
                          </div>
                          {idx < history.length - 1 && (
                            <div className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <p className="text-xs font-medium text-foreground">
                            {item.action === 'atribuicao_tecnico' ? 'Atribuição' : 'Reatribuição'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.observacoes}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground/70">
                            {item.user?.name ?? 'Sistema'} &middot;{' '}
                            {new Date(item.createdAt).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reassign-notes">
                Justificativa <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reassign-notes"
                placeholder="Informe o motivo da reatribuição (mínimo 10 caracteres)"
                className="min-h-20 resize-y transition-all duration-150"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
                required
                aria-required="true"
                aria-invalid={notesLength > 0 && !notesValid}
                aria-describedby={notesHelperId}
                maxLength={2000}
              />
              <div
                id={notesHelperId}
                className="flex items-center justify-between"
                aria-live="polite"
                aria-atomic="true"
              >
                {!notesValid ? (
                  <p className="text-xs text-destructive">
                    Mínimo 10 caracteres ({notesLength}/10)
                  </p>
                ) : (
                  <span />
                )}
                <p className="text-xs text-muted-foreground">{notesLength}/2000</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col gap-2 pt-2 pb-[env(safe-area-inset-bottom,0)] sm:flex-row sm:justify-end sm:gap-2 sm:pt-0 sm:pb-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting || loading}
            className="order-2 w-full min-h-11 touch-manipulation sm:order-1 sm:w-auto sm:min-h-9"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleReassign}
            disabled={
              submitting ||
              loading ||
              !selectedTechnicianId ||
              !hasEligibleTechnicians ||
              !notesValid
            }
            className="order-1 w-full min-h-11 touch-manipulation bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 sm:order-2 sm:w-auto sm:min-h-9"
          >
            {submitting ? 'Reatribuindo…' : 'Reatribuir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
