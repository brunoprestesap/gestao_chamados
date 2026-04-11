import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const secure = process.env.SMTP_SECURE === 'true';
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

export const FROM_ADDRESS = process.env.SMTP_FROM ?? 'sigma@ap.trf1.gov.br';

let smtpConfigured = true;

if (!host) {
  smtpConfigured = false;
  console.warn('[email] SMTP_HOST n\u00e3o definido \u2014 envio de e-mails desabilitado.');
}

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    })
  : null;

export { smtpConfigured, transporter };
