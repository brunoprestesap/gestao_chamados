import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { FINAL_PRIORITY_VALUES } from '@/shared/chamados/chamado.constants';
import {
  CONVERSA_AUTORES,
  CONVERSA_MENSAGEM_TIPOS,
  DECISAO_CAMPOS,
} from '@/shared/conversas/conversa.constants';
import {
  CONVERSA_PAYLOAD_SCHEMAS,
  conversaTextoSchema,
  decisaoMotivoSchema,
  enviarMensagemSchema,
  objectIdSchema,
  registrarDecisaoSchema,
  valorPrioridadeSchema,
  valorSchemaPara,
  valorServicoSchema,
  valorTecnicoSchema,
} from '@/shared/conversas/conversa.schemas';

/**
 * Schemas Zod da conversa e da decisão (spec 0002).
 *
 * Estes testes trancam os limites que o AC-1 e o AC-6 fixam em número, e a
 * regra de que o rótulo nunca entra pela porta: o valor decidido só carrega
 * identificadores, e o nome exibido é lido do banco depois.
 */

const idValido = () => new Types.ObjectId().toHexString();

// ── objectIdSchema ───────────────────────────────────────────────

describe('objectIdSchema', () => {
  it('aceita um ObjectId de 24 caracteres hexadecimais', () => {
    // Arrange
    const id = idValido();

    // Act
    const resultado = objectIdSchema.safeParse(id);

    // Assert
    expect(resultado.success).toBe(true);
  });

  it('aceita hexadecimal em maiúsculas', () => {
    expect(objectIdSchema.safeParse('ABCDEF012345678901234567').success).toBe(true);
  });

  it('recusa identificador com menos de 24 caracteres', () => {
    expect(objectIdSchema.safeParse('abc123').success).toBe(false);
  });

  it('recusa identificador com mais de 24 caracteres', () => {
    expect(objectIdSchema.safeParse(idValido() + 'a').success).toBe(false);
  });

  it('recusa caractere fora do hexadecimal', () => {
    // Arrange: 24 caracteres, mas o "z" não é hexadecimal
    const quase = 'z'.repeat(1) + '0'.repeat(23);

    // Act / Assert
    expect(objectIdSchema.safeParse(quase).success).toBe(false);
  });

  it('recusa string vazia', () => {
    expect(objectIdSchema.safeParse('').success).toBe(false);
  });
});

// ── conversaTextoSchema · AC-1 ───────────────────────────────────

describe('conversaTextoSchema (AC-1)', () => {
  it('devolve o texto sem os espaços das pontas', () => {
    // Arrange
    const comEspacos = '   o ar-condicionado parou   ';

    // Act
    const resultado = conversaTextoSchema.parse(comEspacos);

    // Assert
    expect(resultado).toBe('o ar-condicionado parou');
  });

  it('aceita uma mensagem de um único caractere', () => {
    expect(conversaTextoSchema.safeParse('?').success).toBe(true);
  });

  it('aceita exatamente 2.000 caracteres', () => {
    // Arrange
    const noLimite = 'a'.repeat(2000);

    // Act / Assert
    expect(conversaTextoSchema.safeParse(noLimite).success).toBe(true);
  });

  it('recusa 2.001 caracteres', () => {
    // Arrange
    const passouDoLimite = 'a'.repeat(2001);

    // Act
    const resultado = conversaTextoSchema.safeParse(passouDoLimite);

    // Assert
    expect(resultado.success).toBe(false);
  });

  it('conta o tamanho depois de aparar: 2.000 caracteres entre espaços passam', () => {
    // Arrange: o trim roda antes do limite, então as pontas não gastam o teto
    const comPontas = `  ${'a'.repeat(2000)}  `;

    // Act / Assert
    expect(conversaTextoSchema.safeParse(comPontas).success).toBe(true);
  });

  it('recusa mensagem só de espaços, que apara para vazio', () => {
    // Act
    const resultado = conversaTextoSchema.safeParse('      ');

    // Assert
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe('Escreva a mensagem');
  });

  it('recusa string vazia', () => {
    expect(conversaTextoSchema.safeParse('').success).toBe(false);
  });

  it('aceita acento e emoji sem estourar a contagem', () => {
    expect(conversaTextoSchema.safeParse('não liga 🔌').success).toBe(true);
  });
});

