# Diagnóstico de SLA — Gestão de Chamados

## PASSO 0 — Re-contextualização

### 1) Configuração do SLA (collection/model sla_configs)

| Item    | Path                               | Descrição                                            |
| ------- | ---------------------------------- | ---------------------------------------------------- |
| Model   | `models/SlaConfig.ts`              | Schema Mongoose, collection `sla_configs`            |
| API GET | `app/api/sla/configs/route.ts`     | Lista configs ativas (Manager+)                      |
| API PUT | `app/api/sla/configs/route.ts`     | Salva configs (Admin only)                           |
| Tela    | `app/(dashboard)/sla/page.tsx`     | Formulário de configuração                           |
| Schemas | `shared/sla/sla-config.schemas.ts` | Validação Zod, toMinutes(), BUSINESS_MINUTES_PER_DAY |

**Como é lida:** Em `gestao/actions.ts` → `classificarChamadoAction` → `SlaConfigModel.findOne({ priority: finalPriority, isActive: true })`.

---

### 2) Cálculo de responseDueAt / resolutionDueAt / businessHoursOnly

| Função                         | Path                                       | Descrição                                                   |
| ------------------------------ | ------------------------------------------ | ----------------------------------------------------------- |
| `computeSlaDueDatesFromConfig` | `lib/sla-utils.ts` L141–157                | Calcula responseDueAt e resolutionDueAt                     |
| `addBusinessMinutes`           | `lib/sla-utils.ts` L87–109                 | Horário comercial (seg–sex 08–18h)                          |
| `addRealMinutes`               | `lib/sla-utils.ts` L122–129                | 24x7                                                        |
| Chamada                        | `app/(dashboard)/gestao/actions.ts` L84–88 | Usa slaConfig do banco e chama computeSlaDueDatesFromConfig |

**Fluxo:** Classificar → lê SlaConfig por prioridade → chama `computeSlaDueDatesFromConfig(now, responseMin, resolutionMin, businessHoursOnly)` → persiste no chamado.

---

### 3) Regra de horário comercial (08:00–18:00 seg–sex)

| Local      | Path                               | Valores                                                                      |
| ---------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| Constantes | `lib/sla-utils.ts` L9–12           | `BUSINESS_START_HOUR=8`, `BUSINESS_END_HOUR=18`                              |
| Lógica     | `lib/sla-utils.ts`                 | `getBelemWeekdayAndHour`, `isWithinBusinessHours`, `snapToNextBusinessStart` |
| Schema     | `shared/sla/sla-config.schemas.ts` | `BUSINESS_MINUTES_PER_DAY = 10*60`                                           |

---

### 4) Timezone institucional

| Onde                      | Valor                               | Observação                         |
| ------------------------- | ----------------------------------- | ---------------------------------- | --------------------------- |
| `lib/sla-utils.ts` L3, L8 | America/Belem (UTC-3)               | Hardcoded como offset manual `+3h` |
| Tela SLA                  | `app/(dashboard)/sla/page.tsx` L200 | "America/Belem"                    | Texto informativo           |
| **Não existe**            | `.env` ou constantes                | —                                  | Timezone não é configurável |

**Problema:** O offset está invertido no código. Belem = UTC-3, mas o código **soma** 3h para obter “hora em Belem”, quando deveria **subtrair** 3h.

---

### 5) Pontos do front que exibem datas/horas

| Tela/Componente         | Path                                                                               | Campos exibidos                                 |
| ----------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| Gestão (cards)          | `app/(dashboard)/gestao/page.tsx` → ChamadoCard                                    | createdAt, SLA (responseDueAt, resolutionDueAt) |
| ChamadoCard             | `app/(dashboard)/meus-chamados/_components/ChamadoCard.tsx`                        | createdAt, responseDueAt, resolutionDueAt       |
| Detalhe chamado         | `app/(dashboard)/meus-chamados/[id]/page.tsx`                                      | createdAt, updatedAt, SLA completo              |
| Histórico               | `app/(dashboard)/meus-chamados/[id]/_components/HistoryTimeline.tsx`               | createdAt                                       |
| Relatório IMR           | `app/(dashboard)/relatorios/imr/page.tsx`                                          | período, dataGeracao                            |
| Dashboard               | `app/(dashboard)/dashboard/_components/DashboardSolicitanteContent.tsx`            | createdAt                                       |
| Chamados atribuídos     | `app/(dashboard)/chamados-atribuidos/page.tsx`                                     | createdAt                                       |
| RegisterExecutionDialog | `app/(dashboard)/chamados-atribuidos/[id]/_components/RegisterExecutionDialog.tsx` | Início (createdAt)                              |

---

### 6) Helpers de formatação de data no front-end

| Helper           | Path                                    | Usa timeZone?                                                |
| ---------------- | --------------------------------------- | ------------------------------------------------------------ |
| `formatDate`     | `lib/utils.ts` L8–14                    | **NÃO** — `Intl.DateTimeFormat('pt-BR', {...})` sem timeZone |
| `formatDateTime` | `ChamadoCard.tsx` L152–155              | **NÃO**                                                      |
| `formatDateTime` | `meus-chamados/[id]/page.tsx` L24–30    | **NÃO**                                                      |
| `formatDateTime` | `RegisterExecutionDialog.tsx` L35–42    | **NÃO**                                                      |
| `formatDate`     | `chamados-atribuidos/page.tsx` L104–109 | **NÃO**                                                      |
| `formatDateBR`   | `relatorios/imr/page.tsx` L25–31        | **NÃO** — `toLocaleDateString('pt-BR')`                      |
| `formatDate`     | `DashboardSolicitanteContent.tsx` L19   | **NÃO**                                                      |

**Risco:** Todas as datas usam o timezone do navegador (ou do servidor em SSR). Em máquinas com fuso diferente de America/Belem, a mesma data pode “mudar de dia”.

