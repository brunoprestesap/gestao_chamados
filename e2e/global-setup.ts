/**
 * Garante usuários locais usados pelos testes E2E (mesma senha do seed: 123456).
 * Executa antes do Playwright subir os testes; requer MONGODB_URI (carrega .env.local se existir).
 *
 * Desative com: E2E_SKIP_DB_SEED=1 npm run test:e2e
 */
import bcrypt from 'bcryptjs';
import { existsSync, readFileSync } from 'fs';
import mongoose from 'mongoose';
import { resolve } from 'path';

function loadMongoUriFromEnvLocal(): void {
  if (process.env.MONGODB_URI) return;
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  const text = readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key === 'MONGODB_URI') process.env.MONGODB_URI = val;
  }
}

const E2E_USERS: Array<{
  username: string;
  name: string;
  role: 'Admin' | 'Preposto' | 'Técnico' | 'Solicitante';
}> = [
  { username: 'admin', name: 'Administrador E2E', role: 'Admin' },
  { username: 'preposto', name: 'Preposto E2E', role: 'Preposto' },
  { username: 'tecnico', name: 'Técnico 01 E2E', role: 'Técnico' },
  { username: 'tecnico2', name: 'Técnico 02 E2E', role: 'Técnico' },
  { username: 'solicitante', name: 'Solicitante E2E', role: 'Solicitante' },
];

export default async function globalSetup() {
  if (process.env.E2E_SKIP_DB_SEED === '1') {
    console.warn('[e2e global-setup] E2E_SKIP_DB_SEED=1 — pulando seed de usuários.');
    return;
  }

  loadMongoUriFromEnvLocal();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn(
      '[e2e global-setup] MONGODB_URI não definido — rode o seed (scripts/seed.js) ou configure .env.local.',
    );
    return;
  }

  await mongoose.connect(uri);
  try {
    const db = mongoose.connection.db;
    if (!db) return;

    const units = db.collection('units');
    const users = db.collection('users');
    const firstUnit = await units.findOne({});
    const unitId = firstUnit?._id;

    const passwordHash = await bcrypt.hash('123456', 10);
    const now = new Date();

    for (const u of E2E_USERS) {
      // $set só credenciais/ativo — não sobrescrever specialties (seed) nem apagar elegibilidade.
      const setOnly: Record<string, unknown> = {
        passwordHash,
        isActive: true,
        updatedAt: now,
      };
      if (u.role === 'Técnico') {
        setOnly.maxAssignedTickets = 5;
      }

      // Campos exclusivos do insert (não repetir chaves de $set — MongoDB rejeita conflito).
      const onInsert: Record<string, unknown> = {
        username: u.username,
        name: u.name,
        email: `${u.username}@e2e.local`,
        role: u.role,
        createdAt: now,
      };
      if (unitId) onInsert.unitId = unitId;
      if (u.role === 'Técnico') {
        onInsert.specialties = [];
      }

      await users.updateOne(
        { username: u.username },
        { $set: setOnly, $setOnInsert: onInsert },
        { upsert: true },
      );
    }

    // Atribuição filtra por subtypeId do serviço do chamado; cobrir todos os subtipos do seed evita falhas quando o catálogo ainda não existe ou está incompleto.
    const subtypes = await db.collection('servicesubtypes').find({}).project({ _id: 1 }).toArray();
    const allSubtypeIds = subtypes.map((s) => s._id).filter(Boolean);
    if (allSubtypeIds.length > 0) {
      await users.updateMany(
        { username: { $in: ['tecnico', 'tecnico2'] } },
        { $set: { specialties: allSubtypeIds, updatedAt: now } },
      );
    } else {
      console.warn(
        '[e2e global-setup] Collection servicesubtypes vazia — rode scripts/seed.js para atribuição/reatribuição nos E2E.',
      );
    }

    console.warn(
      `[e2e global-setup] Usuários E2E garantidos no MongoDB (${E2E_USERS.length} contas, senha 123456).`,
    );
  } finally {
    await mongoose.disconnect();
  }
}
