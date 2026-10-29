import 'server-only';

/**
 * O calendário do SLA para os prazos do IMR do contrato (spec 0023). A leitura
 * mora em `lib/dias-uteis/calendario.ts`, dividida com a cotação de material.
 */
export { lerCalendarioDiasUteis as lerCalendarioImr } from '@/lib/dias-uteis/calendario';
