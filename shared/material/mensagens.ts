import type {
  AcaoCotacao,
  MotivoFixo,
  PapelDesignacao,
  PapelEvento,
  SituacaoCotacao,
} from './material.constants';

/**
 * Mapa único de código para texto (spec 0019): situações, ações, papéis,
 * impedimentos, advertências e motivos fixos. Tela, PDF e aviso leem daqui,
 * para nenhum texto se repetir à mão.
 */

export const ROTULO_SITUACAO: Record<SituacaoCotacao, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  em_analise: 'Em análise',
  em_aprovacao: 'Em aprovação',
  devolvida: 'Devolvida',
  autorizada: 'Autorizada',
  executada: 'Executada',
  atestada: 'Atestada',
  reprovada: 'Reprovada',
  cancelada: 'Cancelada',
};

export const ROTULO_ACAO: Record<AcaoCotacao, string> = {
  criar: 'Material registrado',
  salvar: 'Rascunho salvo',
  enviar: 'Cotação enviada',
  assumir: 'Análise assumida',
  devolver: 'Cotação devolvida',
  reprovar: 'Cotação reprovada',
  encaminhar: 'Encaminhada para aprovação',
  aprovar: 'Cotação autorizada',
  alterar: 'Alteração pedida após autorização',
  executar: 'Execução registrada',
  receber_provisorio: 'Recebimento provisório registrado',
  receber_definitivo: 'Recebimento definitivo registrado (atestada)',
  registrar_nf: 'Nota fiscal registrada',
  cancelar: 'Cotação cancelada',
};

/** De onde vem o preço do item, em palavras de quem lê o PDF sem acompanhar o processo. */
export const ROTULO_ORIGEM: Record<string, string> = {
  anexo_v: 'Anexo V do contrato',
  sinapi: 'SINAPI',
  ambas: 'Anexo V e SINAPI',
  orcamento: 'Três orçamentos',
};

export const ROTULO_BASE: Record<string, string> = {
  anexo_v: 'Anexo V',
  sinapi: 'SINAPI',
  orcamento: 'Menor orçamento',
};

/** Etapas do ateste, para o selo de prazo da fila e do detalhe (AC-21). */
export const ROTULO_ETAPA_ATESTE = {
  provisorio: 'Recebimento provisório',
  definitivo: 'Recebimento definitivo',
} as const;

export const ROTULO_PAPEL: Record<PapelEvento, string> = {
  responsavel_tecnico: 'Responsável técnico',
  fiscal: 'Fiscal',
  gestor: 'Gestor',
  aprovador: 'Aprovador',
  tecnico: 'Técnico',
  sistema: 'Sistema',
};

export const ROTULO_PAPEL_DESIGNACAO: Record<PapelDesignacao, string> = {
  responsavel_tecnico: 'Responsável técnico (contratada)',
  fiscal: 'Fiscal',
  gestor: 'Gestor do contrato',
  aprovador: 'Aprovador',
};

export const TEXTO_MOTIVO_FIXO: Record<MotivoFixo, string> = {
  alteracao_pos_autorizacao: 'Alteração após autorização',
  chamado_cancelado: 'O chamado foi cancelado',
  chamado_recusado: 'O chamado foi recusado',
  conciliacao: 'Reserva sem cotação autorizada, liberada pela conciliação',
};

/** O texto de um motivo gravado: código fixo vira frase, texto livre volta como veio. */
export function textoDoMotivo(motivo: string | null | undefined): string | null {
  if (!motivo) return null;
  return (TEXTO_MOTIVO_FIXO as Record<string, string>)[motivo] ?? motivo;
}

export const CODIGOS_CONTROLE = [
  'orcamentos_insuficientes',
  'saldo_insuficiente',
  'competencia_insuficiente',
  'designacao_vencida',
  'autor_nao_aprova',
  'execucao_acima_autorizado',
  'evidencia_ausente',
  'divergencia_execucao',
] as const;
export type CodigoControle = (typeof CODIGOS_CONTROLE)[number];

export type TipoControle = 'impedimento' | 'advertencia';

