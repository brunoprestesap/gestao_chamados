import { describe, expect, it } from 'vitest';

import { addElapsedMinutes, evaluateResolutionBreach } from '@/lib/sla-utils';

// ── addElapsedMinutes ────────────────────────────────────────────

describe('addElapsedMinutes', () => {
  it('deve adicionar minutos positivos à data base', () => {
    // Arrange
    const from = new Date('2024-06-10T10:00:00.000Z');
    const minutes = 60;

    // Act
    const result = addElapsedMinutes(from, minutes);

    // Assert
    expect(result.getTime()).toBe(new Date('2024-06-10T11:00:00.000Z').getTime());
  });

  it('deve adicionar 0 minutos retornando a mesma data', () => {
    // Arrange
    const from = new Date('2024-06-10T08:00:00.000Z');

    // Act
    const result = addElapsedMinutes(from, 0);

    // Assert
    expect(result.getTime()).toBe(from.getTime());
  });

  it('deve adicionar 1 minuto corretamente (60 000 ms)', () => {
    // Arrange
    const from = new Date('2024-06-10T10:00:00.000Z');

    // Act
    const result = addElapsedMinutes(from, 1);

    // Assert
    expect(result.getTime() - from.getTime()).toBe(60_000);
  });

  it('deve funcionar independente de businessHoursOnly (sempre tempo real)', () => {
    // Arrange — pausa iniciada numa sexta às 17h, durou 180 min (atravessa fim de expediente)
    const from = new Date('2024-06-14T20:00:00.000Z'); // sexta 17h Belém
    const pausedMinutes = 180;

    // Act — ajuste é sempre tempo real
    const result = addElapsedMinutes(from, pausedMinutes);

    // Assert — deve ser exatamente 3h depois, independente de horário comercial
    expect(result.getTime()).toBe(new Date('2024-06-14T23:00:00.000Z').getTime());
  });

  it('deve adicionar pausa de múltiplos dias corretamente', () => {
    // Arrange — pausa de 3 dias completos = 4320 minutos
    const from = new Date('2024-06-10T10:00:00.000Z');
    const minutesInThreeDays = 3 * 24 * 60;

    // Act
    const result = addElapsedMinutes(from, minutesInThreeDays);

    // Assert
    expect(result.getTime()).toBe(new Date('2024-06-13T10:00:00.000Z').getTime());
  });

  it('deve não mutar o objeto from original', () => {
    // Arrange
    const from = new Date('2024-06-10T10:00:00.000Z');
    const originalTime = from.getTime();

    // Act
    addElapsedMinutes(from, 120);

    // Assert
    expect(from.getTime()).toBe(originalTime);
  });
});

// ── evaluateResolutionBreach (com prazo ajustado pós-pausa) ──────

describe('evaluateResolutionBreach', () => {
  it('deve retornar null quando resolutionDueAt é null', () => {
    // Arrange
    const now = new Date('2024-06-10T12:00:00.000Z');

    // Act
    const result = evaluateResolutionBreach(now, null, null);

    // Assert
    expect(result).toBeNull();
  });

  it('deve retornar null quando está dentro do prazo', () => {
    // Arrange
    const now = new Date('2024-06-10T10:00:00.000Z');
    const resolutionDueAt = new Date('2024-06-10T18:00:00.000Z');

    // Act
    const result = evaluateResolutionBreach(now, resolutionDueAt, null);

    // Assert
    expect(result).toBeNull();
  });

  it('deve retornar now quando prazo foi ultrapassado sem resolução', () => {
    // Arrange
    const now = new Date('2024-06-10T20:00:00.000Z');
    const resolutionDueAt = new Date('2024-06-10T18:00:00.000Z');

    // Act
    const result = evaluateResolutionBreach(now, resolutionDueAt, null);

    // Assert
    expect(result).toBe(now);
  });

  it('deve retornar null quando resolvido antes do prazo', () => {
    // Arrange
    const now = new Date('2024-06-10T20:00:00.000Z');
    const resolutionDueAt = new Date('2024-06-10T18:00:00.000Z');
    const resolvedAt = new Date('2024-06-10T17:00:00.000Z');

    // Act
    const result = evaluateResolutionBreach(now, resolutionDueAt, resolvedAt);

    // Assert
    expect(result).toBeNull();
  });

  it('deve retornar resolvedAt quando resolvido após o prazo', () => {
    // Arrange
    const now = new Date('2024-06-10T22:00:00.000Z');
    const resolutionDueAt = new Date('2024-06-10T18:00:00.000Z');
    const resolvedAt = new Date('2024-06-10T19:00:00.000Z');

    // Act
    const result = evaluateResolutionBreach(now, resolutionDueAt, resolvedAt);

    // Assert
    expect(result).toBe(resolvedAt);
  });

  it('deve não acusar breach quando prazo foi estendido pela pausa e ainda há tempo restante', () => {
    // Arrange — ticket com prazo original 10h, pausa de 2h, prazo ajustado para 12h
    const originalDueAt = new Date('2024-06-10T10:00:00.000Z');
    const pausedMinutes = 120; // 2 horas de pausa
    const adjustedDueAt = addElapsedMinutes(originalDueAt, pausedMinutes); // 12h
    const now = new Date('2024-06-10T11:00:00.000Z'); // 11h — dentro do prazo ajustado

    // Act
    const result = evaluateResolutionBreach(now, adjustedDueAt, null);

    // Assert
    expect(result).toBeNull();
  });

  it('deve acusar breach quando prazo ajustado ainda não é suficiente', () => {
    // Arrange — pausa curta mas já passou do prazo ajustado
    const originalDueAt = new Date('2024-06-10T10:00:00.000Z');
    const pausedMinutes = 30;
    const adjustedDueAt = addElapsedMinutes(originalDueAt, pausedMinutes); // 10h30
    const now = new Date('2024-06-10T11:00:00.000Z'); // 11h — passou do ajustado

    // Act
    const result = evaluateResolutionBreach(now, adjustedDueAt, null);

    // Assert
    expect(result).toBe(now);
  });

  it('deve considerar prazo no exato mesmo instante como dentro do prazo', () => {
    // Arrange — now === resolutionDueAt (não é >)
    const exato = new Date('2024-06-10T18:00:00.000Z');

    // Act
    const result = evaluateResolutionBreach(exato, exato, null);

    // Assert
    expect(result).toBeNull();
  });
});