---

## Mapa dos fluxos

```
[Classificar] → gestao/actions.ts:classificarChamadoAction
    → SlaConfigModel.findOne(priority)
    → computeSlaDueDatesFromConfig(now, ...)
        → addBusinessMinutes (se businessHours) ou addRealMinutes
            → getBelemWeekdayAndHour (BUG: offset invertido)
            → snapToNextBusinessStart
            → setBelemTimeTo (BUG: offset invertido)
    → ChamadoModel.updateOne (sla.responseDueAt, sla.resolutionDueAt, ...)

[API] → /api/gestao/chamados, /api/meus-chamados/[id]
    → Dates como toISOString() (UTC)
    → Front recebe ISO string

[Front] → new Date(iso).format(...) ou Intl sem timeZone
    → Exibe na timezone do ambiente (inconsistente)
```

---

## Lista de riscos/hipóteses de bug

1. **BUG CRÍTICO — Timezone invertida em `sla-utils.ts`**
   - `getBelemWeekdayAndHour`: usa `date + 3h`; o correto para Belem (UTC-3) é `date - 3h`.
   - Consequência: hora e dia da semana em Belem errados → `isWithinBusinessHours`, `snapToNextBusinessStart`, `addBusinessMinutes` calculam prazos incorretos.

2. **BUG — `setBelemTimeTo` com offset errado**
   - Usa `date + 3h` para obter o “dia Belem” e `(h,m,s)` como se fosse UTC; deveria usar `date - 3h` e `(3+h)` para a hora em UTC.

3. **BUG — Snap para dia útil após sexta 18h**
   - Quando `hourFraction >= 18` em sexta, `addDays(d, 1)` leva a sábado; `setBelemTimeTo` não avança automaticamente para segunda. O loop de `addBusinessMinutes` pode compensar em alguns casos, mas `snapToNextBusinessStart` retorna sábado 08:00 em vez de segunda 08:00.

4. **Risco — Formatação sem timezone institucional**
   - Todas as datas são formatadas sem `timeZone: 'America/Belem'`.
   - Usuários em outros fusos veem horários diferentes.

5. **Compatibilidade com dados antigos**
   - Chamados já classificados têm responseDueAt/resolutionDueAt no banco; corrigir o cálculo só afeta novas classificações. Dados antigos permanecem como estão.

---

## PASSO OBRIGATÓRIO ANTES DE ALTERAR CÓDIGO

### 1) Timezone institucional definida e onde

- **Definida:** `lib/sla-utils.ts` (comentário e constante `TIMEZONE_BELEM_UTC_OFFSET_MS`).
- **Valor:** America/Belem (UTC-3).
- **Observação:** Não há constante/env configurável.

### 2) Onde o cálculo de SLA ocorre e se usa timezone explícita

- **Onde:** `lib/sla-utils.ts` → `computeSlaDueDatesFromConfig` → `addBusinessMinutes` / `addRealMinutes`.
- **Timezone:** Usa offset manual (+3h) aplicado de forma invertida (o correto seria -3h para Belem).

### 3) Onde o front formata datas e se passa timeZone

- **Arquivos:** `lib/utils.ts`, `ChamadoCard.tsx`, `meus-chamados/[id]/page.tsx`, `RegisterExecutionDialog.tsx`, `chamados-atribuidos/page.tsx`, `relatorios/imr/page.tsx`, `DashboardSolicitanteContent.tsx`.
- **timeZone:** Nenhum passa `timeZone: 'America/Belem'`.

### 4) Cenários de teste que falham hoje

| Cenário                       | Resultado atual (com bug)                                  | Esperado                         |
| ----------------------------- | ---------------------------------------------------------- | -------------------------------- |
| 1. Seg 09:00 NORMAL           | responseDueAt com hora errada (ex.: 15:00 em vez de 09:00) | Terça 09:00, Quinta 09:00        |
| 2. Sex 19:00 NORMAL           | Snap/dias úteis podem estar incorretos                     | Seg 08:00 → Ter 08:00, Qui 08:00 |
| 3. Sex 17:00 ALTA 4h          | Contagem de 1h sex + 3h seg possivelmente errada           | Seg 11:00                        |
| 4. Sex 19:00 EMERGENCIAL 24x7 | `addRealMinutes` não usa timezone; resultado correto       | Sex 20:00, Sáb 03:00             |

### 5) Plano de correção (APLICADO)

| #   | Arquivo                                                                                                                                                                       | Alteração                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | `lib/sla-utils.ts`                                                                                                                                                            | ✓ Corrigido offset: `getBelemWeekdayAndHour` usa `date - 3h`; `setBelemTimeTo` usa `date - 3h` e `(3+h)` para conversão |
| 2   | `lib/sla-utils.ts`                                                                                                                                                            | ✓ Corrigido `snapToNextBusinessStart`: loop para pular fim de semana quando `hourFraction >= 18`                        |
| 3   | `lib/utils.ts`                                                                                                                                                                | ✓ Adicionado `INSTITUTIONAL_TIMEZONE`, `formatDate`, `formatDateTime`, `formatDateShort`, `formatTime` com timeZone     |
| 4   | `ChamadoCard.tsx`, `meus-chamados/[id]/page.tsx`, `RegisterExecutionDialog.tsx`, `chamados-atribuidos/page.tsx`, `DashboardSolicitanteContent.tsx`, `relatorios/imr/page.tsx` | ✓ Passam a usar helpers de `lib/utils` com timezone institucional                                                       |

**Nota Cenário 2:** O spec mencionava "terça 08:00"; o schema define 1 dia útil = 600 min. De seg 08:00 + 600 min = seg 18:00. O resultado seg 18:00 está correto conforme o schema.
