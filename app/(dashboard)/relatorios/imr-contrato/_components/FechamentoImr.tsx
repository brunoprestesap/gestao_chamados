'use client';

import { LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { DialogMotivo } from '@/app/(dashboard)/cotacoes/_components/compartilhado/DialogMotivo';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatarMes } from '@/shared/contratos/janela';
import {
  faixaDoTotal,
  MOTIVO_IMR_MAX,
  MOTIVO_IMR_MIN,
  OBSERVACAO_IMR_MAX,
  PONTOS_MAXIMOS,
} from '@/shared/imr-contrato/imr-contrato.constants';

import { fecharMesImrAction, reabrirMesImrAction } from '../actions';

/** Fechar e reabrir o mês do IMR do contrato (spec 0023, AC-10, AC-11). */

type Mes = { contratoId: string; competencia: string };

/** `"12"` → 12; vazio ou fora do intervalo → null. */
function lerPontos(texto: string, max: number): number | null {
  if (!/^\d{1,3}$/.test(texto.trim())) return null;
  const n = Number(texto);
  return n <= max ? n : null;
}

function CampoIndicador({
  numero,
  titulo,
  max,
  pontos,
  setPontos,
  observacao,
  setObservacao,
  invalido,
}: {
  numero: 1 | 2;
  titulo: string;
  max: number;
  pontos: string;
  setPontos: (v: string) => void;
  observacao: string;
  setObservacao: (v: string) => void;
  invalido: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-2 rounded-xl border p-3">
      <legend className="px-1 text-sm font-medium">
        Indicador {numero}: {titulo}
      </legend>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-pontos`}>Pontos (0 a {max})</Label>
        <Input
          id={`${id}-pontos`}
          inputMode="numeric"
          value={pontos}
          className="w-28"
          aria-invalid={invalido ? true : undefined}
          aria-describedby={invalido ? `${id}-erro` : undefined}
          onChange={(e) => setPontos(e.target.value)}
        />
        {invalido ? (
          <p
            id={`${id}-erro`}
            role="alert"
            className="text-[13px] font-medium text-rose-700 dark:text-rose-300"
          >
            Informe um número inteiro de 0 a {max}.
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-obs`}>Observação (opcional)</Label>
        <Textarea
          id={`${id}-obs`}
          value={observacao}
          maxLength={OBSERVACAO_IMR_MAX}
          rows={2}
          onChange={(e) => setObservacao(e.target.value)}
        />
      </div>
    </fieldset>
  );
}

/** AC-10: os pontos dos indicadores 1 e 2, com a soma e a faixa ao vivo. */
export function FecharMes({ mes, i3, i4 }: { mes: Mes; i3: number; i4: number }) {
  const [aberto, setAberto] = useState(false);
  const [i1, setI1] = useState('');
  const [i2, setI2] = useState('');
  const [obs1, setObs1] = useState('');
  const [obs2, setObs2] = useState('');
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const p1 = lerPontos(i1, PONTOS_MAXIMOS.i1);
  const p2 = lerPontos(i2, PONTOS_MAXIMOS.i2);
  const total = p1 !== null && p2 !== null ? p1 + p2 + i3 + i4 : null;
  const faixa = total === null ? null : faixaDoTotal(total);

  function fechar() {
    setAberto(false);
    setI1('');
    setI2('');
    setObs1('');
    setObs2('');
    setTentou(false);
    setErro(null);
  }

  function enviar() {
    setTentou(true);
    if (p1 === null || p2 === null) return;
    iniciar(async () => {
      const r = await fecharMesImrAction({
        ...mes,
        i1Pontos: p1,
        i1Observacao: obs1,
        i2Pontos: p2,
        i2Observacao: obs2,
        pontosVistos: { i3, i4 },
      });
      if (!r.ok) {
        setErro(r.error);
        toast.error(r.error);
        return;
      }
      toast.success(`Mês fechado na versão ${r.versao}.`);
      fechar();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="gradiente"
        className="rounded-xl"
        onClick={() => setAberto(true)}
      >
        <LockKeyhole className="size-4" aria-hidden="true" />
        Fechar o mês
      </Button>
      {aberto ? (
        <Dialog open onOpenChange={(o) => !o && !pendente && fechar()}>
          <DialogContent className="sm:max-w-lg sm:rounded-2xl">
            <form
              noValidate
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                enviar();
              }}
            >
              <DialogHeader>
                <DialogTitle>Fechar {formatarMes(mes.competencia)}</DialogTitle>
                <DialogDescription>
                  O fechamento grava os quatro indicadores, as ocorrências e a soma como estão
                  agora. Depois disso, nada muda sem reabrir o mês.
                </DialogDescription>
              </DialogHeader>
              <CampoIndicador
                numero={1}
                titulo="pagamento de salários e benefícios"
                max={PONTOS_MAXIMOS.i1}
                pontos={i1}
                setPontos={setI1}
                observacao={obs1}
                setObservacao={setObs1}
                invalido={tentou && p1 === null}
              />
              <CampoIndicador
                numero={2}
                titulo="fornecimento de EPIs e uniformes"
                max={PONTOS_MAXIMOS.i2}
                pontos={i2}
                setPontos={setI2}
                observacao={obs2}
                setObservacao={setObs2}
                invalido={tentou && p2 === null}
              />
              <dl className="grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Indicadores 3 e 4</dt>
                  <dd className="font-medium tabular-nums">
                    {i3} + {i4}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Soma</dt>
                  <dd className="font-medium tabular-nums">
                    {total === null ? '—' : `${total} / 100`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Faixa</dt>
                  <dd className="font-medium tabular-nums">
                    {faixa
                      ? `${faixa.percentual}% (fator ${faixa.fator.toFixed(2).replace('.', ',')})`
                      : '—'}
                  </dd>
                </div>
              </dl>
              {erro ? (
                <p
                  role="alert"
                  className="text-[13px] font-medium text-rose-700 dark:text-rose-300"
                >
                  {erro}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={fechar} disabled={pendente}>
                  Cancelar
                </Button>
                <Button type="submit" variant="gradiente" disabled={pendente}>
                  {pendente ? 'Fechando…' : 'Fechar o mês'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

/** AC-11: reabre a versão vigente com motivo. */
export function ReabrirMes({ mes, versao }: { mes: Mes; versao: number }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function fechar() {
    setAberto(false);
    setErro(null);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="rounded-xl"
        onClick={() => setAberto(true)}
      >
        <LockKeyholeOpen className="size-4" aria-hidden="true" />
        Reabrir o mês
      </Button>
      {aberto ? (
        <DialogMotivo
          titulo={`Reabrir ${formatarMes(mes.competencia)}`}
          descricao={`A versão ${versao} continua gravada e legível. O mês volta à prévia ao vivo, e o próximo fechamento grava a versão ${versao + 1}.`}
          rotuloConfirmar="Reabrir o mês"
          min={MOTIVO_IMR_MIN}
          max={MOTIVO_IMR_MAX}
          pendente={pendente}
          erroServidor={erro}
          onFechar={fechar}
          onConfirmar={(motivo) =>
            iniciar(async () => {
              const r = await reabrirMesImrAction({ ...mes, motivo });
              if (!r.ok) {
                setErro(r.error);
                toast.error(r.error);
                return;
              }
              toast.success('Mês reaberto.');
              fechar();
            })
          }
        />
      ) : null}
    </>
  );
}
