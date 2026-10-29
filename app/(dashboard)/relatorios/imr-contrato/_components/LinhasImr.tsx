import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatarDuracao, ROTULO_PAPEL, ROTULO_SITUACAO } from '@/shared/imr-contrato/formato';
import type {
  LinhaI3,
  LinhaI4,
  MarcacaoDaLinha,
  MarcacoesDaLinha,
  SituacaoLinha,
} from '@/shared/imr-contrato/imr-contrato.types';

import { dataHora, type MesImr } from './apoio';
import { BotaoMarcacao } from './MarcacoesImr';

/** As linhas das tabelas dos indicadores 3 e 4 (spec 0023, AC-7, AC-8, AC-16). */

function Marcacao({ rotulo, m }: { rotulo: string; m: MarcacaoDaLinha }) {
  if (!m) return null;
  return (
    <p className="mt-1 max-w-72 text-xs whitespace-normal text-muted-foreground">
      <span className="font-medium text-foreground">{rotulo}:</span> {m.motivo}{' '}
      <span className="whitespace-nowrap">
        ({m.porNome}, {ROTULO_PAPEL[m.papel]}, {dataHora(m.em)})
      </span>
    </p>
  );
}

/** Situação e as marcações que a decidem (AC-7, AC-8). */
function CelulaSituacao({
  l,
  indicador,
}: {
  l: MarcacoesDaLinha & { situacao: SituacaoLinha };
  indicador: 3 | 4;
}) {
  const rotulo =
    l.situacao === 'nao_atendimento' && indicador === 4
      ? 'Não fornecido'
      : ROTULO_SITUACAO[l.situacao];
  return (
    <TableCell className="align-top">
      <Badge variant={l.situacao === 'desconsiderada' ? 'secondary' : 'destructive'}>
        {rotulo}
      </Badge>
      <Marcacao
        rotulo={indicador === 3 ? 'Não atendimento' : 'Não fornecido'}
        m={l.naoAtendimento}
      />
      <Marcacao rotulo="Desconsiderada" m={l.desconsideracao} />
    </TableCell>
  );
}

/** Os botões da linha, só para fiscal e gestor (AC-7, AC-8, AC-14). */
function CelulaAcoes({
  mes,
  indicador,
  alvoId,
  rotulo,
  l,
}: {
  mes: MesImr;
  indicador: 3 | 4;
  alvoId: string;
  rotulo: string;
  l: { atraso: boolean } & MarcacoesDaLinha;
}) {
  const alvo = { indicador, alvoId, rotulo };
  return (
    <TableCell className="align-top">
      <div className="flex flex-col items-start gap-1.5">
        {l.atraso ? (
          <BotaoMarcacao
            mes={mes}
            alvo={alvo}
            tipo={l.desconsideracao ? 'desfazer_desconsiderar' : 'desconsiderar'}
          />
        ) : null}
        {l.naoAtendimento ? (
          <BotaoMarcacao mes={mes} alvo={alvo} tipo="desfazer_nao_atendimento" />
        ) : null}
      </div>
    </TableCell>
  );
}

const RISCADA = 'text-muted-foreground line-through';

export function LinhaDoI3({ l, mes }: { l: LinhaI3; mes: MesImr | null }) {
  const riscada = l.situacao === 'desconsiderada' ? RISCADA : '';
  return (
    <TableRow>
      <TableCell className={cn('font-medium whitespace-nowrap', riscada)}>
        {l.ticketNumber}
      </TableCell>
      <TableCell className={cn('min-w-32 whitespace-normal', riscada)}>
        {l.solicitanteNome}
      </TableCell>
      <TableCell className={cn('min-w-40 whitespace-normal', riscada)}>{l.setor}</TableCell>
      <TableCell className={cn('whitespace-nowrap tabular-nums', riscada)}>
        {dataHora(l.solicitadoEm)}
      </TableCell>
      <TableCell className={cn('min-w-56 whitespace-normal', riscada)}>{l.descricao}</TableCell>
      <TableCell className={cn('whitespace-nowrap tabular-nums', riscada)}>
        {l.iniciadoEm ? dataHora(l.iniciadoEm) : 'sem início'}
      </TableCell>
      <TableCell className={cn('whitespace-nowrap tabular-nums', riscada)}>
        {l.tempoAteInicioMin === null ? '—' : formatarDuracao(l.tempoAteInicioMin)}
      </TableCell>
      <TableCell className={cn('whitespace-nowrap tabular-nums', riscada)}>
        {dataHora(l.prazo)}
      </TableCell>
      <CelulaSituacao l={l} indicador={3} />
      {mes ? (
        <CelulaAcoes
          mes={mes}
          indicador={3}
          alvoId={l.chamadoId}
          rotulo={`chamado ${l.ticketNumber}`}
          l={l}
        />
      ) : null}
    </TableRow>
  );
}

export function LinhaDoI4({ l, mes }: { l: LinhaI4; mes: MesImr | null }) {
  const riscada = l.situacao === 'desconsiderada' ? RISCADA : '';
  return (
    <TableRow>
      <TableCell className={cn('font-medium whitespace-nowrap', riscada)}>{l.numero}</TableCell>
      <TableCell className={cn('whitespace-nowrap', riscada)}>{l.chamadoTicketNumber}</TableCell>
      <TableCell className={cn('whitespace-nowrap tabular-nums', riscada)}>
        {l.autorizadoEm ? dataHora(l.autorizadoEm) : 'autorização desfeita'}
      </TableCell>
      <TableCell className={cn('whitespace-nowrap tabular-nums', riscada)}>
        {dataHora(l.prazo)}
        {l.prazoEstimado ? (
          <span className="block text-xs text-muted-foreground">prazo estimado</span>
        ) : null}
      </TableCell>
      <TableCell className={cn('whitespace-nowrap tabular-nums', riscada)}>
        {l.executadoEm ? dataHora(l.executadoEm) : 'sem execução'}
      </TableCell>
      <CelulaSituacao l={l} indicador={4} />
      {mes ? (
        <CelulaAcoes
          mes={mes}
          indicador={4}
          alvoId={l.cotacaoId}
          rotulo={`cotação ${l.numero}`}
          l={l}
        />
      ) : null}
    </TableRow>
  );
}