// ── Lógica de cálculo de pausedMinutes ──────────────────────────

describe('lógica de cálculo de pausedMinutes', () => {
  it('deve calcular pausedMinutes corretamente a partir de slaPausedAt e now', () => {
    // Arrange
    const slaPausedAt = new Date('2024-06-10T10:00:00.000Z');
    const now = new Date('2024-06-10T11:30:00.000Z'); // 90 minutos depois

    // Act — replica a lógica do actions.ts
    const pausedMs = now.getTime() - slaPausedAt.getTime();
    const pausedMinutes = Math.max(0, Math.round(pausedMs / 60_000));

    // Assert
    expect(pausedMinutes).toBe(90);
  });

  it('deve calcular pausedMinutes de 0 quando pausa é imediatamente retomada', () => {
    // Arrange
    const slaPausedAt = new Date('2024-06-10T10:00:00.000Z');
    const now = new Date('2024-06-10T10:00:00.000Z'); // mesmo instante

    // Act
    const pausedMs = now.getTime() - slaPausedAt.getTime();
    const pausedMinutes = Math.max(0, Math.round(pausedMs / 60_000));

    // Assert
    expect(pausedMinutes).toBe(0);
  });

  it('deve arredondar pausedMinutes para o minuto mais próximo', () => {
    // Arrange — pausa de 90.4 segundos (1.5067 min → arredonda para 2)
    const slaPausedAt = new Date('2024-06-10T10:00:00.000Z');
    const now = new Date(slaPausedAt.getTime() + 90_400); // 90.4 segundos

    // Act
    const pausedMs = now.getTime() - slaPausedAt.getTime();
    const pausedMinutes = Math.max(0, Math.round(pausedMs / 60_000));

    // Assert
    expect(pausedMinutes).toBe(2);
  });

  it('deve retornar 0 se now for anterior a slaPausedAt (Math.max proteção)', () => {
    // Arrange — clock skew hipotético
    const slaPausedAt = new Date('2024-06-10T10:05:00.000Z');
    const now = new Date('2024-06-10T10:00:00.000Z'); // anterior

    // Act
    const pausedMs = now.getTime() - slaPausedAt.getTime();
    const pausedMinutes = Math.max(0, Math.round(pausedMs / 60_000));

    // Assert
    expect(pausedMinutes).toBe(0);
  });

  it('deve calcular pausa de vários dias (ex: fim de semana)', () => {
    // Arrange — pausa sexta 17h, retomada segunda 08h = 2340 min = 39 horas
    const slaPausedAt = new Date('2024-06-14T20:00:00.000Z'); // sexta 17h BRT (UTC-3)
    const now = new Date('2024-06-17T11:00:00.000Z');          // segunda 08h BRT

    // Act
    const pausedMs = now.getTime() - slaPausedAt.getTime();
    const pausedMinutes = Math.max(0, Math.round(pausedMs / 60_000));

    // Assert — 63h = 3780 min
    expect(pausedMinutes).toBe(3780);
  });

  it('deve ajustar resolutionDueAt somando pausedMinutes em tempo real', () => {
    // Arrange
    const currentDueAt = new Date('2024-06-10T18:00:00.000Z');
    const slaPausedAt = new Date('2024-06-10T14:00:00.000Z');
    const now = new Date('2024-06-10T16:00:00.000Z'); // 2h de pausa

    // Act — replica lógica do resumeFromRequesterAction
    const pausedMs = now.getTime() - slaPausedAt.getTime();
    const pausedMinutes = Math.max(0, Math.round(pausedMs / 60_000));
    const newResolutionDueAt = addElapsedMinutes(currentDueAt, pausedMinutes);

    // Assert — prazo deve ser estendido em 120 min
    expect(pausedMinutes).toBe(120);
    expect(newResolutionDueAt.getTime()).toBe(new Date('2024-06-10T20:00:00.000Z').getTime());
  });

  it('deve acumular totalPausedMinutes em múltiplas pausas', () => {
    // Arrange — dois ciclos de pausa
    const pausa1 = 45; // minutos
    const pausa2 = 90; // minutos
    let totalPausedMinutes = 0;

    // Act — simula acumulação após cada retomada
    totalPausedMinutes += pausa1;
    totalPausedMinutes += pausa2;

    // Assert
    expect(totalPausedMinutes).toBe(135);
  });

  it('deve estender prazo acumulado de múltiplas pausas corretamente', () => {
    // Arrange — prazo original, duas pausas acumuladas
    const originalDueAt = new Date('2024-06-10T18:00:00.000Z');
    const pausa1Minutes = 60;
    const pausa2Minutes = 30;

    // Act — primeira pausa estende o prazo
    const dueAtAposPausa1 = addElapsedMinutes(originalDueAt, pausa1Minutes);
    // segunda pausa estende sobre o prazo já ajustado
    const dueAtAposPausa2 = addElapsedMinutes(dueAtAposPausa1, pausa2Minutes);

    // Assert — prazo total estendido em 90 min
    expect(dueAtAposPausa2.getTime()).toBe(
      new Date('2024-06-10T19:30:00.000Z').getTime(),
    );
  });
});
