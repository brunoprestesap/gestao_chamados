import 'server-only';

import type { AvisoVencimento } from '@/lib/ativos/documentos/aviso';

import { APP_URL, buildHtml, escapeHtml } from './templates';
import { FROM_ADDRESS, smtpConfigured, transporter } from './transporter';

/**
 * E-mail do aviso de vencimento de documento (spec 0013, AC-12). Não passa por
 * `sendNotificationEmail`, que é tipado pelos eventos do socket. Mesmas guardas:
 * sem SMTP ou sem e-mail, pula; erro só é logado, nunca lança.
 * @returns true se enviou.
 */
export async function enviarEmailVencimento(
  destinatario: { email?: string | null; name?: string | null },
  aviso: AvisoVencimento,
  url: string,
): Promise<boolean> {
  if (!smtpConfigured || !transporter) return false;
  if (!destinatario.email) return false;

  const corpoHtml = [
    `<strong>${escapeHtml(aviso.titulo)}.</strong>`,
    ...aviso.corpo.split('\n').map((linha) => escapeHtml(linha)),
  ].join('<br>');
  const link = `${APP_URL}${url}`;

  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: destinatario.email,
      subject: `[Sigma] ${aviso.titulo}`,
      text: `${aviso.titulo}.\n\n${aviso.corpo}\n\n${link}`,
      html: buildHtml(escapeHtml(destinatario.name ?? 'Usuário'), corpoHtml, link, 'Ver documento'),
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn('[email] falha ao enviar aviso de vencimento:', msg);
    return false;
  }
}
