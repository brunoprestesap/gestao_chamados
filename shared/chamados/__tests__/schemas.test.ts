import { describe, expect, it } from 'vitest';

import {
  AssignTicketSchema,
  ReassignTicketSchema,
} from '@/shared/chamados/assignment.schemas';
import {
  ATTENDANCE_NATURE_VALUES,
  FINAL_PRIORITY_VALUES,
  toAttendanceNature,
} from '@/shared/chamados/chamado.constants';
import {
  ChamadoCreateSchema,
  ClassificarChamadoSchema,
} from '@/shared/chamados/chamado.schemas';
import { CloseTicketSchema } from '@/shared/chamados/close-ticket.schemas';
import { RegisterExecutionSchema } from '@/shared/chamados/execution.schemas';
import { NewTicketFormSchema } from '@/shared/chamados/new-ticket.schemas';

const VALID_ID = 'a'.repeat(24);

// ── toAttendanceNature ───────────────────────────────────────────

describe('toAttendanceNature', () => {
  it('converte Padrão → PADRAO', () => {
    expect(toAttendanceNature('Padrão')).toBe('PADRAO');
  });

  it('converte Urgente → URGENTE', () => {
    expect(toAttendanceNature('Urgente')).toBe('URGENTE');
  });
});

describe('constants', () => {
  it('FINAL_PRIORITY_VALUES tem 4 valores', () => {
    expect(FINAL_PRIORITY_VALUES).toHaveLength(4);
    expect(FINAL_PRIORITY_VALUES).toContain('BAIXA');
    expect(FINAL_PRIORITY_VALUES).toContain('EMERGENCIAL');
  });

  it('ATTENDANCE_NATURE_VALUES tem PADRAO e URGENTE', () => {
    expect(ATTENDANCE_NATURE_VALUES).toEqual(['PADRAO', 'URGENTE']);
  });
});

// ── ClassificarChamadoSchema ─────────────────────────────────────

