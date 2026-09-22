import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { confirmarAberturaSchema } from '@/shared/conversas/abertura.schemas';

/**
 * O corpo que o navegador pode mandar para confirmar a abertura pelo chat
 * (spec 0004, AC-17): `strictObject` recusa qualquer campo a mais, então
 * serviço, prioridade, confiança e metadado do modelo nunca entram por aqui.
 *
 * covers: AC-17 (corpo estrito, nada de decisão da IA vindo do navegador)
 */

function corpoValido(extra: Record<string, unknown> = {}) {
  return {
    conversaId: new Types.ObjectId().toString(),
    cartaoId: new Types.ObjectId().toString(),
    unitId: new Types.ObjectId().toString(),
    localExato: 'Sala 302',
    ...extra,
  };
}

describe('confirmarAberturaSchema', () => {
  it('aceita o corpo mínimo, sem tipoServico', () => {
    // Act & Assert
    expect(confirmarAberturaSchema.safeParse(corpoValido()).success).toBe(true);
  });

  it('aceita tipoServico no modo manual', () => {
    // Act & Assert
    expect(
      confirmarAberturaSchema.safeParse(corpoValido({ tipoServico: 'Manutenção Predial' })).success,
    ).toBe(true);
  });

  it('recusa catalogServiceId no corpo, mesmo válido', () => {
    // Act
    const r = confirmarAberturaSchema.safeParse(
      corpoValido({ catalogServiceId: new Types.ObjectId().toString() }),
    );

    // Assert
    expect(r.success).toBe(false);
  });

  it('recusa prioridade no corpo', () => {
    // Act
    const r = confirmarAberturaSchema.safeParse(corpoValido({ prioridade: 'EMERGENCIAL' }));

    // Assert
    expect(r.success).toBe(false);
  });

  it('recusa confiança e motivo no corpo', () => {
    // Act & Assert
    expect(confirmarAberturaSchema.safeParse(corpoValido({ confianca: 0.9 })).success).toBe(false);
    expect(confirmarAberturaSchema.safeParse(corpoValido({ motivo: 'porque sim' })).success).toBe(
      false,
    );
  });

  it('recusa meta da chamada ao modelo (llmCallId, modelo, promptVersion)', () => {
    // Act & Assert
    expect(
      confirmarAberturaSchema.safeParse(corpoValido({ llmCallId: new Types.ObjectId().toString() }))
        .success,
    ).toBe(false);
    expect(confirmarAberturaSchema.safeParse(corpoValido({ modelo: 'qwen3' })).success).toBe(false);
  });

  it('recusa tipoServico fora das opções conhecidas', () => {
    // Act & Assert
    expect(
      confirmarAberturaSchema.safeParse(corpoValido({ tipoServico: 'Jardinagem' })).success,
    ).toBe(false);
  });

  it('exige localExato de 1 a 200 caracteres', () => {
    // Act & Assert
    expect(confirmarAberturaSchema.safeParse(corpoValido({ localExato: '' })).success).toBe(false);
    expect(
      confirmarAberturaSchema.safeParse(corpoValido({ localExato: 'x'.repeat(201) })).success,
    ).toBe(false);
    expect(
      confirmarAberturaSchema.safeParse(corpoValido({ localExato: 'x'.repeat(200) })).success,
    ).toBe(true);
  });
});
