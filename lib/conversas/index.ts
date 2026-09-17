import 'server-only';

/**
 * Único ponto de entrada da conversa e das decisões da IA (spec 0002).
 * Ninguém escreve nas coleções `conversas`, `conversamensagems` e `decisaoias`
 * sem passar por aqui: os valores derivados dependem disso.
 */

export { abrirChamadoDaConversa } from './abertura';
export {
  criarConversa,
  descartarRascunho,
  enviarMensagem,
  lerConversa,
  lerMensagens,
  listarRascunhos,
  situacaoDe,
} from './conversa-store';
export {
  aplicarVeredito,
  derivarIaSituacao,
  derivarSituacao,
  lerDecisoes,
  mesmoValor,
  registrarDecisao,
  resolverDecisao,
  temDecisoes,
} from './decisoes';
export { lerLinhaDoTempo } from './linha-do-tempo';
export type {
  AberturaResultado,
  ConversaLida,
  CorrecaoLida,
  DecisaoEntrada,
  DecisaoLida,
  Falha,
  ItemLinhaDoTempo,
  LinhaDoTempo,
  MensagemLida,
  RascunhoListado,
  Resultado,
  Viewer,
} from './types';
