/**
 * Valida os 4 cenários de SLA após correções.
 * Executar: npx tsx scripts/test-sla-validar.ts
 */
import { computeSlaDueDatesFromConfig } from '../lib/sla-utils';

const TZ = 'America/Belem';

function fmt(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

console.log('=== Validação dos cenários de SLA (pós-correção) ===\n');

// Cenário 1: Segunda 09:00 Belem, NORMAL (1 dia resposta, 3 dias solução)
const c1 = new Date(Date.UTC(2025, 0, 6, 12, 0, 0, 0)); // Seg 09:00 Belem
const r1 = computeSlaDueDatesFromConfig(c1, 600, 1800, true);
console.log('Cenário 1 — Seg 09:00 NORMAL:');
console.log('  responseDueAt:', fmt(r1.responseDueAt), '(esperado: ter 09:00)');
console.log('  resolutionDueAt:', fmt(r1.resolutionDueAt), '(esperado: qui 09:00)');
const ok1 =
  fmt(r1.responseDueAt).includes('ter') &&
  fmt(r1.responseDueAt).includes('09:00') &&
  fmt(r1.resolutionDueAt).includes('qui') &&
  fmt(r1.resolutionDueAt).includes('09:00');
console.log('  OK:', ok1 ? '✓' : '✗');

// Cenário 2: Sexta 19:00 Belem, NORMAL (start → seg 08:00; 1 dia = 600min → seg 18:00; 3 dias = 1800min → qua 18:00)
const c2 = new Date(Date.UTC(2025, 0, 10, 22, 0, 0, 0)); // Sex 19:00 Belem
const r2 = computeSlaDueDatesFromConfig(c2, 600, 1800, true);
console.log('\nCenário 2 — Sex 19:00 NORMAL (fora expediente):');
console.log('  responseDueAt:', fmt(r2.responseDueAt), '(esperado: seg 18:00 — 600min de seg 08:00)');
console.log('  resolutionDueAt:', fmt(r2.resolutionDueAt), '(esperado: qua 18:00 — 1800min de seg 08:00)');
const ok2 =
  fmt(r2.responseDueAt).includes('seg') &&
  fmt(r2.responseDueAt).includes('18:00') &&
  fmt(r2.resolutionDueAt).includes('qua') &&
  fmt(r2.resolutionDueAt).includes('18:00');
console.log('  OK:', ok2 ? '✓' : '✗');

// Cenário 3: Sexta 17:00 Belem, ALTA (4h úteis)
const c3 = new Date(Date.UTC(2025, 0, 10, 20, 0, 0, 0)); // Sex 17:00 Belem
const r3 = computeSlaDueDatesFromConfig(c3, 240, 600, true);
console.log('\nCenário 3 — Sex 17:00 ALTA (4h úteis resposta):');
console.log('  responseDueAt:', fmt(r3.responseDueAt), '(esperado: seg 11:00)');
const ok3 = fmt(r3.responseDueAt).includes('seg') && fmt(r3.responseDueAt).includes('11:00');
console.log('  OK:', ok3 ? '✓' : '✗');

// Cenário 4: Sexta 19:00 Belem, EMERGENCIAL 24x7
const r4 = computeSlaDueDatesFromConfig(c2, 60, 480, false);
console.log('\nCenário 4 — Sex 19:00 EMERGENCIAL (1h resposta, 8h solução, 24x7):');
console.log('  responseDueAt:', fmt(r4.responseDueAt), '(esperado: sex 20:00)');
console.log('  resolutionDueAt:', fmt(r4.resolutionDueAt), '(esperado: sáb 03:00)');
const ok4 =
  fmt(r4.responseDueAt).includes('sex') &&
  fmt(r4.responseDueAt).includes('20:00') &&
  fmt(r4.resolutionDueAt).includes('sáb') &&
  fmt(r4.resolutionDueAt).includes('03:00');
console.log('  OK:', ok4 ? '✓' : '✗');

// Cenário 5 (relatado pelo usuário): Sábado 12:07 Belem, ALTA (1h resposta, 8h solução) — deve iniciar seg 08:00
const c5 = new Date(Date.UTC(2026, 0, 31, 15, 7, 0, 0)); // Sáb 31/01/2026 12:07 Belem
const r5 = computeSlaDueDatesFromConfig(c5, 60, 480, true); // 1h, 8h, horário comercial
console.log('\nCenário 5 — Sáb 12:07 ALTA (1h resposta, 8h solução, horário comercial):');
console.log('  responseDueAt:', fmt(r5.responseDueAt), '(esperado: seg 09:00 — 1h após seg 08:00)');
console.log('  resolutionDueAt:', fmt(r5.resolutionDueAt), '(esperado: seg 16:00 — 8h após seg 08:00)');
const ok5 =
  fmt(r5.responseDueAt).includes('seg') &&
  fmt(r5.responseDueAt).includes('09:00') &&
  fmt(r5.resolutionDueAt).includes('seg') &&
  fmt(r5.resolutionDueAt).includes('16:00');
console.log('  OK:', ok5 ? '✓' : '✗');

console.log('\n--- Resumo ---');
const allOk = ok1 && ok2 && ok3 && ok4 && ok5;
console.log(allOk ? 'Todos os cenários passaram ✓' : 'Alguns cenários falharam ✗');
process.exit(allOk ? 0 : 1);
