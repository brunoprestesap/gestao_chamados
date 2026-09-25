import type { AtribuicaoMotivo } from '@/shared/chamados/atribuicao-automatica.constants';
import { ATRIBUIDO_POR_SISTEMA } from '@/shared/socket';

/**
 * Os títulos dos avisos da atribuição (spec 0008, AC-11 e AC-13), num lugar só.
 * O aviso da gestão e o do técnico saem por três canais (a `Notification`
 * persistida, o email e o toast ao vivo), e o texto tem que ser o mesmo nos
 * três: cada canal chama estas funções em vez de escrever a frase de novo. Puro,
 * sem servidor nem navegador, para servir aos dois lados.
 */

/** A atribuição foi feita pelo próprio Sigma? Quem lê o payload compara o autor com `ATRIBUIDO_POR_SISTEMA`. */
export function atribuidoPeloSistema(assignedBy: { id: string } | null | undefined): boolean {
  return assignedBy?.id === ATRIBUIDO_POR_SISTEMA.id;
}

/** O título do aviso ao técnico: "atribuído a você", com "automaticamente" quando foi o Sigma (AC-11). */
export function tituloDeAtribuicaoAoTecnico(
  ticketNumber: string | null | undefined,
  automatica: boolean,
): string {
  const sufixo = automatica ? ' a você automaticamente' : ' a você';
  return ticketNumber
    ? `Chamado #${ticketNumber} atribuído${sufixo}`
    : `Chamado atribuído${sufixo}`;
}

/**
 * O título do aviso à gestão de um chamado que já nasceu `validado` pela IA,
 * com o resultado da atribuição automática (AC-13). Sem resultado, vale o texto
 * da spec 0007.
 */
export function tituloDeChamadoValidado(
  ticketNumber: string | null | undefined,
  atribuicao:
    | { resultado: 'atribuido'; tecnicoNome: string }
    | { resultado: 'sem_tecnico'; motivo: AtribuicaoMotivo }
    | null
    | undefined,
): string {
  const chamado = ticketNumber ? `Chamado #${ticketNumber}` : 'Chamado';
  if (atribuicao?.resultado === 'atribuido') {
    return `${chamado} validado e atribuído a ${atribuicao.tecnicoNome}`;
  }
  if (atribuicao?.resultado === 'sem_tecnico') {
    return `${chamado} validado, sem técnico disponível`;
  }
  return `${chamado} validado automaticamente`;
}
