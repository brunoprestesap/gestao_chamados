'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { textoSeloPrazoAteste } from '@/shared/material/mensagens';

/** Apoio das telas da cotação de material (spec 0019). */

/** A marca de urgência (fatia 4, AC-35): para todos do fluxo e o técnico, nunca o solicitante. */
export function SeloUrgencia({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('border-rose-400 font-semibold text-rose-700 dark:text-rose-300', className)}
    >
      Urgente
    </Badge>
  );
}

/** Id de 24 hexadecimais para item ou orçamento novo; o servidor confere o formato. */
export function novoId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `2,5` ou `2.5` para número; texto inválido vira `NaN`, que o servidor recusa. */
export function numeroBr(texto: string): number {
  const bruto = texto.trim();
  // Com vírgula, o ponto é de milhar; sem vírgula, o ponto é decimal.
  const t = bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto;
  return t === '' ? Number.NaN : Number(t);
}

/** Centavos para o campo de reais (`123456` vira `1.234,56`). */
export function centavosParaCampo(c: number | null | undefined): string {
  if (c == null) return '';
  return (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function enviarArquivo(
  cotacaoId: string,
  tipo: 'orcamento' | 'evidencia' | 'nota_fiscal',
  arquivo: File,
): Promise<{ ok: true; arquivoId: string } | { ok: false; error: string }> {
  const form = new FormData();
  form.set('tipo', tipo);
  form.set('arquivo', arquivo);
  try {
    const res = await fetch(`/api/cotacoes/${cotacaoId}/arquivos`, { method: 'POST', body: form });
    const json = (await res.json().catch(() => ({}))) as { arquivoId?: string; error?: string };
    if (!res.ok || !json.arquivoId) return { ok: false, error: json.error ?? 'Falha no envio.' };
    return { ok: true, arquivoId: json.arquivoId };
  } catch {
    return { ok: false, error: 'Falha no envio. Confira a conexão e tente de novo.' };
  }
}

/** Selo do prazo do ateste (AC-21): 5 dias corridos por etapa, só aviso, nunca trava. */
export function SeloPrazoAteste({
  prazo,
}: {
  prazo: { etapa: 'provisorio' | 'definitivo'; venceEm: string; atrasado: boolean } | null;
}) {
  if (!prazo) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        prazo.atrasado
          ? 'border-rose-300 text-rose-700 dark:text-rose-300'
          : 'border-slate-300 text-slate-600 dark:text-slate-300',
      )}
    >
      {textoSeloPrazoAteste(prazo)}
    </Badge>
  );
}
