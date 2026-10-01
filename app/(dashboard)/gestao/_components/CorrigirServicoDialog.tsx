'use client';

import { UserCheck, UserX } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';

import {
  type CatalogServiceOption,
  fetchCatalogServices,
  fetchServiceTypes,
  fetchSubtypes,
  type SubtypeOption,
} from '@/app/(dashboard)/gestao/_components/catalog-fetch.utils';
import {
  corrigirServicoAction,
  type CorrigirServicoResult,
} from '@/app/(dashboard)/gestao/actions';
import type { ChamadoDTO } from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import { buildTypeIdByTipo } from '@/app/(dashboard)/meus-chamados/_components/new-ticket.utils';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type EligibleTechnician } from '@/shared/chamados/assignment.schemas';

/**
 * Corrige o serviço catalogado de um chamado `validado` ou `em atendimento`
 * (spec 0009, AC-11): tipo, subtipo e serviço, em cascata, como a
 * classificação já usa. Mostra os técnicos elegíveis para o serviço novo
 * assim que ele muda de figurinha do atual — a ação recusa sem gravar nada
 * se o técnico atual não tiver a especialidade e nenhum substituto foi
 * escolhido; o erro do servidor guia o Preposto de volta à lista já visível.
 */

type TypeOption = { id: string; name: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamado: ChamadoDTO | null;
  onSuccess: () => void;
}

async function fetchEligibleTechniciansForService(
  chamadoId: string,
  catalogServiceId: string,
  signal?: AbortSignal,
): Promise<EligibleTechnician[]> {
  const params = new URLSearchParams({ catalogServiceId });
  const res = await fetch(
    `/api/gestao/chamados/${chamadoId}/eligible-technicians-reassign?${params}`,
    { cache: 'no-store', signal },
  );
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return data.items || [];
}

