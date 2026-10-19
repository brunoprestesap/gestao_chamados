'use client';

import { FileDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

const ERRO_GENERICO = 'Não foi possível gerar o PDF. Tente de novo.';

function nomeDoArquivo(cabecalho: string | null, padrao: string): string {
  const m = cabecalho?.match(/filename="([^"]+)"/);
  return m?.[1] ?? padrao;
}

/**
 * "Gerar PDF" da cotação (spec 0019, AC-23), só para o lado TRF1: o servidor
 * monta o documento, grava a emissão com o SHA-256 e devolve o arquivo.
 */
export function BotaoPdfCotacao({ cotacaoId, numero }: { cotacaoId: string; numero: string }) {
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    setGerando(true);
    try {
      const resp = await fetch(`/api/cotacoes/${cotacaoId}/pdf`, { method: 'POST' });
      if (!resp.ok) {
        const corpo = (await resp.json().catch(() => null)) as { error?: string } | null;
        toast.error(resp.status === 500 ? ERRO_GENERICO : (corpo?.error ?? ERRO_GENERICO));
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeDoArquivo(resp.headers.get('Content-Disposition'), `cotacao-${numero}.pdf`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF gerado. A emissão ficou registrada.');
    } catch {
      toast.error(ERRO_GENERICO);
    } finally {
      setGerando(false);
    }
  }

  return (
    <Button variant="outline" onClick={() => void gerar()} disabled={gerando}>
      {gerando ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <FileDown className="h-4 w-4" aria-hidden="true" />
      )}
      {gerando ? 'Gerando…' : 'Gerar PDF para o SEI'}
    </Button>
  );
}
