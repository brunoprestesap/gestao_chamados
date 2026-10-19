'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SituacaoCotacao } from '@/shared/material/material.constants';
import { ROTULO_ETAPA_ATESTE, ROTULO_SITUACAO } from '@/shared/material/mensagens';

/** Apoio das telas da cotação de material (spec 0019). */

const COR_SITUACAO: Record<SituacaoCotacao, string> = {
  rascunho: 'border-slate-300 text-slate-700 dark:text-slate-300',
  enviada: 'border-sky-300 text-sky-700 dark:text-sky-300',
  em_analise: 'border-indigo-300 text-indigo-700 dark:text-indigo-300',
  em_aprovacao: 'border-violet-300 text-violet-700 dark:text-violet-300',
  devolvida: 'border-amber-300 text-amber-700 dark:text-amber-300',
  autorizada: 'border-emerald-300 text-emerald-700 dark:text-emerald-300',
  executada: 'border-teal-300 text-teal-700 dark:text-teal-300',
  atestada: 'border-green-400 text-green-700 dark:text-green-300',
  reprovada: 'border-rose-300 text-rose-700 dark:text-rose-300',
  cancelada: 'border-zinc-300 text-zinc-600 dark:text-zinc-400',
};

export function SituacaoBadge({
  situacao,
  className,
}: {
  situacao: SituacaoCotacao;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(COR_SITUACAO[situacao], className)}>
      {ROTULO_SITUACAO[situacao]}
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
  const etapa = ROTULO_ETAPA_ATESTE[prazo.etapa];
  const data = prazo.venceEm.split('-').reverse().join('/');
  return (
    <Badge
      variant="outline"
      className={cn(
        prazo.atrasado
          ? 'border-rose-300 text-rose-700 dark:text-rose-300'
          : 'border-slate-300 text-slate-600 dark:text-slate-300',
      )}
    >
      {prazo.atrasado ? `${etapa} atrasado (prazo ${data})` : `${etapa} até ${data}`}
    </Badge>
  );
}
