'use client';

import { BellOff, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

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
import { Textarea } from '@/components/ui/textarea';
import {
  ERRO_MOTIVO_DISPENSA,
  MESES_DISPENSA_SUBSTITUICAO,
  MOTIVO_DISPENSA_MAX,
  MOTIVO_DISPENSA_MIN,
} from '@/shared/ativos/substituicao.constants';

import { dispensarSubstituicaoAction } from '../actions';

/**
 * Dispensar um candidato à substituição (spec 0015, AC-11), na ficha e na
 * linha do IMR. O motivo fica só no ativo, visível à gestão; o histórico leva
 * só a data e os critérios. Se o servidor recusa porque o ativo mudou, a tela
 * recarrega para mostrar a situação de agora (AC-13).
 */
export function DialogoDispensaSubstituicao({
  ativoId,
  codigo,
  size = 'sm',
}: {
  ativoId: string;
  codigo: string;
  size?: 'sm' | 'default';
}) {
  const router = useRouter();
  const idMotivo = useId();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const tamanho = motivo.trim().length;
  const valido = tamanho >= MOTIVO_DISPENSA_MIN && tamanho <= MOTIVO_DISPENSA_MAX;

  function abrir() {
    setMotivo('');
    setErro(null);
    setAberto(true);
  }

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const r = await dispensarSubstituicaoAction({ ativoId, motivo });
      if (r.ok) {
        toast.success(
          `Substituição de ${codigo} dispensada por ${MESES_DISPENSA_SUBSTITUICAO} meses.`,
        );
        setAberto(false);
        router.refresh();
        return;
      }
      if (r.error === ERRO_MOTIVO_DISPENSA) {
        setErro(r.error);
        return;
      }
      toast.error(r.error);
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size={size} onClick={abrir} aria-label={`Dispensar ${codigo}`}>
        <BellOff className="h-4 w-4" aria-hidden />
        Dispensar
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dispensar {codigo}</DialogTitle>
            <DialogDescription>
              O equipamento sai da lista de candidatos por {MESES_DISPENSA_SUBSTITUICAO} meses e
              volta antes disso se aparecer um critério novo. Nada muda no ativo nem nos chamados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={idMotivo}>Motivo</Label>
            <Textarea
              id={idMotivo}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              maxLength={MOTIVO_DISPENSA_MAX}
              aria-describedby={`${idMotivo}-ajuda`}
              aria-invalid={erro ? true : undefined}
              placeholder="Ex.: troca já prevista no plano de compras de 2027."
            />
            <p id={`${idMotivo}-ajuda`} className="text-xs text-muted-foreground">
              De {MOTIVO_DISPENSA_MIN} a {MOTIVO_DISPENSA_MAX} caracteres ({tamanho} agora). Só
              Admin e Preposto veem o motivo.
            </p>
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={salvando || !valido}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Dispensar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
