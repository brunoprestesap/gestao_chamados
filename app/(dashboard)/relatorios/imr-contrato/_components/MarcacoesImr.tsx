'use client';

import { Ban, SearchCheck, Undo2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatarDataHoraBelem } from '@/shared/contratos/formato';
import {
  MOTIVO_IMR_MAX,
  MOTIVO_IMR_MIN,
  rotuloMarcacao,
  type TipoMarcacao,
} from '@/shared/imr-contrato/imr-contrato.constants';

import { buscarChamadoDaBaseAction, marcarImrAction } from '../actions';

/** As marcações do fiscal e do gestor na tela do IMR do contrato (spec 0023, AC-7, AC-8). */

type Mes = { contratoId: string; competencia: string };

type Alvo = { indicador: 3 | 4; alvoId: string; rotulo: string };

const DESCRICAO: Record<TipoMarcacao, (rotulo: string, indicador: 3 | 4) => string> = {
  desconsiderar: (r) =>
    `A ocorrência de ${r} continua na lista, riscada, e deixa de contar na pontuação.`,
  desfazer_desconsiderar: (r) => `A ocorrência de ${r} volta a contar na pontuação.`,
  nao_atendimento: (r, i) =>
    `Marca ${r} como ${i === 3 ? 'não atendimento' : 'não fornecido'}. Uma marcação assim zera o indicador ${i} no mês.`,
  desfazer_nao_atendimento: (r, i) =>
    `Tira a marcação de ${i === 3 ? 'não atendimento' : 'não fornecido'} de ${r}, e o indicador ${i} volta a seguir a escala.`,
};

/** Grava a marcação e devolve o erro do servidor, se houver, para o diálogo mostrar. */
function useMarcar(mes: Mes) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  function marcar(alvo: Alvo, tipo: TipoMarcacao, motivo: string, aoConcluir: () => void) {
    iniciar(async () => {
      const r = await marcarImrAction({
        ...mes,
        indicador: alvo.indicador,
        alvoTipo: alvo.indicador === 3 ? 'chamado' : 'cotacao',
        alvoId: alvo.alvoId,
        tipo,
        motivo,
      });
      if (!r.ok) {
        setErro(r.error);
        toast.error(r.error);
        return;
      }
      setErro(null);
      toast.success('Marcação registrada.');
      aoConcluir();
    });
  }
  return { pendente, erro, setErro, marcar };
}

function DialogDaMarcacao({
  mes,
  alvo,
  tipo,
  onFechar,
}: {
  mes: Mes;
  alvo: Alvo;
  tipo: TipoMarcacao;
  onFechar: () => void;
}) {
  const { pendente, erro, marcar } = useMarcar(mes);
  return (
    <DialogMotivo
      titulo={`${rotuloMarcacao(tipo, alvo.indicador)}: ${alvo.rotulo}`}
      descricao={DESCRICAO[tipo](alvo.rotulo, alvo.indicador)}
      rotuloConfirmar={rotuloMarcacao(tipo, alvo.indicador)}
      destrutiva={tipo === 'nao_atendimento'}
      min={MOTIVO_IMR_MIN}
      max={MOTIVO_IMR_MAX}
      pendente={pendente}
      erroServidor={erro}
      onFechar={onFechar}
      onConfirmar={(motivo) => marcar(alvo, tipo, motivo, onFechar)}
    />
  );
}

/** Um botão de marcação numa linha da lista (desconsiderar ou desfazer). */
export function BotaoMarcacao({ mes, alvo, tipo }: { mes: Mes; alvo: Alvo; tipo: TipoMarcacao }) {
  const [aberto, setAberto] = useState(false);
  const desfazer = tipo.startsWith('desfazer');
  const Icone = desfazer ? Undo2 : Ban;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-lg"
        onClick={() => setAberto(true)}
        aria-label={`${rotuloMarcacao(tipo, alvo.indicador)}: ${alvo.rotulo}`}
      >
        <Icone className="size-3.5" aria-hidden="true" />
        {rotuloMarcacao(tipo, alvo.indicador)}
      </Button>
      {aberto ? (
        <DialogDaMarcacao mes={mes} alvo={alvo} tipo={tipo} onFechar={() => setAberto(false)} />
      ) : null}
    </>
  );
}

