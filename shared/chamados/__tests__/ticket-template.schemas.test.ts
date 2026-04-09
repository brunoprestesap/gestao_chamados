import { describe, expect, it } from 'vitest';

import { CreateTemplateSchema } from '@/shared/chamados/ticket-template.schemas';

const VALID_ID = 'a'.repeat(24);

// ── CreateTemplateSchema ─────────────────────────────────────────

describe('CreateTemplateSchema', () => {
  // ── Casos de sucesso ──────────────────────────────────────────

  it('should accept valid minimal input', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template Básico',
      scope: 'personal',
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid complete input', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template Completo de Manutenção',
      scope: 'global',
      descricao: 'Descrição detalhada do serviço de manutenção predial',
      tipoServico: 'Manutenção Predial',
      naturezaAtendimento: 'Padrão',
      grauUrgencia: 'Normal',
      unitId: VALID_ID,
      subtypeId: VALID_ID,
      catalogServiceId: VALID_ID,
    });
    expect(result.success).toBe(true);
  });

  it('should accept scope global', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template Global',
      scope: 'global',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.scope).toBe('global');
  });

  it('should accept scope personal', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Meu Template',
      scope: 'personal',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.scope).toBe('personal');
  });

  it('should accept all tipoServico enum values', () => {
    const tipos = ['Manutenção Predial', 'Ar-Condicionado', 'Elevador'] as const;
    for (const tipoServico of tipos) {
      const result = CreateTemplateSchema.safeParse({
        name: 'Template Tipo',
        scope: 'personal',
        tipoServico,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all naturezaAtendimento enum values', () => {
    const naturezas = ['Padrão', 'Urgente'] as const;
    for (const naturezaAtendimento of naturezas) {
      const result = CreateTemplateSchema.safeParse({
        name: 'Template Natureza',
        scope: 'personal',
        naturezaAtendimento,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all grauUrgencia enum values', () => {
    const graus = ['Baixo', 'Normal', 'Alto', 'Crítico'] as const;
    for (const grauUrgencia of graus) {
      const result = CreateTemplateSchema.safeParse({
        name: 'Template Urgência',
        scope: 'personal',
        grauUrgencia,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept descricao at max length boundary (2000 chars)', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template Max',
      scope: 'personal',
      descricao: 'x'.repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it('should accept name at min length boundary (3 chars)', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'abc',
      scope: 'personal',
    });
    expect(result.success).toBe(true);
  });

  it('should accept name at max length boundary (100 chars)', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'a'.repeat(100),
      scope: 'personal',
    });
    expect(result.success).toBe(true);
  });

  it('should accept ObjectIds with uppercase hex chars', () => {
    const upperCaseId = 'A'.repeat(24);
    const result = CreateTemplateSchema.safeParse({
      name: 'Template ID',
      scope: 'personal',
      unitId: upperCaseId,
    });
    expect(result.success).toBe(true);
  });

  it('should treat optional fields as undefined when omitted', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template Mínimo',
      scope: 'personal',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.descricao).toBeUndefined();
      expect(result.data.tipoServico).toBeUndefined();
      expect(result.data.naturezaAtendimento).toBeUndefined();
      expect(result.data.grauUrgencia).toBeUndefined();
      expect(result.data.unitId).toBeUndefined();
      expect(result.data.subtypeId).toBeUndefined();
      expect(result.data.catalogServiceId).toBeUndefined();
    }
  });

  // ── Validação de name ─────────────────────────────────────────

  it('should reject name shorter than 3 chars', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'ab',
      scope: 'personal',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('pelo menos 3 caracteres');
    }
  });

  it('should reject name longer than 100 chars', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'a'.repeat(101),
      scope: 'personal',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('no máximo 100 caracteres');
    }
  });

  it('should reject empty name', () => {
    const result = CreateTemplateSchema.safeParse({
      name: '',
      scope: 'personal',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing name', () => {
    const result = CreateTemplateSchema.safeParse({
      scope: 'personal',
    });
    expect(result.success).toBe(false);
  });

  // ── Validação de scope ────────────────────────────────────────

  it('should reject invalid scope value', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template Inválido',
      scope: 'shared',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing scope', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template Sem Scope',
    });
    expect(result.success).toBe(false);
  });

  // ── Validação de descricao ────────────────────────────────────

  it('should reject descricao longer than 2000 chars', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template Desc Longa',
      scope: 'personal',
      descricao: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Descrição muito longa');
    }
  });

  // ── Validação de tipoServico ──────────────────────────────────

  it('should reject invalid tipoServico', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template Tipo Inválido',
      scope: 'personal',
      tipoServico: 'Elétrica',
    });
    expect(result.success).toBe(false);
  });

  // ── Validação de naturezaAtendimento ─────────────────────────

  it('should reject invalid naturezaAtendimento', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template Natureza Inválida',
      scope: 'personal',
      naturezaAtendimento: 'Emergencial',
    });
    expect(result.success).toBe(false);
  });

  // ── Validação de grauUrgencia ─────────────────────────────────

  it('should reject invalid grauUrgencia', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template Grau Inválido',
      scope: 'personal',
      grauUrgencia: 'Máximo',
    });
    expect(result.success).toBe(false);
  });

  // ── Validação de ObjectIds ────────────────────────────────────

  it('should reject unitId with fewer than 24 hex chars', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template ID Curto',
      scope: 'personal',
      unitId: 'abc123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('ID inválido');
    }
  });

  it('should reject unitId with more than 24 hex chars', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template ID Longo',
      scope: 'personal',
      unitId: 'a'.repeat(25),
    });
    expect(result.success).toBe(false);
  });

  it('should reject unitId with non-hex characters', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template ID Inválido',
      scope: 'personal',
      unitId: 'z'.repeat(24),
    });
    expect(result.success).toBe(false);
  });

  it('should reject subtypeId with invalid ObjectId format', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template SubType Inválido',
      scope: 'personal',
      subtypeId: 'not-an-object-id',
    });
    expect(result.success).toBe(false);
  });

  it('should reject catalogServiceId with invalid ObjectId format', () => {
    const result = CreateTemplateSchema.safeParse({
      name: 'Template Catalog Inválido',
      scope: 'personal',
      catalogServiceId: '12345',
    });
    expect(result.success).toBe(false);
  });
});
