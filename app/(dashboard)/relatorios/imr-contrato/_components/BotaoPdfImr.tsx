'use client';

import { FileDown, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { MENSAGENS_PDF_IMR } from '@/shared/imr-contrato/imr-contrato.constants';

/** O nome que o servidor mandou no `Content-Disposition`, ou um padrão. */
function nomeDoArquivo(cabecalho: string | null, padrao: string): string {
  const m = cabecalho?.match(/filename="([^"]+)"/);
  return m?.[1] ?? padrao;
}

/**
 * "Emitir PDF" do mês fechado (spec 0023, AC-13): o servidor lê a foto da
 * versão vigente, grava a emissão com o hash e devolve o arquivo; a lista de
 * emissões atualiza depois.
 */
export function BotaoPdfImr({
  contratoId,
  competencia,
}: {
  contratoId: string;
  competencia: string;
}) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    setGerando(true);
    try {
      const resp = await fetch('/api/relatorios/imr-contrato/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contratoId, competencia }),
      });
      if (!resp.ok) {
        const corpo = (await resp.json().catch(() => null)) as { error?: string } | null;
        toast.error(
          resp.status === 500
            ? MENSAGENS_PDF_IMR.falhou
            : (corpo?.error ?? MENSAGENS_PDF_IMR.falhou),
        );
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeDoArquivo(
        resp.headers.get('Content-Disposition'),
        `imr-contrato-${competencia}.pdf`,
      );
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF emitido. A emissão ficou registrada abaixo.');
      router.refresh();
    } catch {
      toast.error(MENSAGENS_PDF_IMR.falhou);
    } finally {
      setGerando(false);
    }
  }

  return (
    <Button variant="gradiente" onClick={() => void gerar()} disabled={gerando}>
      {gerando ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <FileDown className="size-4" aria-hidden="true" />
      )}
      {gerando ? 'Emitindo…' : 'Emitir PDF'}
    </Button>
  );
}