/** AC-8, indicador 3: acha o chamado da base pelo número e pede o motivo. */
export function MarcarNaoAtendimento({ mes }: { mes: Mes }) {
  const id = useId();
  const [etapa, setEtapa] = useState<'fechado' | 'busca' | 'motivo'>('fechado');
  const [numero, setNumero] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [achado, setAchado] = useState<Alvo | null>(null);
  const [buscando, iniciar] = useTransition();

  function fechar() {
    setEtapa('fechado');
    setNumero('');
    setErro(null);
    setAchado(null);
  }

  function buscar() {
    iniciar(async () => {
      const r = await buscarChamadoDaBaseAction({ ...mes, numero });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      if (r.chamado.naoAtendimentoVigente) {
        setErro(`O chamado ${r.chamado.ticketNumber} já está marcado como não atendido.`);
        return;
      }
      setAchado({
        indicador: 3,
        alvoId: r.chamado.chamadoId,
        rotulo: `chamado ${r.chamado.ticketNumber} (${r.chamado.descricao || 'sem título'}, prazo ${formatarDataHoraBelem(r.chamado.prazo)})`,
      });
      setEtapa('motivo');
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="rounded-xl"
        onClick={() => setEtapa('busca')}
      >
        <SearchCheck className="size-4" aria-hidden="true" />
        Marcar não atendimento
      </Button>
      {etapa === 'busca' ? (
        <Dialog open onOpenChange={(o) => !o && !buscando && fechar()}>
          <DialogContent className="sm:rounded-2xl">
            <form
              noValidate
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                buscar();
              }}
            >
              <DialogHeader>
                <DialogTitle>Marcar não atendimento</DialogTitle>
                <DialogDescription>
                  Informe o número de um chamado com prazo de resposta neste mês. Uma marcação assim
                  zera o indicador 3.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor={id}>Número do chamado</Label>
                <Input
                  id={id}
                  value={numero}
                  autoFocus
                  placeholder="Ex.: CHM-2026-00123 ou 123"
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? `${id}-erro` : undefined}
                  onChange={(e) => {
                    setNumero(e.target.value);
                    setErro(null);
                  }}
                />
                {erro ? (
                  <p
                    id={`${id}-erro`}
                    role="alert"
                    className="text-[13px] font-medium text-rose-700 dark:text-rose-300"
                  >
                    {erro}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={fechar} disabled={buscando}>
                  Cancelar
                </Button>
                <Button type="submit" variant="gradiente" disabled={buscando || !numero.trim()}>
                  {buscando ? 'Buscando…' : 'Buscar chamado'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {etapa === 'motivo' && achado ? (
        <DialogDaMarcacao mes={mes} alvo={achado} tipo="nao_atendimento" onFechar={fechar} />
      ) : null}
    </>
  );
}

export type OpcaoCotacao = { cotacaoId: string; rotulo: string };

/** AC-8, indicador 4: escolhe uma cotação da base do mês e pede o motivo. */
export function MarcarNaoFornecido({ mes, opcoes }: { mes: Mes; opcoes: OpcaoCotacao[] }) {
  const id = useId();
  const [etapa, setEtapa] = useState<'fechado' | 'escolha' | 'motivo'>('fechado');
  const [escolhida, setEscolhida] = useState('');
  const opcao = opcoes.find((o) => o.cotacaoId === escolhida);

  function fechar() {
    setEtapa('fechado');
    setEscolhida('');
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="rounded-xl"
        disabled={opcoes.length === 0}
        onClick={() => setEtapa('escolha')}
      >
        <SearchCheck className="size-4" aria-hidden="true" />
        Marcar não fornecido
      </Button>
      {etapa === 'escolha' ? (
        <Dialog open onOpenChange={(o) => !o && fechar()}>
          <DialogContent className="sm:rounded-2xl">
            <form
              noValidate
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (opcao) setEtapa('motivo');
              }}
            >
              <DialogHeader>
                <DialogTitle>Marcar não fornecido</DialogTitle>
                <DialogDescription>
                  Escolha uma cotação com prazo de fornecimento neste mês. Uma marcação assim zera o
                  indicador 4.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor={id}>Cotação</Label>
                <Select value={escolhida} onValueChange={setEscolhida}>
                  <SelectTrigger id={id} className="w-full">
                    <SelectValue placeholder="Escolha a cotação" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoes.map((o) => (
                      <SelectItem key={o.cotacaoId} value={o.cotacaoId}>
                        {o.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={fechar}>
                  Cancelar
                </Button>
                <Button type="submit" variant="gradiente" disabled={!opcao}>
                  Continuar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {etapa === 'motivo' && opcao ? (
        <DialogDaMarcacao
          mes={mes}
          alvo={{ indicador: 4, alvoId: opcao.cotacaoId, rotulo: opcao.rotulo }}
          tipo="nao_atendimento"
          onFechar={fechar}
        />
      ) : null}
    </>
  );
}
