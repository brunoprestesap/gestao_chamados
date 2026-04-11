import { dbConnect } from '@/lib/db';
import type { AllowedEmitEvents } from '@/lib/realtime-emit';
import { UserModel } from '@/models/user.model';

import { renderNotificationEmail } from './templates';
import { FROM_ADDRESS, smtpConfigured, transporter } from './transporter';

/**
 * Rate limiter simples em mem\u00f3ria: m\u00e1ximo 10 e-mails/minuto por destinat\u00e1rio.
 * Map<userId, timestamp[]>
 */
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(userId, recent);
    return true;
  }

  recent.push(now);
  rateLimitMap.set(userId, recent);
  return false;
}

interface NotificationPayload {
  ticketId?: string;
  ticketNumber?: string;
  title?: string;
  [key: string]: unknown;
}

/**
 * Envia e-mail de notifica\u00e7\u00e3o para um usu\u00e1rio. Fire-and-forget:
 * - Se SMTP n\u00e3o configurado, pula silenciosamente.
 * - Se usu\u00e1rio sem email, pula silenciosamente.
 * - Erros apenas logados, nunca throw.
 * @returns true se enviou, false se pulou ou falhou.
 */
export async function sendNotificationEmail(
  userId: string,
  type: AllowedEmitEvents,
  payload: NotificationPayload,
): Promise<boolean> {
  if (!smtpConfigured || !transporter) return false;

  try {
    await dbConnect();

    const user = await UserModel.findById(userId).select('email name').lean();
    if (!user?.email) return false;

    if (isRateLimited(userId)) {
      console.warn(`[email] rate limit atingido para usu\u00e1rio ${userId}, e-mail ignorado.`);
      return false;
    }

    const recipientName = user.name ?? 'Usu\u00e1rio';
    const { subject, html } = renderNotificationEmail(type, payload, recipientName);

    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: user.email,
      subject,
      html,
    });

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`[email] falha ao enviar para usu\u00e1rio ${userId}:`, msg);
    return false;
  }
}
