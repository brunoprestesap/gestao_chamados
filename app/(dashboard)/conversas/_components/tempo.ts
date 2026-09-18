/**
 * Datas formatadas no fuso do navegador (spec 0003). O servidor manda sempre
 * ISO; quem decide como isso aparece é a máquina de quem lê.
 */

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const DIA_CURTO = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
const DIA_LONGO = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });

function paraData(iso: string): Date | null {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Só a hora: `09:12`. */
export function hora(iso: string): string {
  const data = paraData(iso);
  return data ? HORA.format(data) : '';
}

/** Chave do dia, para saber quando desenhar o separador de data. */
export function chaveDoDia(iso: string): string {
  const data = paraData(iso);
  if (!data) return '';
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

/** Título do separador: `hoje`, `ontem` ou `17 de setembro`. */
export function rotuloDoDia(iso: string, agora = new Date()): string {
  const data = paraData(iso);
  if (!data) return '';

  if (chaveDoDia(iso) === chaveDoDia(agora.toISOString())) return 'hoje';

  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  if (chaveDoDia(iso) === chaveDoDia(ontem.toISOString())) return 'ontem';

  return DIA_LONGO.format(data);
}

/**
 * Data curta da lateral: `agora`, `há 12 min`, `ontem`, `12 mai`. O objetivo é
 * dar a idade da linha em um relance, não a data exata.
 */
export function quando(iso: string, agora = new Date()): string {
  const data = paraData(iso);
  if (!data) return '';

  const minutos = Math.floor((agora.getTime() - data.getTime()) / 60000);

  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;

  if (chaveDoDia(iso) === chaveDoDia(agora.toISOString())) return HORA.format(data);

  const ontem = new Date(agora);
  ontem.setDate(ontem.getDate() - 1);
  if (chaveDoDia(iso) === chaveDoDia(ontem.toISOString())) return 'ontem';

  return DIA_CURTO.format(data);
}

/** Data completa para o cabeçalho do chamado: `17 de setembro às 08:40`. */
export function dataEHora(iso: string): string {
  const data = paraData(iso);
  return data ? `${DIA_LONGO.format(data)} às ${HORA.format(data)}` : '';
}

/** Valor do atributo `datetime` do `<time>`, quando a data é válida. */
export function iso(valor: string): string | undefined {
  return paraData(valor) ? valor : undefined;
}
