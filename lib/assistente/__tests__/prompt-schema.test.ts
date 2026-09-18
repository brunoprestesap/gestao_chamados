import { describe, expect, it } from 'vitest';

import {
  ASSISTENTE_HISTORICO_MAX,
  ASSISTENTE_MAX_OUTPUT_TOKENS,
  ASSISTENTE_SYSTEM,
  ASSISTENTE_TASK,
  PROMPT_VERSION,
} from '../prompt';
import { RESPOSTA_ASSISTENTE_MAX, respostaAssistenteSchema } from '../schema';

/**
 * O que o assistente pode devolver, e o que o prompt manda ele fazer nesta
 * fatia (spec 0003). Nesta volta ele só conversa: quem escolhe serviço,
 * prioridade e técnico é a funcionalidade 12.
 *
 * covers: AC-5 (só objeto validado vira mensagem), AC-6 (o assistente só conversa)
 */

// ── o que o schema aceita · AC-5 ─────────────────────────────────

describe('respostaAssistenteSchema', () => {
  it('aceita uma resposta normal', () => {
    // Act
    const r = respostaAssistenteSchema.safeParse({ resposta: 'Entendi, vazamento na sala 302.' });

    // Assert
    expect(r.success).toBe(true);
  });

  it('recusa resposta vazia, que não teria o que mostrar na tela', () => {
    // Act & Assert
    expect(respostaAssistenteSchema.safeParse({ resposta: '' }).success).toBe(false);
  });

  it('recusa resposta acima do teto, para o modelo não encher a conversa', () => {
    // Act & Assert
    expect(
      respostaAssistenteSchema.safeParse({ resposta: 'a'.repeat(RESPOSTA_ASSISTENTE_MAX + 1) })
        .success,
    ).toBe(false);
  });

  it('aceita exatamente no teto', () => {
    // Act & Assert
    expect(
      respostaAssistenteSchema.safeParse({ resposta: 'a'.repeat(RESPOSTA_ASSISTENTE_MAX) }).success,
    ).toBe(true);
  });

  it('recusa objeto sem o campo, que é o que chega quando o modelo inventa formato', () => {
    // Act & Assert
    expect(respostaAssistenteSchema.safeParse({}).success).toBe(false);
    expect(respostaAssistenteSchema.safeParse({ texto: 'errado' }).success).toBe(false);
    expect(respostaAssistenteSchema.safeParse({ resposta: 42 }).success).toBe(false);
    expect(respostaAssistenteSchema.safeParse(null).success).toBe(false);
  });

  it('cabe folgado numa mensagem de conversa, cujo teto é 2.000', () => {
    // Assert: a resposta nunca pode ser recusada por `enviarMensagem`
    expect(RESPOSTA_ASSISTENTE_MAX).toBeLessThan(2000);
  });
});

// ── o que o prompt manda o assistente fazer · AC-6 ───────────────

describe('ASSISTENTE_SYSTEM', () => {
  it('proíbe escolher serviço, prioridade e técnico, que é a fatia seguinte', () => {
    // Assert
    const texto = ASSISTENTE_SYSTEM.toLowerCase();
    expect(texto).toContain('não escolha serviço');
    expect(texto).toMatch(/prioridade/);
    expect(texto).toMatch(/técnico/);
  });

  it('proíbe prometer prazo e dizer que abriu o chamado', () => {
    // Assert
    const texto = ASSISTENTE_SYSTEM.toLowerCase();
    expect(texto).toContain('não prometa prazo');
    expect(texto).toContain('não diga que abriu o chamado');
  });

  it('proíbe pedir dado pessoal', () => {
    // Assert
    expect(ASSISTENTE_SYSTEM.toLowerCase()).toContain('não peça dado pessoal');
  });

  it('manda confirmar em uma frase e perguntar no máximo uma coisa', () => {
    // Assert
    const texto = ASSISTENTE_SYSTEM.toLowerCase();
    expect(texto).toContain('uma frase');
    expect(texto).toContain('no máximo uma pergunta');
  });

  it('pede português do Brasil', () => {
    // Assert
    expect(ASSISTENTE_SYSTEM).toContain('português do Brasil');
  });
});

// ── o que amarra o registro à redação ────────────────────────────

describe('constantes da chamada', () => {
  it('usa a tarefa que o registro `LlmCall` guarda', () => {
    // Assert
    expect(ASSISTENTE_TASK).toBe('conversa.acolhimento');
    expect(ASSISTENTE_TASK.length).toBeLessThanOrEqual(80);
  });

  it('tem versão de prompt dentro do limite do registro', () => {
    // Assert
    expect(PROMPT_VERSION).toBeTruthy();
    expect(PROMPT_VERSION.length).toBeLessThanOrEqual(40);
  });

  it('manda histórico curto o bastante para não estourar a entrada', () => {
    // Assert: a spec fixa as últimas 20 mensagens
    expect(ASSISTENTE_HISTORICO_MAX).toBe(20);
  });

  it('pede saída curta, dentro da faixa que `lib/llm` aceita', () => {
    // Assert
    expect(ASSISTENTE_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(1);
    expect(ASSISTENTE_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(8192);
  });
});