export function CorrigirServicoDialog({ open, onOpenChange, chamado, onSuccess }: Props) {
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [subtypes, setSubtypes] = useState<SubtypeOption[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogServiceOption[]>([]);
  const [typeId, setTypeId] = useState('');
  const [subtypeId, setSubtypeId] = useState('');
  const [catalogServiceId, setCatalogServiceId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [technicians, setTechnicians] = useState<EligibleTechnician[]>([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);
  const [novoTecnicoId, setNovoTecnicoId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const motivoHelperId = useId();

  const motivoLength = motivo.trim().length;
  const motivoValido = motivoLength === 0 || motivoLength >= 10;

  useEffect(() => {
    if (!open || !chamado) {
      setTypes([]);
      setSubtypes([]);
      setCatalogServices([]);
      setTypeId('');
      setSubtypeId('');
      setCatalogServiceId('');
      setMotivo('');
      setTechnicians([]);
      setNovoTecnicoId(null);
      setError(null);
      return;
    }
    setError(null);
    setMotivo('');
    setNovoTecnicoId(null);
    const load = async () => {
      const tiposCarregados = await fetchServiceTypes();
      setTypes(tiposCarregados);
      const typeMap = buildTypeIdByTipo(tiposCarregados);
      const resolvedTypeId = chamado.tipoServico ? (typeMap.get(chamado.tipoServico) ?? '') : '';
      setTypeId(resolvedTypeId);
      setSubtypeId(chamado.subtypeId ?? '');
      setCatalogServiceId(chamado.catalogServiceId ?? '');
      if (resolvedTypeId) {
        const subs = await fetchSubtypes(resolvedTypeId);
        setSubtypes(subs);
        const services = await fetchCatalogServices(resolvedTypeId, chamado.subtypeId ?? undefined);
        setCatalogServices(services);
      } else {
        setSubtypes([]);
        setCatalogServices([]);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chamado?._id]);

  const handleTypeChange = useCallback((novoTypeId: string) => {
    setTypeId(novoTypeId);
    setSubtypeId('');
    setCatalogServiceId('');
    setSubtypes([]);
    setCatalogServices([]);
    if (novoTypeId) fetchSubtypes(novoTypeId).then(setSubtypes);
  }, []);

  const handleSubtypeChange = useCallback(
    (novoSubtypeId: string) => {
      setSubtypeId(novoSubtypeId);
      setCatalogServiceId('');
      setCatalogServices([]);
      if (typeId) {
        fetchCatalogServices(typeId, novoSubtypeId || undefined).then(setCatalogServices);
      }
    },
    [typeId],
  );

  const mesmoServico = !catalogServiceId || catalogServiceId === chamado?.catalogServiceId;

  // Assim que um serviço diferente é escolhido, já busca quem é elegível
  // para ele — o Preposto só precisa escolher se o técnico atual não servir,
  // e o erro do servidor deixa isso claro se ninguém for escolhido.
  useEffect(() => {
    if (!chamado?.assignedToUserId || mesmoServico) {
      setTechnicians([]);
      setNovoTecnicoId(null);
      return;
    }
    const controller = new AbortController();
    setLoadingTechnicians(true);
    fetchEligibleTechniciansForService(chamado._id, catalogServiceId, controller.signal)
      .then((items) => {
        setTechnicians(items);
      })
      .catch(() => setTechnicians([]))
      .finally(() => {
        if (!controller.signal.aborted) setLoadingTechnicians(false);
      });
    return () => controller.abort();
  }, [chamado, catalogServiceId, mesmoServico]);

  const handleSubmit = useCallback(async () => {
    if (!chamado || mesmoServico) return;
    setSubmitting(true);
    setError(null);
    try {
      const result: CorrigirServicoResult = await corrigirServicoAction({
        chamadoId: chamado._id,
        catalogServiceId,
        novoTecnicoId: novoTecnicoId ?? undefined,
        motivo: motivo.trim(),
      });
      if (result.ok) {
        onOpenChange(false);
        onSuccess();
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao corrigir serviço. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }, [chamado, mesmoServico, catalogServiceId, novoTecnicoId, motivo, onOpenChange, onSuccess]);

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!submitting) onOpenChange(v);
    },
    [submitting, onOpenChange],
  );

  if (!chamado) return null;

  const mostraTecnicos = Boolean(chamado.assignedToUserId) && !mesmoServico;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-lg flex-col gap-4 overflow-y-auto p-4 sm:max-h-[90vh] sm:p-6 [&>button]:right-3 [&>button]:top-3 sm:[&>button]:right-4 sm:[&>button]:top-4"
        showCloseButton
      >
        <DialogHeader className="pr-8 sm:pr-0">
          <DialogTitle className="text-base font-semibold sm:text-lg">Corrigir Serviço</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Vale para chamados validados ou em atendimento que já têm serviço. Prioridade e prazo de
            SLA não mudam.
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

        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3 sm:p-4">
          <p className="text-sm font-medium">Novo serviço</p>

          <div className="space-y-1">
            <Label htmlFor="corrigir-servico-tipo" className="text-xs">
              Tipo *
            </Label>
            <Select value={typeId || undefined} onValueChange={handleTypeChange}>
              <SelectTrigger id="corrigir-servico-tipo" className="w-full min-h-10 sm:min-h-9">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent className="max-h-[min(70vh,20rem)]" position="popper">
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="corrigir-servico-subtipo" className="text-xs">
              Subtipo *
            </Label>
            <Select
              value={subtypeId || undefined}
              onValueChange={handleSubtypeChange}
              disabled={!typeId}
            >
              <SelectTrigger id="corrigir-servico-subtipo" className="w-full min-h-10 sm:min-h-9">
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
            <Label htmlFor="corrigir-servico-catalogo" className="text-xs">
              Serviço do Catálogo *
            </Label>
            <Select
              value={catalogServiceId || undefined}
              onValueChange={setCatalogServiceId}
              disabled={!subtypeId}
            >
              <SelectTrigger id="corrigir-servico-catalogo" className="w-full min-h-10 sm:min-h-9">
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

        {mostraTecnicos && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Técnico</p>
            <p className="text-xs text-muted-foreground">
              Só é preciso escolher se o técnico atual não tiver a especialidade do serviço novo —
              nesse caso, a correção pede um substituto.
            </p>
            {loadingTechnicians ? (
              <p className="text-xs text-muted-foreground">Carregando técnicos elegíveis…</p>
            ) : technicians.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum outro técnico elegível para este serviço no momento.
              </p>
            ) : (
              <div
                role="radiogroup"
                aria-label="Escolher novo técnico"
                className="max-h-[200px] space-y-2 overflow-y-auto"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={novoTecnicoId === null}
                  onClick={() => setNovoTecnicoId(null)}
                  className={`w-full rounded-xl border p-2.5 text-left text-sm transition-colors ${
                    novoTecnicoId === null
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  Manter o técnico atual (se tiver a especialidade)
                </button>
                {technicians.map((tech) => {
                  const isSelected = novoTecnicoId === tech._id;
                  const isDisabled = tech.isOverloaded;
                  return (
                    <button
                      key={tech._id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-disabled={isDisabled}
                      disabled={isDisabled}
                      onClick={() => !isDisabled && setNovoTecnicoId(tech._id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border p-2.5 text-left text-sm transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : isDisabled
                            ? 'cursor-not-allowed border-muted bg-muted/50 opacity-50'
                            : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {tech.name}{' '}
                        <span className="text-xs text-muted-foreground">
                          ({tech.currentLoad}/{tech.maxAssignedTickets})
                        </span>
                      </span>
                      {isSelected ? (
                        <UserCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      ) : isDisabled ? (
                        <UserX
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="corrigir-servico-motivo">Motivo</Label>
          <Textarea
            id="corrigir-servico-motivo"
            placeholder="Explique por que o serviço mudou (opcional; pelo menos 10 caracteres se informado)."
            className="min-h-20 resize-y"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={submitting}
            aria-invalid={!motivoValido}
            aria-describedby={motivoHelperId}
            maxLength={500}
          />
          {!motivoValido && (
            <p id={motivoHelperId} className="text-xs text-destructive">
              Mínimo 10 caracteres ({motivoLength}/10)
            </p>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 pt-2 pb-[env(safe-area-inset-bottom,0)] sm:flex-row sm:justify-end sm:gap-2 sm:pt-0 sm:pb-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
            className="order-2 w-full min-h-11 touch-manipulation sm:order-1 sm:w-auto sm:min-h-9"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || mesmoServico || !motivoValido}
            className="order-1 w-full min-h-11 touch-manipulation sm:order-2 sm:w-auto sm:min-h-9"
          >
            {submitting ? 'Corrigindo…' : 'Corrigir Serviço'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