describe('ClassificarChamadoSchema', () => {
  it('aceita input válido', () => {
    const result = ClassificarChamadoSchema.safeParse({
      chamadoId: VALID_ID,
      naturezaAtendimento: 'Padrão',
      finalPriority: 'NORMAL',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita chamadoId inválido', () => {
    const result = ClassificarChamadoSchema.safeParse({
      chamadoId: 'xyz',
      naturezaAtendimento: 'Padrão',
      finalPriority: 'NORMAL',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita prioridade inválida', () => {
    const result = ClassificarChamadoSchema.safeParse({
      chamadoId: VALID_ID,
      naturezaAtendimento: 'Padrão',
      finalPriority: 'INEXISTENTE',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita natureza inválida', () => {
    const result = ClassificarChamadoSchema.safeParse({
      chamadoId: VALID_ID,
      naturezaAtendimento: 'Inventada',
      finalPriority: 'NORMAL',
    });
    expect(result.success).toBe(false);
  });

  it('faz trim no classificationNotes', () => {
    const result = ClassificarChamadoSchema.safeParse({
      chamadoId: VALID_ID,
      naturezaAtendimento: 'Urgente',
      finalPriority: 'ALTA',
      classificationNotes: '  notas  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.classificationNotes).toBe('notas');
  });
});

// ── NewTicketFormSchema ──────────────────────────────────────────

describe('NewTicketFormSchema', () => {
  const validInput = {
    unitId: VALID_ID,
    localExato: 'Sala 101',
    tipoServico: 'Manutenção Predial' as const,
    descricao: 'Lâmpada queimada',
    naturezaAtendimento: 'Padrão' as const,
    grauUrgencia: 'Normal' as const,
  };

  it('aceita input válido', () => {
    expect(NewTicketFormSchema.safeParse(validInput).success).toBe(true);
  });

  it('rejeita localExato só com espaços (após trim)', () => {
    const result = NewTicketFormSchema.safeParse({ ...validInput, localExato: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejeita descricao vazia', () => {
    const result = NewTicketFormSchema.safeParse({ ...validInput, descricao: '' });
    expect(result.success).toBe(false);
  });

  it('rejeita tipoServico inválido', () => {
    const result = NewTicketFormSchema.safeParse({ ...validInput, tipoServico: 'Inexistente' });
    expect(result.success).toBe(false);
  });

  it('grauUrgencia default é Normal', () => {
    const { grauUrgencia: _, ...withoutGrau } = validInput;
    const result = NewTicketFormSchema.safeParse(withoutGrau);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.grauUrgencia).toBe('Normal');
  });

  it('telefoneContato vazio vira undefined', () => {
    const result = NewTicketFormSchema.safeParse({ ...validInput, telefoneContato: '  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.telefoneContato).toBeUndefined();
  });
});

// ── AssignTicketSchema ───────────────────────────────────────────

describe('AssignTicketSchema', () => {
  it('aceita com técnico preferido', () => {
    const result = AssignTicketSchema.safeParse({
      ticketId: VALID_ID,
      preferredTechnicianId: VALID_ID,
    });
    expect(result.success).toBe(true);
  });

  it('aceita sem técnico preferido (opcional)', () => {
    const result = AssignTicketSchema.safeParse({ ticketId: VALID_ID });
    expect(result.success).toBe(true);
  });

  it('rejeita ticketId inválido', () => {
    const result = AssignTicketSchema.safeParse({ ticketId: 'abc' });
    expect(result.success).toBe(false);
  });
});

// ── ReassignTicketSchema ─────────────────────────────────────────

describe('ReassignTicketSchema', () => {
  it('aceita input válido', () => {
    const result = ReassignTicketSchema.safeParse({
      ticketId: VALID_ID,
      preferredTechnicianId: VALID_ID,
    });
    expect(result.success).toBe(true);
  });

  it('rejeita notes > 2000 chars', () => {
    const result = ReassignTicketSchema.safeParse({
      ticketId: VALID_ID,
      preferredTechnicianId: VALID_ID,
      notes: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

// ── RegisterExecutionSchema ──────────────────────────────────────

describe('RegisterExecutionSchema', () => {
  it('aceita input válido', () => {
    const result = RegisterExecutionSchema.safeParse({
      ticketId: VALID_ID,
      serviceDescription: 'Troca de lâmpada',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita serviceDescription vazia', () => {
    const result = RegisterExecutionSchema.safeParse({
      ticketId: VALID_ID,
      serviceDescription: '',
    });
    expect(result.success).toBe(false);
  });

  it('evidencePhotos default é array vazio', () => {
    const result = RegisterExecutionSchema.safeParse({
      ticketId: VALID_ID,
      serviceDescription: 'Troca',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.evidencePhotos).toEqual([]);
  });
});

// ── CloseTicketSchema ────────────────────────────────────────────

describe('CloseTicketSchema', () => {
  it('aceita input válido', () => {
    const result = CloseTicketSchema.safeParse({ ticketId: VALID_ID });
    expect(result.success).toBe(true);
  });

  it('rejeita closureNotes > 2000 chars', () => {
    const result = CloseTicketSchema.safeParse({
      ticketId: VALID_ID,
      closureNotes: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('faz trim no closureNotes', () => {
    const result = CloseTicketSchema.safeParse({
      ticketId: VALID_ID,
      closureNotes: '  notas de encerramento  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.closureNotes).toBe('notas de encerramento');
  });
});

// ── ChamadoCreateSchema ──────────────────────────────────────────

describe('ChamadoCreateSchema', () => {
  const validInput = {
    descricao: 'Problema com ar-condicionado',
    unitId: VALID_ID,
    localExato: 'Sala 205',
    tipoServico: 'Ar-Condicionado' as const,
    naturezaAtendimento: 'Padrão' as const,
  };

  it('aceita input válido', () => {
    expect(ChamadoCreateSchema.safeParse(validInput).success).toBe(true);
  });

  it('rejeita descricao vazia (após trim)', () => {
    const result = ChamadoCreateSchema.safeParse({ ...validInput, descricao: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejeita unitId inválido', () => {
    const result = ChamadoCreateSchema.safeParse({ ...validInput, unitId: 'abc' });
    expect(result.success).toBe(false);
  });

  it('subtypeId inválido é rejeitado', () => {
    const result = ChamadoCreateSchema.safeParse({ ...validInput, subtypeId: 'xyz' });
    expect(result.success).toBe(false);
  });

  it('subtypeId vazio vira undefined', () => {
    const result = ChamadoCreateSchema.safeParse({ ...validInput, subtypeId: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.subtypeId).toBeUndefined();
  });
});
