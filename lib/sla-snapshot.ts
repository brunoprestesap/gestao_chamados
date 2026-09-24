import 'server-only';

import { dbConnect } from '@/lib/db';
import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { getActiveHolidaysForRange } from '@/lib/holidays';
import {
  computeSlaDueDatesFromConfig,
  type FinalPriority,
  SLA_CONFIG_VERSION,
} from '@/lib/sla-utils';
import { SlaConfigModel } from '@/models/SlaConfig';

/**
 * O snapshot de SLA gravado no chamado (spec 0007): mesmo formato em `sla.*`,
 * imutável depois de gravado.
 */
export type SlaSnapshot = {
  priority: FinalPriority;
  responseTargetMinutes: number;
  resolutionTargetMinutes: number;
  businessHoursOnly: boolean;
  responseDueAt: Date;
  resolutionDueAt: Date;
  computedAt: Date;
  configVersion: string;
};

export type MontarSnapshotSlaResultado =
  | { ok: true; snapshot: SlaSnapshot }
  | { ok: false; motivo: string };

/**
 * Monta o snapshot de SLA para uma prioridade, a partir da config ativa,
 * expediente e feriados. Único lugar que calcula o snapshot: a classificação
 * manual e o caminho automático da abertura pela conversa chamam esta mesma
 * função, com os mesmos parâmetros, para os dois caminhos nunca divergirem.
 *
 * Nunca lança: falha (sem config ativa, ou erro ao calcular calendário e
 * feriados) devolve `{ ok: false, motivo }`, e quem chama decide o que fazer.
 */
export async function montarSnapshotSla(
  priority: FinalPriority,
  from: Date,
): Promise<MontarSnapshotSlaResultado> {
  try {
    await dbConnect();

    const slaConfig = await SlaConfigModel.findOne({ priority, isActive: true }).lean();
    if (!slaConfig) {
      return {
        ok: false,
        motivo: `Não há configuração de SLA ativa para a prioridade "${priority}". Configure em Configurações SLA (/sla).`,
      };
    }

    const calendarConfig = await getBusinessCalendarConfig();
    const endDate = new Date(from.getTime() + 365 * 24 * 60 * 60 * 1000);
    const holidays = await getActiveHolidaysForRange(from, endDate, calendarConfig.timezone);
    const { responseDueAt, resolutionDueAt } = computeSlaDueDatesFromConfig(
      from,
      slaConfig.responseTargetMinutes,
      slaConfig.resolutionTargetMinutes,
      slaConfig.businessHoursOnly,
      calendarConfig,
      holidays,
    );

    return {
      ok: true,
      snapshot: {
        priority,
        responseTargetMinutes: slaConfig.responseTargetMinutes,
        resolutionTargetMinutes: slaConfig.resolutionTargetMinutes,
        businessHoursOnly: slaConfig.businessHoursOnly,
        responseDueAt,
        resolutionDueAt,
        computedAt: from,
        configVersion: slaConfig.version ?? SLA_CONFIG_VERSION,
      },
    };
  } catch (err) {
    return {
      ok: false,
      motivo: err instanceof Error ? err.message : 'Erro ao calcular o snapshot de SLA.',
    };
  }
}