// ── CONVERSA_PAYLOAD_SCHEMAS ─────────────────────────────────────

describe('CONVERSA_PAYLOAD_SCHEMAS', () => {
  it('tem um schema para cada tipo de mensagem declarado', () => {
    // Arrange / Act
    const tiposComSchema = Object.keys(CONVERSA_PAYLOAD_SCHEMAS).sort();

    // Assert: um tipo novo sem schema gravaria payload sem validação nenhuma
    expect(tiposComSchema).toEqual([...CONVERSA_MENSAGEM_TIPOS].sort());
  });

  it('mensagem de texto só aceita payload nulo', () => {
    expect(CONVERSA_PAYLOAD_SCHEMAS.texto.safeParse(null).success).toBe(true);
  });

  it('mensagem de texto recusa payload com conteúdo', () => {
    expect(CONVERSA_PAYLOAD_SCHEMAS.texto.safeParse({ algo: 1 }).success).toBe(false);
  });
});

// ── enviarMensagemSchema · AC-1 ──────────────────────────────────

describe('enviarMensagemSchema (AC-1)', () => {
  const base = {
    conversaId: idValido(),
    autor: 'solicitante' as const,
    tipo: 'texto' as const,
    texto: 'o elevador está parado',
  };

  it('aceita uma mensagem de texto do solicitante', () => {
    // Act
    const resultado = enviarMensagemSchema.safeParse(base);

    // Assert
    expect(resultado.success).toBe(true);
  });

  it.each([...CONVERSA_AUTORES])('aceita o autor %s', (autor) => {
    expect(enviarMensagemSchema.safeParse({ ...base, autor }).success).toBe(true);
  });

  it('recusa autor fora dos três conhecidos', () => {
    expect(enviarMensagemSchema.safeParse({ ...base, autor: 'tecnico' }).success).toBe(false);
  });

  it('recusa tipo de mensagem desconhecido', () => {
    expect(enviarMensagemSchema.safeParse({ ...base, tipo: 'audio' }).success).toBe(false);
  });

  it('recusa conversaId que não é ObjectId', () => {
    expect(enviarMensagemSchema.safeParse({ ...base, conversaId: '123' }).success).toBe(false);
  });

  it('aceita llmCallId nulo, ausente ou ObjectId', () => {
    // Arrange / Act / Assert
    expect(enviarMensagemSchema.safeParse({ ...base, llmCallId: null }).success).toBe(true);
    expect(enviarMensagemSchema.safeParse({ ...base, llmCallId: undefined }).success).toBe(true);
    expect(enviarMensagemSchema.safeParse({ ...base, llmCallId: idValido() }).success).toBe(true);
  });

  it('recusa llmCallId malformado', () => {
    expect(enviarMensagemSchema.safeParse({ ...base, llmCallId: 'call-1' }).success).toBe(false);
  });

  it('apara o texto antes de entregar a quem grava', () => {
    // Act
    const resultado = enviarMensagemSchema.parse({ ...base, texto: '  fiquei sem luz  ' });

    // Assert
    expect(resultado.texto).toBe('fiquei sem luz');
  });

  it('recusa mensagem sem texto', () => {
    // Arrange
    const semTexto = { ...base, texto: '' };

    // Act / Assert
    expect(enviarMensagemSchema.safeParse(semTexto).success).toBe(false);
  });
});

// ── valores da decisão · AC-6, AC-7 ──────────────────────────────

