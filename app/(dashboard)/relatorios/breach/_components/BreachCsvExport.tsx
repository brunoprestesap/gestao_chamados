'use client';

import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { BreachByTechnician, BreachByUnit } from '@/lib/sla-breach-report';

function toCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\n');
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDelay(minutes: number | null): string {
  if (minutes == null) return '';
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function BreachCsvExport({
  byTechnician,
  byUnit,
  periodLabel,
}: {
  byTechnician: BreachByTechnician[];
  byUnit: BreachByUnit[];
  periodLabel: string;
}) {
  function handleExport() {
    const headers = [
      'Nome',
      'Tipo',
      'Total',
      'Breach Resposta',
      'Breach Resolução',
      'Taxa %',
      'Atraso Médio',
    ];
    const rows: string[][] = [];

    for (const t of byTechnician) {
      rows.push([
        t.technicianName,
        'Técnico',
        String(t.totalChamados),
        String(t.responseBreaches),
        String(t.resolutionBreaches),
        String(t.breachRate),
        formatDelay(t.avgDelayMinutes),
      ]);
    }

    for (const u of byUnit) {
      rows.push([
        u.unitName,
        'Unidade',
        String(u.totalChamados),
        String(u.responseBreaches),
        String(u.resolutionBreaches),
        String(u.breachRate),
        formatDelay(u.avgDelayMinutes),
      ]);
    }

    const csv = toCsv(headers, rows);
    downloadCsv(`breach-report-${periodLabel}.csv`, csv);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
      <Download className="h-3.5 w-3.5" />
      Exportar CSV
    </Button>
  );
}
