/**
 * Script para testar envio de e-mail via SMTP.
 * Uso: npx tsx scripts/test-email.ts
 */

import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';

// Carrega .env.local manualmente (sem depender de dotenv)
try {
  const envContent = readFileSync('.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const val = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.warn('.env.local nao encontrado, usando variaveis de ambiente do sistema.');
}

const TO = process.argv[2] ?? 'bruno.prestes@trf1.jus.br';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const secure = process.env.SMTP_SECURE === 'true';
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM ?? 'sigma@ap.trf1.gov.br';

if (!host) {
  console.error('SMTP_HOST nao definido no .env.local');
  process.exit(1);
}

console.log(`Conectando a ${host}:${port} (secure=${secure})...`);

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: user && pass ? { user, pass } : undefined,
  logger: true,
  debug: true,
});

async function main() {
  try {
    // Verifica conexao SMTP
    console.log('\n--- Verificando conexao SMTP ---');
    await transporter.verify();
    console.log('Conexao SMTP OK!\n');

    // Envia email de teste
    console.log(`--- Enviando email de teste para ${TO} ---`);
    const info = await transporter.sendMail({
      from,
      to: TO,
      subject: '[Sigma] Teste de notificacao por e-mail',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#4f46e5,#3b82f6);padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:#fff;margin:0;">Sigma</h2>
            <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px;">Sistema Integrado de Manutencao</p>
          </div>
          <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <p>Este e um <strong>e-mail de teste</strong> do sistema de notificacoes do Sigma.</p>
            <p>Se voce recebeu esta mensagem, o SMTP esta configurado corretamente.</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Enviado em: ${new Date().toLocaleString('pt-BR')}</p>
          </div>
        </div>
      `,
    });

    console.log('\nEmail enviado com sucesso!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
  } catch (err) {
    console.error('\nFalha ao enviar email:');
    console.error(err);
    process.exit(1);
  }
}

main();
