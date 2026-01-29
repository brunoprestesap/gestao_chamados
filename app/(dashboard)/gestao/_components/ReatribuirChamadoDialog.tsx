'use client';

import { Loader2, UserCheck, UserX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { ChamadoDTO } from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import { reassignTicketAction, type ReassignTicketResult } from '@/app/(dashboard)/gestao/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { type EligibleTechnician } from '@/shared/chamados/assignment.schemas';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamado: ChamadoDTO | null;
  onSuccess: () => void;
}

async function fetchEligibleTechniciansReassign(chamadoId: string): Promise<EligibleTechnician[]> {
  const res = await fetch(`/api/gestao/chamados/${chamadoId}/eligible-technicians-reassign`, {
    cache: 'no-store',
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

  useEffect(() => {
    if (!open || !chamado) {
      setError(null);
      setSelectedTechnicianId(null);
      setNotes('');
      setTechnicians([]);
      return;
    }

    setLoading(true);
    fetchEligibleTechniciansReassign(chamado._id)
      .then((items) => {
        setTechnicians(items);
        if (items.length === 0) {
          setError('Nenhum outro técnico disponível para esta especialidade no momento.');
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar técnicos');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, chamado?._id]);

  const handleReassign = useCallback(async () => {
    if (!chamado || !selectedTechnicianId) return;

    setSubmitting(true);
    setError(null);

    try {
      const result: ReassignTicketResult = await reassignTicketAction({
        ticketId: chamado._id,
        preferredTechnicianId: selectedTechnicianId,
        notes: notes.trim() || undefined,
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
      <DialogContent className="max-w-lg overflow-y-auto sm:max-h-[90vh]" showCloseButton>
        <DialogHeader>
          <DialogTitle>Reatribuir Técnico</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Selecione um técnico para continuar o atendimento.
          </p>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
          <p className="font-semibold text-foreground">#{chamado.ticket_number}</p>
          <p className="text-sm text-muted-foreground">{chamado.titulo || 'Sem título'}</p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Carregando técnicos elegíveis...</p>
          </div>
        ) : !hasEligibleTechnicians ? (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">
            <p className="font-medium">Nenhum outro técnico disponível</p>
            <p className="mt-1 text-xs">
              Não há outros técnicos com a especialidade necessária ou todos estão sobrecarregados.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">Selecione o novo técnico:</p>
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {technicians.map((tech) => {
                const isSelected = selectedTechnicianId === tech._id;
                const isDisabled = tech.isOverloaded;

                return (
                  <button
                    key={tech._id}
                    type="button"
                    onClick={() => {
                      if (!isDisabled) {
                        setSelectedTechnicianId(tech._id);
                        setError(null);
                      }
                    }}
                    disabled={isDisabled}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : isDisabled
                          ? 'border-muted bg-muted/50 opacity-50 cursor-not-allowed'
                          : 'border-border hover:bg-muted/50 cursor-pointer'
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
                          <UserCheck className="h-5 w-5 text-primary shrink-0" />
                        ) : isDisabled ? (
                          <UserX className="h-5 w-5 text-muted-foreground shrink-0" />
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedTechnician && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                <p className="font-medium">
                  Reatribuir a {selectedTechnician.name} ({selectedTechnician.currentLoad}/
                  {selectedTechnician.maxAssignedTickets} chamados)
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reassign-notes">Observações (opcional)</Label>
              <Textarea
                id="reassign-notes"
                placeholder="Motivo ou observações da reatribuição..."
                className="min-h-20 resize-y"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
                maxLength={2000}
              />
              {notes.length > 1900 && (
                <p className="text-xs text-muted-foreground">{notes.length}/2000</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting || loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleReassign}
            disabled={submitting || loading || !selectedTechnicianId || !hasEligibleTechnicians}
            className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
          >
            {submitting ? 'Reatribuindo…' : 'Reatribuir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
