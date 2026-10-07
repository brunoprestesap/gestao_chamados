'use client';

import { BellRing, Loader2, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SituacaoSubstituicao } from '@/lib/ativos/substituicao';
import { formatDate } from '@/lib/utils';
import {
  formatarDia,
  NOTA_IDADE_NAO_AVALIADA,
  textoDoMotivo,
} from '@/shared/ativos/substituicao.constants';

import { desfazerDispensaSubstituicaoAction } from '../actions';
import { DialogoDispensaSubstituicao } from './DialogoDispensaSubstituicao';

/**
 * A situação de substituição na ficha (spec 0015, AC-10, AC-12 e AC-15). Só a
 * gestão recebe o objeto; `null` quer dizer que a conta falhou agora.
 */
export function SubstituicaoAtivo({
  ativoId,
  codigo,
  situacao,
}: {
  ativoId: string;
  codigo: string;
  situacao: SituacaoSubstituicao | null;
}) {
  if (situacao === null) {
    return (
      <Moldura>
        <p className="text-sm text-muted-foreground">
          Não foi possível avaliar a substituição agora.
        </p>
      </Moldura>
    );
  }

  const nota = situacao.idadeNaoAvaliada
    ? NOTA_IDADE_NAO_AVALIADA[situacao.idadeNaoAvaliada]
    : null;
  if (situacao.situacao === 'fora' && !nota) return null;

  return (
    <Moldura>
      {situacao.situacao === 'candidato' && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <Badge className="rounded-full border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100">
              Candidato à substituição
            </Badge>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground">
              {situacao.motivos.map((m) => (
                <li key={m.criterio}>{textoDoMotivo(m)}</li>
              ))}
            </ul>
            {situacao.dispensaGravadaAte && (
              <p className="text-xs text-muted-foreground">
                Dispensado antes até {formatarDia(situacao.dispensaGravadaAte)}
              </p>
            )}
          </div>
          <DialogoDispensaSubstituicao ativoId={ativoId} codigo={codigo} />
        </div>
      )}

      {situacao.situacao === 'dispensado' && situacao.dispensa && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <Badge variant="outline" className="rounded-full">
              Substituição dispensada até {formatarDia(situacao.dispensa.ate)}
            </Badge>
            <p className="break-words text-sm text-foreground">{situacao.dispensa.motivo}</p>
            <p className="text-xs text-muted-foreground">
              {situacao.dispensa.porNome} · {formatDate(situacao.dispensa.em)}
            </p>
          </div>
          <VoltarASinalizar ativoId={ativoId} codigo={codigo} />
        </div>
      )}

      {nota && (
        <p
          className={
            situacao.situacao === 'fora'
              ? 'text-sm text-muted-foreground'
              : 'mt-3 text-xs text-muted-foreground'
          }
        >
          {nota}
        </p>
      )}
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Substituição do equipamento"
      className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm"
    >
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <BellRing className="h-4 w-4 text-primary" aria-hidden />
        Substituição
      </h2>
      {children}
    </section>
  );
}

function VoltarASinalizar({ ativoId, codigo }: { ativoId: string; codigo: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [salvando, iniciar] = useTransition();

  function confirmar() {
    iniciar(async () => {
      const r = await desfazerDispensaSubstituicaoAction({ ativoId });
      if (r.ok) toast.success(`${codigo} voltou a ser avaliado para substituição.`);
      else toast.error(r.error);
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <RotateCcw className="h-4 w-4" aria-hidden />
        Voltar a sinalizar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Voltar a sinalizar {codigo}?</DialogTitle>
            <DialogDescription>
              A dispensa é desfeita agora e o equipamento volta à lista de candidatos, se ainda
              bater algum critério. O registro fica na linha do tempo do cadastro.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Voltar a sinalizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
