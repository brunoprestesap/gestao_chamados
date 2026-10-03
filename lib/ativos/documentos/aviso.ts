import type { LimiteAlerta } from '@/shared/ativos/documento.constants';

import { formatarDataDocumento } from './situacao';

/**
 * Conteúdo do aviso de vencimento (spec 0013, AC-12), um só texto para a
 * `Notification` e para o e-mail. Sem `server-only`: só monta texto.
 */

export type AlvoDoAviso =
  | { tipo: 'ativo'; ativoId: string; codigo: string; descricao: string; predioId: string | null }
  | {
      tipo: 'local';
      localizacaoId: string;
      nome: string;
      caminho: string;
      predioId: string | null;
    };

export type DocumentoDoAviso = {
  id: string;
  tipo: string;
  tipoNome: string;
  numero: string | null;
  emitidoPor: string | null;
  validadeAte: Date;
};

export type DataNotificacaoDocumento = {
  documentoId: string;
  tipo: string;
  limite: LimiteAlerta;
  ativoId?: string;
  localizacaoId?: string;
  predioId?: string;
};

export type AvisoVencimento = {
  titulo: string;
  corpo: string;
  data: DataNotificacaoDocumento;
};

function rotuloCurto(alvo: AlvoDoAviso): string {
  return alvo.tipo === 'ativo' ? alvo.codigo : alvo.nome;
}

function rotuloCompleto(alvo: AlvoDoAviso): string {
  return alvo.tipo === 'ativo' ? `${alvo.codigo} (${alvo.descricao})` : alvo.caminho;
}

export function tituloDoAviso(
  doc: Pick<DocumentoDoAviso, 'tipoNome' | 'validadeAte'>,
  alvo: AlvoDoAviso,
  limite: LimiteAlerta,
  dias: number,
): string {
  const base = `${doc.tipoNome} do ${rotuloCurto(alvo)}`;
  if (limite === 'vencido') return `${base} venceu em ${formatarDataDocumento(doc.validadeAte)}`;
  if (dias <= 0) return `${base} vence hoje`;
  return `${base} vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

export function montarAviso(
  doc: DocumentoDoAviso,
  alvo: AlvoDoAviso,
  limite: LimiteAlerta,
  dias: number,
): AvisoVencimento {
  const titulo = tituloDoAviso(doc, alvo, limite, dias);
  const corpo = [
    `Tipo: ${doc.tipoNome}`,
    `${alvo.tipo === 'ativo' ? 'Equipamento' : 'Local'}: ${rotuloCompleto(alvo)}`,
    doc.numero ? `Número: ${doc.numero}` : null,
    `Validade: ${formatarDataDocumento(doc.validadeAte)}`,
    doc.emitidoPor ? `Emitido por: ${doc.emitidoPor}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const data: DataNotificacaoDocumento = { documentoId: doc.id, tipo: doc.tipo, limite };
  if (alvo.tipo === 'ativo') data.ativoId = alvo.ativoId;
  else data.localizacaoId = alvo.localizacaoId;
  if (alvo.predioId) data.predioId = alvo.predioId;
  return { titulo, corpo, data };
}
