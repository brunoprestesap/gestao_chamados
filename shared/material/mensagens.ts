import { formatarReais } from '@/shared/chamados/custo';

import type {
  AcaoCotacao,
  FaseOrcamento,
  MotivoFixo,
  PapelDesignacao,
  PapelEvento,
  PapelReferencia,
  SituacaoCotacao,
  SituacaoProjecao,
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

/** O `conciliar` é ação só da trilha (o job do saldo), fora de `ACOES_COTACAO`. */
export const ROTULO_ACAO: Record<AcaoCotacao | 'conciliar', string> = {
  conciliar: 'Conciliação do saldo',
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
  referencia_acrescentada: 'Referência de preço acrescentada pelo fiscal',
  referencia_retirada: 'Referência de preço retirada pelo fiscal',
  urgencia_recusada: 'Urgência recusada',
  pesquisa_completada: 'Orçamentos acrescentados à pesquisa da urgência',
};

/** Quem informou a referência de preço (AC-32), como a tela e o PDF mostram. */
export const ROTULO_PAPEL_REFERENCIA: Record<PapelReferencia, string> = {
  responsavel_tecnico: 'informada pela contratada',
  fiscal: 'informada pelo fiscal',
};

export const ROTULO_FASE_ORCAMENTO: Record<FaseOrcamento, string> = {
  envio: 'Do envio',
  complemento: 'Complemento da urgência',
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

/** O texto do selo de prazo do ateste (AC-21); `venceEm` é `YYYY-MM-DD`. */
export function textoSeloPrazoAteste(prazo: {
  etapa: keyof typeof ROTULO_ETAPA_ATESTE;
  venceEm: string;
  atrasado: boolean;
}): string {
  const etapa = ROTULO_ETAPA_ATESTE[prazo.etapa];
  const data = prazo.venceEm.split('-').reverse().join('/');
  return prazo.atrasado ? `${etapa} atrasado (prazo ${data})` : `${etapa} até ${data}`;
}

/** A fila de `/cotacoes` (spec 0021): abas, filtros, resumo e estados vazios. */
export const ROTULO_ABA_FILA = {
  minhas: 'Minhas ações',
  analise: 'Análise',
  aprovacao: 'Aprovação',
  ateste: 'Ateste',
  todas: 'Todas',
} as const;

export const TEXTO_FILA = {
  titulo: 'Cotações de material',
  subtitulo: 'Cada pedido de material, do registro do técnico ao ateste.',
  voceAtuaComo: 'Você atua como',
  somenteLeitura: 'Leitura (sem designação)',
  buscaRotulo: 'Buscar cotação',
  buscaPlaceholder: 'Número, chamado ou ativo',
  buscar: 'Buscar',
  limparBusca: 'Limpar busca',
  soUrgentes: 'Só urgentes',
  ordemTramite: 'Mais tempo na etapa',
  ordemTodas: 'Mais recentes',
  anterior: 'Anterior',
  proxima: 'Próxima',
  colunaCotacao: 'Cotação',
  colunaChamado: 'Chamado e ativo',
  colunaSituacao: 'Situação',
  colunaSinais: 'Sinais',
  colunaValor: 'Valor',
  colunaNaEtapa: 'Na etapa há',
  abrir: 'Abrir',
  semSinal: 'Nenhum sinal',
  vazioComFiltro: 'Nenhuma cotação com esses filtros.',
  vazio: {
    minhas: 'Nada esperando por você agora.',
    analise: 'Nenhuma cotação para analisar.',
    aprovacao: 'Nenhuma cotação esperando aprovação.',
    ateste: 'Nenhuma cotação no ateste.',
    todas: 'Nenhuma cotação ainda.',
  },
} as const;

export const ROTULO_SINAL = {
  urgente: 'Urgente',
  notaFiscalPendente: 'NF pendente',
  pesquisaPendente: 'Pesquisa pendente',
} as const;

export const TEXTO_RESUMO_FILA = {
  rotulo: 'Resumo',
  esperandoVoce: 'Esperando você',
  emAprovacao: 'Em aprovação',
  aReservar: (valor: string) => `${valor} a reservar`,
  atesteAtrasado: 'Ateste fora do prazo',
  prazoPorEtapa: 'prazo de 5 dias por etapa',
  saldoElegivel: 'Saldo dos empenhos elegíveis',
  semEmpenhoElegivel: 'nenhum empenho elegível',
  devolvidas: 'Devolvidas',
  devolvidasAjuda: 'voltaram para você corrigir',
  nfPendente: 'NF pendente',
  nfPendenteAjuda: 'atestadas sem nota fiscal',
  esperandoVoceAjuda: 'cotações com a sua vez',
} as const;

/** "Na etapa há" da fila: dias corridos desde o último evento que mudou a situação. */
export function textoNaEtapaHa(dias: number): string {
  if (dias <= 0) return 'hoje';
  return dias === 1 ? '1 dia' : `${dias} dias`;
}

export function textoQuantidadeItens(n: number): string {
  return n === 1 ? '1 item' : `${n} itens`;
}

/** O rodapé da fila: "Mostrando 26–50 de 73". */
export function textoPaginaFila(p: { pagina: number; porPagina: number; total: number }): string {
  if (p.total === 0) return 'Nenhuma cotação';
  const inicio = (p.pagina - 1) * p.porPagina + 1;
  const fim = Math.min(p.pagina * p.porPagina, p.total);
  return `Mostrando ${inicio}–${fim} de ${p.total}`;
}

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
  'classificacao_desatualizada',
  'base_nao_escolhida',
  'conferencia_pendente',
  'anexo_v_acima_sinapi',
  'sem_referencia_sinapi',
  // Fatia 4
  'cnpj_invalido',
  'cnpj_contratada',
  'cnpj_mesma_raiz',
  'sem_referencia',
  'referencia_desatualizada',
  'validade_ausente',
  'variacao_acima',
  'orcamento_vencido',
  'urgencia_sem_decisao',
  'pesquisa_pendente',
  'pesquisa_posterior_divergente',
  // Fatia 5
  'fracionamento',
  'reincidencia',
  'consumo_acima_estimado',
  'item_parecido',
  'projecao_esgotamento',
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
  classificacao_desatualizada: {
    tipo: 'impedimento',
    ve: 'todos',
    texto:
      'A tabela de preço mudou e um item não vale mais como foi classificado: classifique o item de novo.',
  },
  base_nao_escolhida: {
    tipo: 'impedimento',
    ve: 'trf1',
    texto:
      'Escolha a base de preço (Anexo V ou SINAPI) de cada item que está nas duas, com justificativa.',
  },
  conferencia_pendente: {
    tipo: 'impedimento',
    ve: 'trf1',
    texto: 'Registre a conferência de cada item da lista de conferência obrigatória.',
  },
  anexo_v_acima_sinapi: {
    tipo: 'advertencia',
    ve: 'trf1',
    texto: 'Preço do Anexo V acima do SINAPI além do percentual admitido.',
  },
  sem_referencia_sinapi: {
    tipo: 'advertencia',
    ve: 'trf1',
    texto: 'Item do Anexo V sem referência SINAPI.',
  },
  cnpj_invalido: {
    tipo: 'impedimento',
    ve: 'todos',
    texto: 'Um orçamento tem CNPJ com dígito verificador inválido.',
  },
  cnpj_contratada: {
    tipo: 'impedimento',
    ve: 'todos',
    texto: 'Um orçamento tem CNPJ da própria contratada (mesma raiz).',
  },
  cnpj_mesma_raiz: {
    tipo: 'impedimento',
    ve: 'todos',
    texto: 'Cada item precisa de orçamentos de 3 empresas diferentes (raízes de CNPJ distintas).',
  },
  sem_referencia: {
    tipo: 'impedimento',
    ve: 'todos',
    texto: 'Cada item com três orçamentos precisa de ao menos uma referência de preço com valor.',
  },
  referencia_desatualizada: {
    tipo: 'impedimento',
    ve: 'todos',
    texto:
      'O código SINAPI de uma referência não está no mês mais recente do SINAPI: troque a referência.',
  },
  validade_ausente: {
    tipo: 'impedimento',
    ve: 'todos',
    texto: 'Informe a validade de cada orçamento.',
  },
  variacao_acima: {
    tipo: 'impedimento',
    ve: 'trf1',
    texto: 'O menor orçamento de um item passa da menor referência além do percentual admitido.',
  },
  orcamento_vencido: {
    tipo: 'advertencia',
    ve: 'trf1',
    texto: 'Orçamento com validade vencida: confirme cada um para encaminhar.',
  },
  urgencia_sem_decisao: {
    tipo: 'impedimento',
    ve: 'trf1',
    texto:
      'A urgência foi pedida e um item ainda não tem orçamentos de 3 empresas: aceite a urgência ou recuse-a.',
  },
  pesquisa_pendente: {
    tipo: 'impedimento',
    ve: 'todos',
    texto:
      'A pesquisa da urgência ainda não tem orçamentos de 3 empresas para cada item; o recebimento definitivo espera por ela.',
  },
  pesquisa_posterior_divergente: {
    tipo: 'advertencia',
    ve: 'trf1',
    texto:
      'Um orçamento acrescentado depois da compra tem preço menor que o aplicado; avalie fora do Sigma.',
  },
  fracionamento: {
    tipo: 'advertencia',
    ve: 'trf1',
    texto:
      'Possível fracionamento: somado ao mesmo item de outras cotações recentes deste equipamento, o valor alcança uma faixa de competência que cada parte sozinha não alcança.',
  },
  reincidencia: {
    tipo: 'advertencia',
    ve: 'trf1',
    texto: 'Reincidência: este equipamento já teve duas ou mais cotações autorizadas na janela.',
  },
  consumo_acima_estimado: {
    tipo: 'advertencia',
    ve: 'trf1',
    texto: 'Com esta cotação, o consumo acumulado do item passa da quantidade estimada no Anexo V.',
  },
  item_parecido: {
    tipo: 'advertencia',
    ve: 'trf1',
    texto:
      'Item com três orçamentos cuja descrição se parece com a de um item do Anexo V ou do SINAPI: confira se ele não tem preço de tabela.',
  },
  projecao_esgotamento: {
    tipo: 'advertencia',
    ve: 'trf1',
    texto:
      'Esta aprovação consome parcela relevante do saldo do empenho; veja a projeção de esgotamento.',
  },
};

/**
 * Advertências da fatia 5 (AC-36, AC-37, AC-39, AC-40): refeitas só no
 * `assumir`, no `encaminhar` e no `aprovar`, sobre o estado do ato; nas
 * outras ações ficam como estão.
 */
export const CODIGOS_ADVERTENCIA_DO_ATO: readonly CodigoControle[] = [
  'fracionamento',
  'reincidencia',
  'consumo_acima_estimado',
  'item_parecido',
];

/** Textos da projeção de esgotamento (AC-38). */
export const TEXTO_SITUACAO_PROJECAO = {
  estimada: 'Data estimada de esgotamento',
  historico_insuficiente: 'Histórico insuficiente (menos de 30 dias de movimento no empenho)',
  sem_consumo: 'Sem consumo no período',
} as const;

/** A projeção de esgotamento em uma frase, para o diálogo de aprovar, a trilha e o PDF (AC-38). */
export function textoProjecao(p: {
  saldoCentavos: number;
  mediaDiariaCentavos: number | null;
  dataEstimada: string | null;
  situacao: SituacaoProjecao;
}): string {
  const saldo = `saldo ${formatarReais(p.saldoCentavos)}`;
  if (p.situacao === 'estimada' && p.dataEstimada) {
    const data = p.dataEstimada.split('-').reverse().join('/');
    return `Projeção: ${saldo}, consumo médio de ${formatarReais(p.mediaDiariaCentavos ?? 0)} por dia, esgota por volta de ${data}.`;
  }
  return `Projeção: ${saldo}; ${TEXTO_SITUACAO_PROJECAO[p.situacao].toLowerCase()}.`;
}

/** Recusas dos parâmetros (AC-42). */
export const ERROS_PARAMETROS = {
  mudou: 'Os parâmetros mudaram desde que você abriu. Recarregue a página.',
  nada_mudou: 'Nenhum parâmetro mudou.',
  recalculo_falhou:
    'Parâmetros gravados, mas a marca automática de anomalia do Anexo V não foi recalculada agora; ela será refeita na próxima importação.',
} as const;

export const ROTULO_PARAMETRO = {
  percentualSinapi: 'Percentual admitido sobre o SINAPI',
  janelaDias: 'Janela do fracionamento e da reincidência (dias)',
  parcelaRelevantePercentual: 'Parcela relevante do saldo (%)',
  raizCnpjContratada: 'Raiz do CNPJ da contratada',
} as const;

/** Divisão por zero no relatório (AC-41): nunca 0%. */
export const TEXTO_SEM_COTACOES_NO_PERIODO = 'sem cotações no período';

/** O quadro da diferença para o SINAPI sem nenhum item do Anexo V com equivalente no período. */
export const TEXTO_SEM_ITENS_COM_EQUIVALENTE = 'nenhum item do Anexo V com equivalente no período';

/** O indicador de impedimento só existe a partir da fatia 5 (AC-41, AC-43). */
export const TEXTO_TENTATIVAS_DESDE_A_FATIA_5 =
  'Conta só as tentativas de envio registradas a partir da entrada deste relatório; períodos anteriores ficam subestimados.';

/** Advertências de preço da fatia 3: recalculadas a cada transição (AC-28). */
export const CODIGOS_ADVERTENCIA_PRECO: readonly CodigoControle[] = [
  'anexo_v_acima_sinapi',
  'sem_referencia_sinapi',
];

/**
 * Advertências refeitas a cada transição, sobre o estado do ato: as de preço
 * e a divergência da pesquisa posterior da urgência (AC-35).
 */
export const CODIGOS_ADVERTENCIA_RECALCULADA: readonly CodigoControle[] = [
  ...CODIGOS_ADVERTENCIA_PRECO,
  'pesquisa_posterior_divergente',
];

// ---------------------------------------------------------------------------
// Fatia 4: CNPJ, referência e urgência
// ---------------------------------------------------------------------------

/** O erro de CNPJ de um orçamento no salvar e no complemento, com o nome do fornecedor (AC-31). */
export function erroCnpjDoOrcamento(
  fornecedor: string,
  codigo: 'cnpj_invalido' | 'cnpj_contratada',
): string {
  const nome = fornecedor.trim() || 'sem nome';
  return codigo === 'cnpj_invalido'
    ? `O CNPJ do orçamento de ${nome} é inválido (dígito verificador). Corrija ou remova o orçamento.`
    : `O orçamento de ${nome} é da própria contratada (mesma raiz de CNPJ). Remova o orçamento.`;
}

/** Recusas das referências de preço e da urgência (AC-32, AC-35). */
export const ERROS_FATIA4 = {
  referencia_repetida: 'Uma referência aparece repetida no item.',
  referencias_demais: 'Até 5 referências por item.',
  codigo_fora_do_mes: 'Este código não está no mês mais recente do SINAPI.',
  sem_sinapi: 'Não há SINAPI importado; use uma referência de fonte livre.',
  data_referencia_futura: 'A data da referência não pode ser posterior a hoje.',
  data_referencia_antiga: 'A data da referência não pode ser de mais de 12 meses atrás.',
  item_fora_do_caminho_3: 'Referência de preço só vale para item com três orçamentos.',
  so_fiscal_que_assumiu: 'Só o fiscal que assumiu a análise faz esta ação.',
  referencia_inexistente: 'Referência não encontrada neste item.',
  referencia_de_outro: 'Só quem incluiu a referência a retira.',
  referencia_ja_retirada: 'Esta referência já foi retirada.',
  urgencia_recusada_antes:
    'A urgência desta cotação já foi recusada e não pode ser pedida de novo.',
  urgencia_justificativa: 'Justifique a urgência.',
  urgencia_nao_pedida: 'Esta cotação não tem urgência pedida.',
  urgencia_ja_decidida: 'A urgência desta cotação já foi decidida.',
  sem_urgencia_aceita: 'Só a cotação com urgência aceita recebe orçamentos depois da autorização.',
  pesquisa_ja_completa: 'A pesquisa desta cotação já está completa.',
  orcamento_existente: 'Um dos orçamentos já existe na cotação; os orçamentos gravados não mudam.',
  orcamentos_demais: 'A cotação aceita até 10 orçamentos.',
  arquivo_do_orcamento: 'Anexe o arquivo de cada orçamento novo (um por orçamento).',
  preco_fora_do_caminho_3: 'O orçamento cita item que não é do caminho de três orçamentos.',
} as const;

// ---------------------------------------------------------------------------
// Fatia 3: classificação, busca e importação
// ---------------------------------------------------------------------------

/** Recusas da classificação de um item (AC-26, AC-30). */
export const ERROS_CLASSIFICACAO = {
  sem_contrato:
    'Não há contrato vigente com Anexo V para o tipo de serviço deste chamado; use o SINAPI ou três orçamentos.',
  item_fora_da_versao:
    'Este item não está no Anexo V vigente do contrato do chamado. Busque de novo.',
  sem_sinapi: 'Não há SINAPI importado; use o Anexo V ou três orçamentos.',
  insumo_fora_do_mes: 'Este insumo não está no mês mais recente do SINAPI. Busque de novo.',
  item_inexistente: 'Item não encontrado na cotação. Salve o rascunho e tente de novo.',
} as const;

/** O insumo SINAPI equivale a mais de um item vigente do Anexo V (_Derivação da origem_). */
export function erroInsumoEquivaleAVarios(numeros: readonly number[]): string {
  const lista = [...numeros].sort((a, b) => a - b);
  const texto =
    lista.length > 1
      ? `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`
      : String(lista[0] ?? '');
  return `Este insumo equivale aos itens ${texto} do Anexo V; escolha um deles.`;
}

/** Recusas da importação do Anexo V e do SINAPI (AC-24, AC-25). */
export const ERROS_IMPORTACAO_MATERIAL = {
  arquivo_ausente: 'Envie o arquivo CSV.',
  arquivo_grande: 'O arquivo passa de 10 MB.',
  arquivo_vazio: 'O arquivo está vazio.',
  linhas_demais: 'O arquivo passa de 20.000 linhas.',
  sem_linhas: 'O arquivo não tem nenhuma linha depois do cabeçalho.',
  contrato_ausente: 'Escolha o contrato do Anexo V.',
  contrato_inexistente: 'Contrato não encontrado.',
  referencia_invalida: 'Informe o mês de referência do SINAPI (mês e ano).',
  mes_ja_importado: 'Este mês já foi importado.',
  ja_pendente: 'Já há uma importação deste tipo aberta. Aplique ou descarte a que está em revisão.',
  fechada: 'Esta importação já foi aplicada, descartada ou expirou.',
  em_aplicacao: 'A importação já está sendo aplicada.',
  anexo_v_mudou: 'O Anexo V mudou depois da revisão; envie o arquivo de novo.',
} as const;

/** Mensagem da recusa por colunas que faltaram no cabeçalho. */
export function erroColunasFaltando(colunas: readonly string[]): string {
  return colunas.length === 1
    ? `Falta a coluna ${colunas[0]} no cabeçalho.`
    : `Faltam as colunas ${colunas.join(', ')} no cabeçalho.`;
}

/** Rótulo da marca de conferência obrigatória de um item do Anexo V (AC-29). */
export function textoMarcaAnomalia(m: { automatica: boolean; manual: boolean }): string | null {
  if (m.automatica && m.manual) return 'acima do SINAPI e marcado pelo Admin';
  if (m.automatica) return 'acima do SINAPI além do percentual';
  if (m.manual) return 'marcado pelo Admin';
  return null;
}

/** Avisos (Notification, e-mail): título por situação nova, sem valor (AC-16). */
export function tituloAvisoCotacao(
  numero: string,
  situacao: SituacaoCotacao,
  urgente = false,
): string {
  // Fatia 4: o envio e a aprovação de uma urgência pedida têm título próprio.
  if (urgente && situacao === 'enviada') return `URGENTE: cotação ${numero} enviada para análise`;
  if (urgente && situacao === 'em_aprovacao') {
    return `URGENTE: cotação ${numero} aguarda aprovação`;
  }
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

/** Aviso da pesquisa da urgência completa (AC-35): vai aos gestores, sem valor. */
export function tituloAvisoPesquisaCompleta(numero: string): string {
  return `Pesquisa de preços completa na cotação urgente ${numero}: o recebimento definitivo foi liberado`;
}

export function tituloAvisoPesquisaAtrasada(numero: string, dias: number): string {
  return `Pesquisa de preços pendente há mais de ${dias} dias na cotação urgente ${numero}`;
}

/** Recusas da nota fiscal (AC-22), por código. */
export const ERROS_NOTA_FISCAL = {
  ja_registrada: 'A nota fiscal já foi registrada.',
  ausente: 'Informe a nota fiscal.',
  data_futura: 'A data da nota fiscal não pode ser posterior a hoje.',
  data_antes_da_autorizacao: 'A data da nota fiscal não pode ser anterior ao dia da autorização.',
  arquivo_ausente: 'Anexe o arquivo da nota fiscal.',
} as const;
export type CodigoErroNotaFiscal = keyof typeof ERROS_NOTA_FISCAL;

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

/** Salvar sem os orçamentos e tirando um item que um orçamento gravado cota. */
export const MSG_ITEM_CITADO_POR_ORCAMENTO =
  'Um orçamento gravado cota um item que você tirou. Tire o preço dos orçamentos antes de remover o item.';

export const MSG_VERSAO_DESATUALIZADA =
  'A cotação mudou desde que você abriu. Recarregue a página.';

/** Material fora de cotação (spec 0018) com a mesma descrição de item de cotação autorizada. */
export function textoJaCotado(numero: string): string {
  return `A cotação de material ${numero} deste chamado já tem um item com esta descrição. Confira se não é o mesmo material.`;
}

// ---------------------------------------------------------------------------
// Spec 0021, fatia 2: o detalhe da cotação
// ---------------------------------------------------------------------------

/** O título curto de cada controle, para o painel "Sua vez" (AC-6, AC-27). */
export const TITULO_CONTROLE: Record<CodigoControle, string> = {
  orcamentos_insuficientes: 'Orçamentos insuficientes',
  saldo_insuficiente: 'Sem saldo no empenho',
  competencia_insuficiente: 'Faixa sem competência',
  designacao_vencida: 'Designação vencida',
  autor_nao_aprova: 'Quem montou não aprova',
  execucao_acima_autorizado: 'Execução acima do autorizado',
  evidencia_ausente: 'Sem evidência',
  divergencia_execucao: 'Execução diferente do autorizado',
  classificacao_desatualizada: 'Classificação desatualizada',
  base_nao_escolhida: 'Base de preço a escolher',
  conferencia_pendente: 'Conferência obrigatória',
  anexo_v_acima_sinapi: 'Anexo V acima do SINAPI',
  sem_referencia_sinapi: 'Sem referência no SINAPI',
  cnpj_invalido: 'CNPJ inválido',
  cnpj_contratada: 'Orçamento da própria contratada',
  cnpj_mesma_raiz: 'Empresas da mesma raiz',
  sem_referencia: 'Sem referência de preço',
  referencia_desatualizada: 'Referência desatualizada',
  validade_ausente: 'Orçamento sem validade',
  variacao_acima: 'Preço acima da referência',
  orcamento_vencido: 'Orçamento vencido',
  urgencia_sem_decisao: 'Urgência a decidir',
  pesquisa_pendente: 'Pesquisa de preços pendente',
  pesquisa_posterior_divergente: 'Pesquisa posterior com preço menor',
  fracionamento: 'Possível fracionamento',
  reincidencia: 'Reincidência',
  consumo_acima_estimado: 'Consumo acima do estimado',
  item_parecido: 'Item parecido com tabela',
  projecao_esgotamento: 'Saldo perto de acabar',
};

/**
 * O texto do controle para vir depois do título curto: alguns textos trazem o
 * próprio rótulo antes dos dois pontos ("Reincidência: …"), escritos para
 * aparecer sozinhos no PDF e nos avisos, e aqui o rótulo sairia repetido.
 */
export function textoDoControleSemRotulo(codigo: CodigoControle): string {
  const texto = CONTROLES[codigo]?.texto ?? codigo;
  const resto = texto.match(/^[^:.]{1,45}:\s+([\s\S]+)$/)?.[1];
  return resto ? resto.charAt(0).toUpperCase() + resto.slice(1) : texto;
}

/**
 * As ações que fazem a vez de quem lê, na ordem em que viram a ação principal
 * do painel "Sua vez" (AC-6). As do ateste, da pesquisa e da montagem moram
 * numa seção da própria página, e o botão do painel leva até ela.
 */
export const ACOES_DA_VEZ = [
  'aprovar',
  'encaminhar',
  'assumir',
  'executar',
  'receberProvisorio',
  'receberDefinitivo',
  'registrarNotaFiscal',
  'completarPesquisa',
  'montar',
  'editarDiagnostico',
] as const;
export type AcaoDaVez = (typeof ACOES_DA_VEZ)[number];

export const TEXTO_ACAO_DA_VEZ: Record<AcaoDaVez, { titulo: string; botao: string }> = {
  aprovar: { titulo: 'Aprovar e reservar o saldo', botao: 'Aprovar' },
  encaminhar: { titulo: 'Analisar e encaminhar', botao: 'Encaminhar para aprovação' },
  assumir: { titulo: 'Assumir a análise', botao: 'Assumir análise' },
  executar: { titulo: 'Aplicar o material', botao: 'Registrar execução' },
  receberProvisorio: { titulo: 'Receber o material', botao: 'Ir para o ateste' },
  receberDefinitivo: { titulo: 'Atestar o recebimento', botao: 'Ir para o ateste' },
  registrarNotaFiscal: { titulo: 'Registrar a nota fiscal', botao: 'Ir para o ateste' },
  completarPesquisa: { titulo: 'Completar a pesquisa de preços', botao: 'Ir para a pesquisa' },
  montar: { titulo: 'Montar e enviar a cotação', botao: 'Ir para a montagem' },
  editarDiagnostico: { titulo: 'Revisar o material registrado', botao: 'Editar material' },
};

/** As ações secundárias do painel, com o rótulo do botão. */
export const ROTULO_ACAO_SECUNDARIA = {
  devolver: 'Devolver',
  reprovar: 'Reprovar',
  recusarUrgencia: 'Recusar a urgência',
  alterar: 'Pedir alteração',
  cancelar: 'Cancelar cotação',
  descartar: 'Descartar rascunho',
} as const;

export const TEXTO_SUA_VEZ = {
  rotulo: 'Sua vez',
  rotuloOutros: 'Próximo passo',
  voceAtuaComo: (papel: string) => `Você atua como ${papel}.`,
  semImpedimento: 'Nenhum impedimento',
  impedimentos: 'Impedimentos',
  pontosAResolver: 'Para encaminhar',
  advertencias: 'Advertências',
  outrasAcoes: 'Outras ações',
  ninguem: 'Nenhuma ação pendente nesta cotação.',
  vezDe: (papel: string, nome: string | null) =>
    `Agora é a vez de: ${papel}${nome ? ` (${nome})` : ''}.`,
  orcamentosVencidos: (fornecedores: string) => `De ${fornecedores}: confirme ao encaminhar.`,
  itensComVariacao: (itens: string) => `${itens}. Acrescente referência, devolva ou reprove.`,
  itensSemBase: (n: number) =>
    n === 1
      ? '1 item com as duas tabelas: escolha a base.'
      : `${n} itens com as duas tabelas: escolha a base.`,
  itensNaLista: (n: number) =>
    n === 1
      ? '1 item na lista de conferência obrigatória.'
      : `${n} itens na lista de conferência obrigatória.`,
  urgenciaParaAceite: 'A urgência pedida precisa do seu aceite ao encaminhar.',
} as const;

export const TEXTO_DETALHE = {
  trilhaNavegacao: 'Trilha de navegação',
  chamado: 'Chamado',
  ativo: 'Ativo',
  montadaPor: 'Montada por',
  daContratada: '(contratada)',
  total: 'Total da cotação',
  executado: 'Executado',
  abaItens: 'Itens e preços',
  abaOrcamentos: (n: number) => `Orçamentos (${n})`,
  abaTrilha: 'Trilha',
  conteudo: 'Conteúdo da cotação',
  tabelaItens: 'Tabela de itens e preços',
  gradeOrcamentos: 'Grade de preços por fornecedor',
  colunaItem: 'Item',
  colunaOrigem: 'Origem do preço',
  colunaQuantidade: 'Qtd.',
  colunaUnitario: 'Unitário',
  colunaValor: 'Valor',
  colunaAplicado: 'Aplicado',
  provisorio: 'provisório',
  acrescentarReferencia: 'Acrescentar referência do fiscal',
  semOrcamentos: 'Nenhum orçamento nesta cotação.',
  orcamentosAjuda: 'Preço unitário de cada fornecedor por item. O menor preço vira a base.',
  naoCotou: 'não cotou',
  menorPreco: 'menor preço',
  validade: (data: string) => `validade ${data}`,
  semValidade: 'validade não informada',
  validadeVencida: 'validade vencida',
  vencidaConfirmada: (nome: string | null, quando: string) =>
    `vencida, confirmada pelo fiscal${nome ? ` (${nome})` : ''} em ${quando}`,
  arquivoDoOrcamento: (fornecedor: string) => `Orçamento de ${fornecedor}`,
  semTrilha: 'Nenhum ato registrado ainda.',
  motivo: 'Motivo',
  limiteNoAto: (v: string) => `limite no ato ${v}`,
  reservado: (v: string) => `reservado ${v}`,
  liberado: (v: string) => `liberado ${v}`,
  evidencias: 'Evidências da aplicação',
  documento: 'Documento',
  urgenciaAceita: (nome: string | null) => `Urgência aceita${nome ? ` por ${nome}` : ''}`,
  urgenciaRecusada: 'Urgência recusada',
  urgenciaPedida: 'Urgência pedida, aguardando a decisão do fiscal',
  justificativa: 'Justificativa',
  motivoDaRecusa: 'Motivo da recusa',
  pesquisaPendente:
    'A pesquisa de preços ainda não tem orçamentos de 3 empresas para cada item. O recebimento definitivo espera por ela.',
  pesquisaCompletaEm: (quando: string) => `Pesquisa de preços completa em ${quando}.`,
} as const;

export const TEXTO_EMPENHO_DETALHE = {
  titulo: 'Empenho',
  comprometido: 'Comprometido',
  estaCotacao: 'Esta cotação',
  saldoDepois: 'Saldo depois',
  saldo: 'Saldo',
  liquido: (v: string) => `Líquido ${v}`,
  semSaldo: 'sem saldo para esta cotação',
  semElegivel:
    'Nenhum empenho elegível cadastrado. A cotação não pode ser encaminhada nem aprovada.',
  semEmpenhoDaCotacao: 'O empenho desta cotação não foi encontrado.',
  podemAprovar: (nomes: string) => `Podem aprovar este valor: ${nomes}.`,
  ninguemAprova: 'Nenhum aprovador vigente com faixa suficiente para este valor.',
  rotuloBarra: (p: { numero: string; comprometido: string; esta: string | null; depois: string }) =>
    `Empenho ${p.numero}: comprometido ${p.comprometido}${p.esta ? `, esta cotação ${p.esta}` : ''}, saldo depois ${p.depois}.`,
} as const;
