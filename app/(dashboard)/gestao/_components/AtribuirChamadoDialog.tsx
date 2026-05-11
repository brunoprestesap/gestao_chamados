'use client';

import { AlertTriangle, Loader2, UserCheck, UserX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  type CatalogServiceOption,
  fetchCatalogServices,
  fetchServiceTypes,
  fetchSubtypes,
  type SubtypeOption,
} from '@/app/(dashboard)/gestao/_components/catalog-fetch.utils';
import {
  assignTicketAction,
  type AssignTicketResult,
  updateTicketCatalogAction,
} from '@/app/(dashboard)/gestao/actions';
import type { ChamadoDTO } from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import { buildTypeIdByTipo } from '@/app/(dashboard)/meus-chamados/_components/new-ticket.utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type EligibleTechnician } from '@/shared/chamados/assignment.schemas';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamado: ChamadoDTO | null;
  onSuccess: () => void;
}

async function fetchEligibleTechnicians(
  chamadoId: string,
  signal?: AbortSignal,
): Promise<EligibleTechnician[]> {
  const res = await fetch(`/api/gestao/chamados/${chamadoId}/eligible-technicians`, {
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

export function AtribuirChamadoDialog({ open, onOpenChange, chamado, onSuccess }: Props) {
  // ── Estado do fluxo de atribuição ──
  const [loading, setLoading] = useState(false);
  const [technicians, setTechnicians] = useState<EligibleTechnician[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Estado da fase de catálogo (chamados legados) ──
  const needsCatalog = !chamado?.catalogServiceId;
  const [catalogSaved, setCatalogSaved] = useState(false);
  const [subtypes, setSubtypes] = useState<SubtypeOption[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogServiceOption[]>([]);
  const [selectedSubtypeId, setSelectedSubtypeId] = useState('');
  const [selectedCatalogServiceId, setSelectedCatalogServiceId] = useState('');
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const typeIdRef = useRef('');

  const chamadoId = chamado?._id;
  const showCatalogPhase = needsCatalog && !catalogSaved;

  // ── Reset ao fechar/abrir ──
  useEffect(() => {
    if (!open) {
      setError(null);
      setSelectedTechnicianId(null);
      setTechnicians([]);
      setLoading(false);
      setCatalogSaved(false);
      setSubtypes([]);
      setCatalogServices([]);
      setSelectedSubtypeId('');
      setSelectedCatalogServiceId('');
      typeIdRef.current = '';
      return;
    }
  }, [open]);

  // ── Fase 1: carregar dados de catálogo se necessário ──
  useEffect(() => {
    if (!open || !chamado || !showCatalogPhase) return;
    if (!chamado.tipoServico) return;

    setCatalogLoading(true);
    const load = async () => {
      const types = await fetchServiceTypes();
      const typeMap = buildTypeIdByTipo(types);
      const resolvedTypeId = typeMap.get(chamado.tipoServico) ?? '';
      typeIdRef.current = resolvedTypeId;
      if (resolvedTypeId) {
        const subs = await fetchSubtypes(resolvedTypeId);
        setSubtypes(subs);
        if (chamado.subtypeId) {
          setSelectedSubtypeId(chamado.subtypeId);
          const services = await fetchCatalogServices(resolvedTypeId, chamado.subtypeId);
          setCatalogServices(services);
        }
      }
      setCatalogLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chamadoId, showCatalogPhase]);

  // ── Cascata: subtypeId → recarregar serviços ──
  useEffect(() => {
    if (!showCatalogPhase || !typeIdRef.current) return;
    setSelectedCatalogServiceId('');
    fetchCatalogServices(typeIdRef.current, selectedSubtypeId || undefined).then(
      setCatalogServices,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubtypeId]);

  // ── Fase 2: carregar técnicos elegíveis ──
  useEffect(() => {
    if (!open || !chamadoId || showCatalogPhase) {
      return;
    }

    const controller = new AbortController();
    setError(null);
    setLoading(true);
    fetchEligibleTechnicians(chamadoId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setTechnicians(items);
        if (items.length === 0) {
          setError('Nenhum técnico disponível para esta especialidade no momento.');
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar técnicos');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [open, chamadoId, showCatalogPhase]);

  // ── Handler: salvar catálogo ──
  const handleSaveCatalog = useCallback(async () => {
    if (!chamado) return;
    setSavingCatalog(true);
    setError(null);

    const result = await updateTicketCatalogAction({
      ticketId: chamado._id,
      subtypeId: selectedSubtypeId,
      catalogServiceId: selectedCatalogServiceId,
    });

    if (result.ok) {
      setCatalogSaved(true);
    } else {
      setError(result.error);
    }
    setSavingCatalog(false);
  }, [chamado, selectedSubtypeId, selectedCatalogServiceId]);

  // ── Handler: atribuir técnico ──
  const handleAssign = useCallback(async () => {
    if (!chamado || !selectedTechnicianId) return;

    setSubmitting(true);
    setError(null);

    try {
      const result: AssignTicketResult = await assignTicketAction({
        ticketId: chamado._id,
        preferredTechnicianId: selectedTechnicianId,
      });

      if (result.ok) {
        onOpenChange(false);
        onSuccess();
        if (result.strategy === 'FALLBACK') {
          toast.info(
            `Técnico selecionado estava sobrecarregado. Chamado atribuído automaticamente a ${result.technicianName}.`,
          );
        }
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atribuir chamado. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }, [chamado, selectedTechnicianId, onOpenChange, onSuccess]);

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!submitting && !savingCatalog) onOpenChange(v);
    },
    [submitting, savingCatalog, onOpenChange],
  );

  if (!chamado) return null;

  const hasEligibleTechnicians = technicians.length > 0;
  const selectedTechnician = technicians.find((t) => t._id === selectedTechnicianId);
  const catalogValid = selectedSubtypeId !== '' && selectedCatalogServiceId !== '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-lg flex-col gap-4 overflow-y-auto p-4 sm:max-h-[90vh] sm:p-6 [&>button]:right-3 [&>button]:top-3 sm:[&>button]:right-4 sm:[&>button]:top-4"
        showCloseButton
      >
        <DialogHeader className="pr-8 sm:pr-0">
          <DialogTitle className="text-base font-semibold sm:text-lg">Atribuir Chamado</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/30 p-3 space-y-1 sm:p-4">
          <p className="font-semibold text-foreground text-sm wrap-break-word sm:text-base">
            #{chamado.ticket_number}
          </p>
          <p className="text-xs text-muted-foreground wrap-break-word sm:text-sm">
            {chamado.titulo || 'Sem título'}
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive bg-destructive/10 p-3 text-xs text-destructive sm:text-sm">
            {error}
          </div>
        )}

        {/* ── Fase 1: Seleção de catálogo para chamados legados ── */}
        {showCatalogPhase ? (
          catalogLoading ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Carregando catálogo de serviços...</p>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/30 sm:p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Serviço catalogado ausente
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-300/70">
                    Este chamado foi validado sem serviço do catálogo. Selecione abaixo para liberar
                    a atribuição.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Subtipo *</label>
                  <Select
                    value={selectedSubtypeId || undefined}
                    onValueChange={setSelectedSubtypeId}
                  >
                    <SelectTrigger className="w-full min-h-10 sm:min-h-9">
                      <SelectValue placeholder="Selecione o subtipo" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(70vh,20rem)]" position="popper">
                      {subtypes.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">Serviço do Catálogo *</label>
                  <Select
                    value={selectedCatalogServiceId || undefined}
                    onValueChange={setSelectedCatalogServiceId}
                  >
                    <SelectTrigger className="w-full min-h-10 sm:min-h-9">
                      <SelectValue placeholder="Selecione o serviço" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(70vh,20rem)]" position="popper">
                      {catalogServices.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.code} — {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleSaveCatalog}
                disabled={!catalogValid || savingCatalog}
                className="w-full min-h-11 touch-manipulation sm:min-h-9"
              >
                {savingCatalog ? 'Salvando…' : 'Salvar e Continuar'}
              </Button>
            </div>
          )
        ) : (
          <>
            {/* ── Fase 2: Lista de técnicos elegíveis ── */}
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Carregando técnicos elegíveis...</p>
              </div>
            ) : !hasEligibleTechnicians ? (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200">
                <p className="font-medium">Nenhum técnico disponível</p>
                <p className="mt-1 text-xs">
                  Não há técnicos com a especialidade necessária ou todos estão sobrecarregados no
                  momento.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium">Selecione um técnico:</p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
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
                                <span className="text-xs text-muted-foreground">
                                  (Sobrecarregado)
                                </span>
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
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                    <p className="font-medium">
                      Atribuir a {selectedTechnician.name} ({selectedTechnician.currentLoad}/
                      {selectedTechnician.maxAssignedTickets} chamados)
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!showCatalogPhase && (
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
              onClick={handleAssign}
              disabled={submitting || loading || !selectedTechnicianId || !hasEligibleTechnicians}
              className="order-1 w-full min-h-11 touch-manipulation sm:order-2 sm:w-auto sm:min-h-9"
            >
              {submitting ? 'Atribuindo…' : 'Atribuir'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
