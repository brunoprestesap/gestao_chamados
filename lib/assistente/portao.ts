import 'server-only';

import { lerConfig } from '@/lib/ia-confianca/config';
import type { CartaoModo } from '@/shared/conversas/conversa.constants';

/**
 * O portão de confiança da abertura (spec 0007): quando passa, o chamado nasce
 * `validado` sozinho, com a prioridade e o SLA já decididos por
 * `confirmarAbertura`. Roda uma única vez, no instante da confirmação; mudar
 * `IaAutonomiaConfig` depois não afeta um chamado já criado.
 *
 * Confiante exige as três coisas juntas: autonomia ligada, um limite definido
 * para `prioridade` (`null` é autonomia impossível, mesmo com o interruptor
 * ligado, mesma regra da fatia anterior) e a confiança da proposta maior ou
 * igual a esse limite. Exige também o cartão em modo `ia`: o modo manual nunca
 * resolveu o serviço, e um chamado validado sem especialidade não teria a quem
 * uma atribuição automática futura designar.
 */
export async function confiancaSuficienteParaPrioridade(params: {
  modo: CartaoModo;
  confianca: number | null;
}): Promise<boolean> {
  if (params.modo !== 'ia') return false;
  if (params.confianca == null) return false;

  const config = await lerConfig();
  if (!config.autonomiaAtiva) return false;
  if (config.prioridade.limiteConfianca == null) return false;

  return params.confianca >= config.prioridade.limiteConfianca;
}