describe('valorServicoSchema (AC-7)', () => {
  it('aceita os dois identificadores do serviço', () => {
    // Arrange
    const valor = { catalogServiceId: idValido(), subtypeId: idValido() };

    // Act / Assert
    expect(valorServicoSchema.safeParse(valor).success).toBe(true);
  });

  it('aceita tipoServico do catálogo, nulo ou ausente', () => {
    // Arrange
    const valor = { catalogServiceId: idValido(), subtypeId: idValido() };

    // Act / Assert
    expect(valorServicoSchema.safeParse({ ...valor, tipoServico: 'Elevador' }).success).toBe(true);
    expect(valorServicoSchema.safeParse({ ...valor, tipoServico: null }).success).toBe(true);
    expect(valorServicoSchema.safeParse(valor).success).toBe(true);
  });

  it('recusa tipoServico fora do catálogo', () => {
    // Arrange
    const valor = {
      catalogServiceId: idValido(),
      subtypeId: idValido(),
      tipoServico: 'Jardinagem',
    };

    // Act / Assert
    expect(valorServicoSchema.safeParse(valor).success).toBe(false);
  });

  it('recusa valor sem subtypeId', () => {
    expect(valorServicoSchema.safeParse({ catalogServiceId: idValido() }).success).toBe(false);
  });

  it('não aceita rótulo vindo de fora: o campo é ignorado, não gravado', () => {
    // Arrange: o rótulo é lido do banco por registrarDecisao, nunca informado
    const comRotulo = {
      catalogServiceId: idValido(),
      subtypeId: idValido(),
      rotulo: 'Troca de lâmpada',
    };

    // Act
    const resultado = valorServicoSchema.parse(comRotulo);

    // Assert
    expect(resultado).not.toHaveProperty('rotulo');
  });
});

describe('valorPrioridadeSchema (AC-7)', () => {
  it.each([...FINAL_PRIORITY_VALUES])('aceita a prioridade %s', (prioridade) => {
    expect(valorPrioridadeSchema.safeParse({ prioridade }).success).toBe(true);
  });

  it('recusa prioridade fora do enum', () => {
    expect(valorPrioridadeSchema.safeParse({ prioridade: 'URGENTE' }).success).toBe(false);
  });

  it('recusa prioridade em minúsculas', () => {
    expect(valorPrioridadeSchema.safeParse({ prioridade: 'alta' }).success).toBe(false);
  });
});

describe('valorTecnicoSchema (AC-7)', () => {
  it('aceita o identificador do técnico', () => {
    expect(valorTecnicoSchema.safeParse({ tecnicoId: idValido() }).success).toBe(true);
  });

  it('recusa técnico informado por nome', () => {
    expect(valorTecnicoSchema.safeParse({ tecnicoId: 'João da Silva' }).success).toBe(false);
  });
});

describe('valorSchemaPara', () => {
  it('escolhe o schema do serviço para o campo servico', () => {
    // Act
    const schema = valorSchemaPara('servico');

    // Assert
    expect(schema.safeParse({ catalogServiceId: idValido(), subtypeId: idValido() }).success).toBe(
      true,
    );
    expect(schema.safeParse({ prioridade: 'ALTA' }).success).toBe(false);
  });

  it('escolhe o schema da prioridade para o campo prioridade', () => {
    // Act
    const schema = valorSchemaPara('prioridade');

    // Assert
    expect(schema.safeParse({ prioridade: 'ALTA' }).success).toBe(true);
    expect(schema.safeParse({ tecnicoId: idValido() }).success).toBe(false);
  });

  it('escolhe o schema do técnico para o campo tecnico', () => {
    // Act
    const schema = valorSchemaPara('tecnico');

    // Assert
    expect(schema.safeParse({ tecnicoId: idValido() }).success).toBe(true);
    expect(schema.safeParse({ prioridade: 'ALTA' }).success).toBe(false);
  });

  it('devolve um schema para cada campo decidido', () => {
    // Assert: campo novo sem schema deixaria passar valor sem conferência
    for (const campo of DECISAO_CAMPOS) {
      expect(valorSchemaPara(campo)).toBeDefined();
    }
  });
});