/** Quem vê: todos do fluxo (contratada inclusive) ou só o lado TRF1. */
export type VisibilidadeControle = 'todos' | 'trf1';

export const CONTROLES: Record<
  CodigoControle,
  { tipo: TipoControle; ve: VisibilidadeControle; texto: string }
> = {
  orcamentos_insuficientes: {
    tipo: 'impedimento',
    ve: 'todos',
    texto: 'Cada item precisa de preço em ao menos 3 orçamentos.',
  },
  saldo_insuficiente: {
    tipo: 'impedimento',
    ve: 'trf1',
    texto: 'Nenhum empenho elegível tem saldo para o valor desta cotação.',
  },
  competencia_insuficiente: {
    tipo: 'impedimento',
    ve: 'trf1',
    texto: 'O valor passa do limite da sua faixa de competência.',
  },
  designacao_vencida: {
    tipo: 'impedimento',
    ve: 'trf1',
    texto: 'Você não tem designação vigente para este papel.',
  },
  autor_nao_aprova: {
    tipo: 'impedimento',
    ve: 'trf1',
    texto: 'Quem montou a cotação não pode aprová-la.',
  },
  execucao_acima_autorizado: {
    tipo: 'impedimento',
    ve: 'todos',
    texto: 'A quantidade aplicada passa da autorizada.',
  },
  evidencia_ausente: {
    tipo: 'impedimento',
    ve: 'todos',
    texto: 'Anexe ao menos uma evidência da aplicação.',
  },
  divergencia_execucao: {
    tipo: 'advertencia',
    ve: 'trf1',
    texto: 'Divergência na execução: aplicado menos que o autorizado.',
  },
};

/** Avisos (Notification, e-mail): título por situação nova, sem valor (AC-16). */
export function tituloAvisoCotacao(numero: string, situacao: SituacaoCotacao): string {
  const frases: Record<SituacaoCotacao, string> = {
    rascunho: `Material registrado pelo técnico: cotação ${numero}`,
    enviada: `Cotação ${numero} enviada para análise`,
    em_analise: `Cotação ${numero} em análise`,
    em_aprovacao: `Cotação ${numero} aguarda aprovação`,
    devolvida: `Cotação ${numero} devolvida para correção`,
    autorizada: `Cotação ${numero} autorizada`,
    executada: `Cotação ${numero} executada, aguarda recebimento`,
    atestada: `Cotação ${numero} atestada`,
    reprovada: `Cotação ${numero} reprovada`,
    cancelada: `Cotação ${numero} cancelada`,
  };
  return frases[situacao];
}

/** Aviso da nota fiscal registrada (AC-22): vai aos gestores, sem valor. */
export function tituloAvisoNotaFiscal(numero: string): string {
  return `Nota fiscal registrada na cotação ${numero}`;
}

/** Mensagem da conclusão do chamado recusada por cotação em trâmite (AC-13). */
export const MSG_CONCLUSAO_COM_COTACAO =
  'Este chamado tem cotação de material em trâmite. Execute, cancele ou aguarde a decisão da cotação antes de concluir.';

/** Mensagem da retomada manual recusada (AC-2). */
export const MSG_RETOMADA_COM_COTACAO =
  'A pausa deste chamado é de uma cotação de material em trâmite; ele retoma sozinho quando a cotação for decidida.';

/** Envio pelo fluxo antigo recusado (AC-18). */
export const MSG_ENVIO_ANTIGO_FECHADO =
  'O envio de cotação por aqui foi encerrado. Use a cotação de material do chamado.';

/** Aprovação recusada porque outra, da mesma cotação, ainda segura a reserva (AC-8). */
export const MSG_APROVACAO_EM_ANDAMENTO =
  'Outra aprovação desta cotação está em andamento ou parou no meio há poucos minutos. Recarregue a página e, se ela continuar em aprovação, tente de novo daqui a 10 minutos.';

export const MSG_VERSAO_DESATUALIZADA =
  'A cotação mudou desde que você abriu. Recarregue a página.';
