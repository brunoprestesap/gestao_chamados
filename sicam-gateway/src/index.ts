import { criarApp } from './app.js';
import { consultasOracle, fecharPool } from './oracle.js';

const porta = Number(process.env.SICAM_GATEWAY_PORT ?? 3002);
const segredo = process.env.SICAM_GATEWAY_SECRET ?? '';

if (!segredo) {
  console.warn('[sicam-gateway] SICAM_GATEWAY_SECRET vazio: todas as consultas respondem 401.');
}

const servidor = criarApp(segredo, consultasOracle).listen(porta, () => {
  console.warn(`[sicam-gateway] ouvindo na porta ${porta}`);
});

async function encerrar() {
  servidor.close();
  await fecharPool();
  process.exit(0);
}

process.on('SIGTERM', () => void encerrar());
process.on('SIGINT', () => void encerrar());