// ── decisaoMotivoSchema · AC-6 ───────────────────────────────────

describe('decisaoMotivoSchema (AC-6)', () => {
  it('aceita uma frase curta', () => {
    expect(decisaoMotivoSchema.safeParse('relato cita ar-condicionado').success).toBe(true);
  });

  it('aceita exatamente 200 caracteres', () => {
    expect(decisaoMotivoSchema.safeParse('a'.repeat(200)).success).toBe(true);
  });

  it('recusa 201 caracteres', () => {
    expect(decisaoMotivoSchema.safeParse('a'.repeat(201)).success).toBe(false);
  });

  it('recusa motivo vazio', () => {
    expect(decisaoMotivoSchema.safeParse('   ').success).toBe(false);
  });
});

// ── registrarDecisaoSchema · AC-6 ────────────────────────────────

describe('registrarDecisaoSchema (AC-6)', () => {
  const base = {
    chamadoId: idValido(),
    campo: 'servico' as const,
    decididoPor: 'ia' as const,
    efeito: 'sugestao' as const,
    valor: { catalogServiceId: idValido(), subtypeId: idValido() },
    motivo: 'relato cita ar-condicionado',
  };

  it('aceita uma decisão da IA com confiança', () => {
    expect(registrarDecisaoSchema.safeParse({ ...base, confianca: 0.82 }).success).toBe(true);
  });

  it('aceita uma decisão de regra sem confiança', () => {
    // Arrange
    const porRegra = { ...base, decididoPor: 'regra' as const, confianca: null };

    // Act / Assert
    expect(registrarDecisaoSchema.safeParse(porRegra).success).toBe(true);
  });

  it.each([...DECISAO_CAMPOS])('aceita o campo %s', (campo) => {
    expect(registrarDecisaoSchema.safeParse({ ...base, campo }).success).toBe(true);
  });

  it('recusa campo fora dos três decididos', () => {
    expect(registrarDecisaoSchema.safeParse({ ...base, campo: 'unidade' }).success).toBe(false);
  });

  it('recusa decididoPor fora de ia e regra', () => {
    expect(registrarDecisaoSchema.safeParse({ ...base, decididoPor: 'humano' }).success).toBe(
      false,
    );
  });

  it('recusa efeito fora de sugestao e aplicado', () => {
    expect(registrarDecisaoSchema.safeParse({ ...base, efeito: 'ignorado' }).success).toBe(false);
  });

  it('aceita confiança nos extremos 0 e 1', () => {
    expect(registrarDecisaoSchema.safeParse({ ...base, confianca: 0 }).success).toBe(true);
    expect(registrarDecisaoSchema.safeParse({ ...base, confianca: 1 }).success).toBe(true);
  });

  it('recusa confiança negativa', () => {
    expect(registrarDecisaoSchema.safeParse({ ...base, confianca: -0.01 }).success).toBe(false);
  });

  it('recusa confiança acima de 1', () => {
    expect(registrarDecisaoSchema.safeParse({ ...base, confianca: 1.01 }).success).toBe(false);
  });

  it('aceita conversaId nulo, para decisão tomada fora de uma conversa', () => {
    expect(registrarDecisaoSchema.safeParse({ ...base, conversaId: null }).success).toBe(true);
  });

  it('recusa decisão sem motivo', () => {
    // Arrange
    const semMotivo = { ...base, motivo: '' };

    // Act / Assert
    expect(registrarDecisaoSchema.safeParse(semMotivo).success).toBe(false);
  });

  it('recusa chamadoId malformado', () => {
    expect(registrarDecisaoSchema.safeParse({ ...base, chamadoId: 'novo' }).success).toBe(false);
  });
});
