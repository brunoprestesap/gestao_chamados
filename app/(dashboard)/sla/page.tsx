'use client';

import { Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BUSINESS_MINUTES_PER_DAY } from '@/shared/sla/sla-config.schemas';
import { FINAL_PRIORITY_VALUES } from '@/shared/chamados/chamado.constants';

type SlaTimeUnit = 'Horas' | 'Dias';

type ConfigItem = {
  priority: (typeof FINAL_PRIORITY_VALUES)[number];
  responseValue: number;
  responseUnit: SlaTimeUnit;
  resolutionValue: number;
  resolutionUnit: SlaTimeUnit;
  businessHoursOnly: boolean;
};

function minutesToValueAndUnit(minutes: number): { value: number; unit: SlaTimeUnit } {
  if (minutes <= 0) return { value: 1, unit: 'Horas' };
  if (minutes % BUSINESS_MINUTES_PER_DAY === 0) {
    return { value: minutes / BUSINESS_MINUTES_PER_DAY, unit: 'Dias' };
  }
  return { value: Math.round((minutes / 60) * 10) / 10, unit: 'Horas' };
}

const PRIORITY_LABELS: Record<(typeof FINAL_PRIORITY_VALUES)[number], string> = {
  BAIXA: 'Baixa',
  NORMAL: 'Normal',
  ALTA: 'Alta',
  EMERGENCIAL: 'Emergencial',
};

const defaultConfig = (priority: (typeof FINAL_PRIORITY_VALUES)[number]): ConfigItem => {
  const defaults: Record<string, ConfigItem> = {
    BAIXA: {
      priority: 'BAIXA',
      responseValue: 2,
      responseUnit: 'Dias',
      resolutionValue: 5,
      resolutionUnit: 'Dias',
      businessHoursOnly: true,
    },
    NORMAL: {
      priority: 'NORMAL',
      responseValue: 1,
      responseUnit: 'Dias',
      resolutionValue: 3,
      resolutionUnit: 'Dias',
      businessHoursOnly: true,
    },
    ALTA: {
      priority: 'ALTA',
      responseValue: 4,
      responseUnit: 'Horas',
      resolutionValue: 1,
      resolutionUnit: 'Dias',
      businessHoursOnly: true,
    },
    EMERGENCIAL: {
      priority: 'EMERGENCIAL',
      responseValue: 1,
      responseUnit: 'Horas',
      resolutionValue: 8,
      resolutionUnit: 'Horas',
      businessHoursOnly: false,
    },
  };
  return defaults[priority] ?? { priority, responseValue: 1, responseUnit: 'Horas', resolutionValue: 1, resolutionUnit: 'Horas', businessHoursOnly: true };
};

export default function SlaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configs, setConfigs] = useState<ConfigItem[]>(() =>
    FINAL_PRIORITY_VALUES.map((p) => defaultConfig(p)),
  );

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sla/configs', { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401 || res.status === 403) {
        router.replace('/dashboard');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Erro ao carregar configurações');
        return;
      }
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const next: ConfigItem[] = FINAL_PRIORITY_VALUES.map((priority) => {
        const raw = items.find((i: { priority: string }) => i.priority === priority);
        if (!raw?.responseTargetMinutes || !raw?.resolutionTargetMinutes) {
          return defaultConfig(priority);
        }
        const response = minutesToValueAndUnit(raw.responseTargetMinutes);
        const resolution = minutesToValueAndUnit(raw.resolutionTargetMinutes);
        return {
          priority,
          responseValue: response.value,
          responseUnit: response.unit,
          resolutionValue: resolution.value,
          resolutionUnit: resolution.unit,
          businessHoursOnly: raw.businessHoursOnly ?? true,
        };
      });
      setConfigs(next);
    } catch {
      setError('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const updateConfig = useCallback((index: number, patch: Partial<ConfigItem>) => {
    setConfigs((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setError(null);
      try {
        const res = await fetch('/api/sla/configs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            configs: configs.map((c) => ({
              priority: c.priority,
              responseValue: Number(c.responseValue),
              responseUnit: c.responseUnit,
              resolutionValue: Number(c.resolutionValue),
              resolutionUnit: c.resolutionUnit,
              businessHoursOnly: c.businessHoursOnly,
            })),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? 'Erro ao salvar');
          return;
        }
        await fetchConfigs();
      } catch {
        setError('Erro ao salvar configurações');
      } finally {
        setSaving(false);
      }
    },
    [configs, fetchConfigs],
  );

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Carregando configurações SLA...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações SLA"
        subtitle="Defina prazos de resposta e solução por prioridade. Apenas Admin. Chamados classificados não são alterados."
      />

      <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        1 dia útil = 10 horas (08h–18h, seg–sex). Horário comercial: America/Belem.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {configs.map((config, index) => (
            <Card key={config.priority}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{PRIORITY_LABELS[config.priority]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs">Tempo de Resposta</Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={config.responseValue}
                      onChange={(e) =>
                        updateConfig(index, { responseValue: parseFloat(e.target.value) || 0 })
                      }
                      className="w-20"
                    />
                    <Select
                      value={config.responseUnit}
                      onValueChange={(v) => updateConfig(index, { responseUnit: v as SlaTimeUnit })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Horas">Horas</SelectItem>
                        <SelectItem value="Dias">Dias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Tempo de Solução</Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={config.resolutionValue}
                      onChange={(e) =>
                        updateConfig(index, { resolutionValue: parseFloat(e.target.value) || 0 })
                      }
                      className="w-20"
                    />
                    <Select
                      value={config.resolutionUnit}
                      onValueChange={(v) => updateConfig(index, { resolutionUnit: v as SlaTimeUnit })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Horas">Horas</SelectItem>
                        <SelectItem value="Dias">Dias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`business-${config.priority}`}
                    checked={config.businessHoursOnly}
                    onChange={(e) => updateConfig(index, { businessHoursOnly: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor={`business-${config.priority}`} className="text-xs">
                    Apenas horário comercial
                  </Label>
                </div>
                {config.priority === 'EMERGENCIAL' && (
                  <p className="text-xs text-muted-foreground">
                    Emergencial pode usar 24x7 (desmarque acima).
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar Configuração
          </Button>
        </div>
      </form>
    </div>
  );
}
