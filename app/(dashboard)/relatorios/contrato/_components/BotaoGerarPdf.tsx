'use client';

import { FileDown, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

const ERRO_GENERICO = 'Não foi possível gerar o PDF. Tente de novo.';

/** O nome que o servidor mandou no `Content-Disposition`, ou um padrão. */
function nomeDoArquivo(cabecalho: string | null, padrao: string): string {
  const m = cabecalho?.match(/filename="([^"]+)"/);
  return m?.[1] ?? padrao;
}

/**
 * "Gerar PDF" (spec 0016, AC-16 a AC-19): o servidor recalcula tudo, grava a
 * emissão e devolve o arquivo; a lista de emissões atualiza depois.
 */
export function BotaoGerarPdf({ contratoId, mes }: { contratoId: string; mes: string }) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    setGerando(true);
    try {
      const resp = await fetch('/api/relatorios/contrato/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contratoId, mes }),
      });
      if (!resp.ok) {
        // 429 traz o texto próprio; 500 e o resto, o texto genérico (AC-16 e AC-18).
        const corpo = (await resp.json().catch(() => null)) as { error?: string } | null;
        toast.error(resp.status === 500 ? ERRO_GENERICO : (corpo?.error ?? ERRO_GENERICO));
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeDoArquivo(
        resp.headers.get('Content-Disposition'),
        `relatorio-contrato-${mes}.pdf`,
      );
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF gerado. A emissão ficou registrada abaixo.');
      router.refresh();
    } catch {
      toast.error(ERRO_GENERICO);
    } finally {
      setGerando(false);
    }
  }

  return (
    <Button
      onClick={() => void gerar()}
      disabled={gerando}
      className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
    >
      {gerando ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <FileDown className="h-4 w-4" aria-hidden />
      )}
      {gerando ? 'Gerando…' : 'Gerar PDF'}
    </Button>
  );
}
