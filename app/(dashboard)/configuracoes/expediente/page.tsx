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
import { IANA_TIMEZONES_BR } from '@/shared/config/expediente.schemas';

const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

type ConfigState = {
  timezone: string;
  workdayStart: string;
  workdayEnd: string;
  weekdays: number[];
};

export default function ExpedientePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigState>({
    timezone: 'America/Belem',
    workdayStart: '08:00',
    workdayEnd: '18:00',
    weekdays: [1, 2, 3, 4, 5],
  });

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/config/expediente', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (res.status === 401 || res.status === 403) {
        router.replace('/dashboard');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Erro ao carregar configuração');
        return;
      }
      const data = await res.json();
      setConfig({
        timezone: data.timezone ?? 'America/Belem',
        workdayStart: data.workdayStart ?? '08:00',
        workdayEnd: data.workdayEnd ?? '18:00',
        weekdays: Array.isArray(data.weekdays) ? data.weekdays : [1, 2, 3, 4, 5],
      });
    } catch {
      setError('Erro ao carregar configuração');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const toggleWeekday = useCallback((day: number) => {
    setConfig((prev) => {
      const next = prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort((a, b) => a - b);
      if (next.length === 0) return prev;
      return { ...prev, weekdays: next };
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setError(null);
      try {
        const res = await fetch('/api/config/expediente', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(config),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? 'Erro ao salvar');
          return;
        }
        await fetchConfig();
      } catch {
        setError('Erro ao salvar configuração');
      } finally {
        setSaving(false);
      }
    },
    [config, fetchConfig],
  );

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Carregando configuração...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuração de Expediente"
        subtitle="Defina timezone, horário de trabalho e dias úteis. Utilizado no cálculo de SLA e na exibição de datas."
      />

      <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        Alterações afetam apenas novos chamados e novos cálculos de SLA. Chamados já classificados
        não são alterados.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Configuração institucional</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={config.timezone}
                onValueChange={(v) => setConfig((p) => ({ ...p, timezone: v }))}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IANA_TIMEZONES_BR.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="workdayStart">Início do expediente (HH:mm)</Label>
                <Input
                  id="workdayStart"
                  type="time"
                  value={config.workdayStart}
                  onChange={(e) => setConfig((p) => ({ ...p, workdayStart: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workdayEnd">Fim do expediente (HH:mm)</Label>
                <Input
                  id="workdayEnd"
                  type="time"
                  value={config.workdayEnd}
                  onChange={(e) => setConfig((p) => ({ ...p, workdayEnd: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Dias úteis</Label>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                  <label
                    key={day}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition-colors hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={config.weekdays.includes(day)}
                      onChange={() => toggleWeekday(day)}
                      className="h-4 w-4 rounded"
                    />
                    <span className="text-sm">{WEEKDAY_LABELS[day]}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Selecione pelo menos um dia. O expediente considera apenas os dias marcados.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
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
