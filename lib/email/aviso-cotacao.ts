import 'server-only';

import { APP_URL, buildHtml, escapeHtml } from './templates';
import { FROM_ADDRESS, smtpConfigured, transporter } from './transporter';

/**
 * E-mail do aviso de cotação de material (spec 0019, AC-16). Nunca leva
 * valor: só o título com número e situação. Sem SMTP ou sem e-mail, pula;
 * erro só é logado, nunca lança.
 */
export async function enviarEmailCotacao(
  destinatario: { email?: string | null; name?: string | null },
  titulo: string,
  url: string,
): Promise<boolean> {
  if (!smtpConfigured || !transporter) return false;
  if (!destinatario.email) return false;
  const link = `${APP_URL}${url}`;
  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: destinatario.email,
      subject: `[Sigma] ${titulo}`,
      text: `${titulo}.\n\n${link}`,
      html: buildHtml(
        escapeHtml(destinatario.name ?? 'Usuário'),
        `<strong>${escapeHtml(titulo)}.</strong>`,
        link,
        'Ver cotação',
      ),
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn('[email] falha ao enviar aviso de cotação:', msg);
    return false;
  }
}
