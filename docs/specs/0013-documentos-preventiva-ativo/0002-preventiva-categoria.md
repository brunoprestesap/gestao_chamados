# Parte 2. Preventiva por categoria de ativo

## Summary

O modelo de chamado recorrente que já existe em `/gestao/recurring` ganha um segundo jeito de funcionar: em vez de gerar um chamado genérico, ele aponta para uma categoria de ativo (e, se quiser, para um prédio ou andar) e gera um chamado para cada ativo Tier A em operação daquela categoria. Cada chamado nasce validado, com a prioridade do modelo e o prazo de SLA calculado na hora, e fica esperando o Preposto escolher o técnico. Ativo que ainda tem a preventiva anterior aberta é pulado, e a gestão recebe um aviso só por lote, com quantos foram gerados e quantos pulados.

## Requirements

**Acceptance criteria**:

- **AC-16**: Admin e Preposto criam em `/gestao/recurring` um modelo com escopo "Por categoria de ativo", escolhendo uma categoria ativa (obrigatória), um local (opcional, qualquer nó da árvore) e a prioridade final (obrigatória, padrão `BAIXA`), além dos campos que o modelo já tem e que continuam obrigatórios (nome, título, descrição, unidade, solicitante, tipo de serviço, natureza, grau de urgência, subtipo, serviço do catálogo, recorrência). Dá para ter mais de um modelo para a mesma categoria (por exemplo, um por prédio); cada um cuida só dos próprios chamados. Ao escolher a categoria, o subtipo vem preenchido com `serviceSubTypeId` da categoria e, se a categoria tem `periodicidadePreventivaDias`, a recorrência vem como "a cada N dias" com esse N; os dois continuam editáveis. O escopo não muda depois de criado. Modelos existentes ficam com escopo "Chamado único" e a tela mostra o escopo e, no modelo por categoria, a categoria e o local.
- **AC-17**: Na rodada do modelo por categoria, os ativos elegíveis são os da categoria com `tierManutencao: 'A'` e `status: 'em_operacao'`; com local no modelo, só os que estão naquele local ou em qualquer local abaixo dele (ativo sem local fica de fora); sem local no modelo, ativo sem local também entra. Sai um chamado por ativo elegível.
- **AC-18**: Cada chamado gerado tem: título `<título do modelo> · <código do ativo>`; descrição, tipo de serviço, natureza, grau de urgência, subtipo, serviço do catálogo e solicitante do modelo; `ativoId` do ativo; `originTemplateId` do modelo; `localExato` igual ao `caminho` do local do ativo (ou "Conforme agendamento" se o ativo não tem local); `unitId` do modelo (a unidade do chamado é quem pede, e o `unitId` do local nunca a substitui, regra da 0011).
- **AC-19**: O chamado nasce `validado`, com `finalPriority` do modelo, `attendanceNature` correspondente à natureza, `classifiedAt` igual à hora da geração, snapshot de SLA de `montarSnapshotSla(prioridade, agora)` e sem técnico. O histórico ganha a entrada `abertura` com `actorType: 'sistema'` e a observação "Preventiva gerada pelo agendamento <nome do modelo>". Se `montarSnapshotSla` falhar (sem configuração de SLA para a prioridade), o chamado nasce `aberto`, sem prioridade nem SLA, como o recorrente de hoje, e conta como "sem SLA" no lote.
- **AC-20**: Um ativo que já tem chamado do mesmo modelo (`originTemplateId` e `ativoId`) em status não finalizado (`CHAMADO_STATUS_NAO_FINALIZADOS`) é pulado e conta como "pulado".
- **AC-21**: Ao reservar, o modelo grava `ultimoLote` com `situacao: 'em_andamento'`; ao fim da rodada grava `situacao: 'concluido'` com `gerados`, `pulados`, `semSla`, `erros` e `motivo?`. A lista de recorrentes mostra "interrompido" quando o último lote está `em_andamento` há mais de 1 hora (o processo caiu no meio; os ativos que faltaram entram no próximo período). Ao fim, cada Admin e Preposto ativo recebe uma `Notification` `preventiva:lote`, por exemplo "Preventiva Splits Sede: 38 gerados, 2 pulados", que no sino leva a `/gestao/recurring`. Se nenhum ativo for elegível, o aviso diz "nenhum ativo elegível, confira a categoria e o local do modelo". Não sai `ticket:new` por chamado, nem e-mail. A lista de recorrentes mostra o resumo do último lote.
- **AC-22**: Duas execuções simultâneas do cron nunca processam o mesmo modelo por categoria na mesma rodada: o modelo é reservado por uma atualização atômica que avança `nextRunAt` antes de gerar, e quem não conseguiu reservar não gera nada. O novo `nextRunAt` é o primeiro horário da recorrência depois de agora: com o cron parado por semanas, sai um lote só, não um por período perdido.
- **AC-23**: Número de chamado repetido (corrida com outra abertura) gera um número novo e tenta de novo, até 3 tentativas. Qualquer outra falha ao criar o chamado de um ativo conta em "erros" e o lote segue para o próximo ativo. Categoria desativada ou solicitante inativo: o lote não gera nada, o modelo é desativado (`isActive: false`) e o aviso do lote traz o motivo ("categoria desativada" ou "solicitante inativo") e diz que o modelo foi pausado; reativar é pela tela, como hoje.
- **AC-24**: Modelos com escopo "Chamado único" continuam funcionando exatamente como hoje (um chamado `aberto`, aviso `ticket:new` por chamado).
- **AC-25**: Os chamados gerados aparecem na ficha do ativo (que já lista chamados por `ativoId`) e na fila de validados da gestão, prontos para atribuição.

## Feature design

**Data model sketch** (campos novos em `RecurringTicket`):

| Campo              | Tipo                                                                                         | Regra                                                        |
| ------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `escopo`           | `template` \| `categoria_ativo`                                                              | padrão `template`; imutável depois de criado                 |
| `categoriaAtivoId` | ObjectId?                                                                                    | ref `CategoriaAtivo`; obrigatório quando `categoria_ativo`   |
| `localizacaoId`    | ObjectId?                                                                                    | ref `Localizacao`; só com `categoria_ativo`                  |
| `finalPriority`    | `BAIXA` \| `NORMAL` \| `ALTA` \| `EMERGENCIAL`                                               | obrigatório quando `categoria_ativo`, padrão `BAIXA` na tela |
| `ultimoLote`       | `{ situacao: 'em_andamento' \| 'concluido', em, gerados, pulados, semSla, erros, motivo? }`? | gravado pela rodada                                          |

Schema Zod em `shared/chamados/recurring-ticket.schemas.ts`: união discriminada por `escopo`, com os campos de sempre nos dois ramos e os três novos só em `categoria_ativo`. A ação de editar recusa troca de escopo.

Sem índice novo em `Chamado`: o `distinct` do passo 4 filtra por `ativoId: { $in }` e usa o índice parcial `{ ativoId: 1, createdAt: -1 }` da 0011.

`preventiva:lote` entra em `NOTIFICATION_TYPES`; `getNotificationMeta` ganha ícone e rótulo "Preventiva gerada", e `getNotificationUrl` leva a `/gestao/recurring`. `Notification.data`: `{ recurringId, nome, gerados, pulados, semSla, erros, pausado }`. Título: `Preventiva <nome do modelo>: N gerados, M pulados` (mais `, K sem SLA` e `, E com erro` quando diferentes de zero); sem elegíveis: `Preventiva <nome>: nenhum ativo elegível, confira a categoria e o local do modelo`; pausado: `Preventiva <nome> pausada: <motivo>`.

Campos do chamado que vêm do modelo sem mudança, como no recorrente de hoje: `tipoServico`, `naturezaAtendimento`, `grauUrgencia`, `subtypeId`, `catalogServiceId`, `solicitanteId`, `descricao`. O subtipo sugerido pela categoria só preenche a tela; o que vale na geração é o gravado no modelo, junto com o serviço do catálogo escolhido no mesmo formulário, com a mesma validação que o recorrente comum já faz entre os dois. `classifiedByUserId` fica vazio, como no chamado que a 0007 valida sozinho; `ChamadoHistory.userId` aceita nulo com `actorType: 'sistema'`.

**Fluxo da rodada** (`lib/chamados/preventiva-categoria.ts`, `gerarLotePreventiva(modelo, contexto)`, chamado por `processRecurringTickets` quando `escopo === 'categoria_ativo'`; o ramo `template` não muda):

1. **Reserva**: calcula o próximo `nextRunAt` aplicando `calculateNextRunAt` a partir do `nextRunAt` atual e repetindo até passar de agora (sem acumular lotes atrasados), e faz `findOneAndUpdate({ _id, nextRunAt: <o lido>, isActive: true }, { $set: { nextRunAt: proximo, lastRunAt: agora, ultimoLote: { situacao: 'em_andamento', em: agora, gerados: 0, pulados: 0, semSla: 0, erros: 0 } } })`. Sem documento de volta, outra execução já reservou: sai sem gerar.
2. **Pré condições**: categoria existe e está ativa; solicitante existe e está ativo. Falha: `$set: { isActive: false, ultimoLote: { situacao: 'concluido', motivo, ... } }`, avisa (pausado) e sai.
3. **Elegíveis**: `Ativo.find({ categoriaId, tierManutencao: 'A', status: 'em_operacao', ...(local ? { localizacaoId: { $in: idsDaSubarvore(local) } } : {}) })`, ordenados por `codigo`. `idsDaSubarvore` de `lib/ativos/localizacao.ts` já existe.
4. **Pulados**: uma consulta só, `Chamado.distinct('ativoId', { originTemplateId, ativoId: { $in }, status: { $in: CHAMADO_STATUS_NAO_FINALIZADOS } })`.
5. **Snapshot**: `montarSnapshotSla(finalPriority, agora)` uma vez por lote (a prioridade e o instante são os mesmos para todos); `ok: false` faz o lote inteiro nascer `aberto` e contar em `semSla`.
6. **Um por um**, em sequência: `generateTicketNumber()`, `Chamado.create` (erro de chave duplicada em `ticket_number`: novo número, até 3 tentativas), `ChamadoHistory.create`. Outro erro conta em `erros` e segue.
7. **Fecho**: `$set: { ultimoLote: { situacao: 'concluido', ... } }`, `$inc: { totalGenerated: gerados }`, `insertMany` da notificação de lote. `revalidatePath` não se aplica (roda no cron).

O `localExato` de cada ativo vem de uma consulta só aos locais do lote (`Localizacao.find({ _id: { $in } })`, campo `caminho`).

**Tempo da rodada.** O `chamar-cron` corta a espera em 60 segundos (`curl --max-time 60`), mas o Next segue processando depois que o curl desiste; o log do cron mostra o corte e o `ultimoLote` mostra o resultado real. Com algumas centenas de ativos, o lote cabe nesse tempo na maioria das rodadas; não há fila nem trabalho em segundo plano.

**API surface**:

| Endpoint / ação                                | Método        | Key inputs                                                                        | Key outputs                                                           | Auth             | Key errors                                               |
| ---------------------------------------------- | ------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------- | -------------------------------------------------------- |
| `createRecurringTemplateAction` (existente)    | Server Action | campos de sempre + `escopo`, `categoriaAtivoId`, `localizacaoId`, `finalPriority` | `{ ok }`                                                              | `requireManager` | categoria inativa, local inexistente, prioridade ausente |
| `updateRecurringTemplateAction` (existente)    | Server Action | idem, sem trocar `escopo`                                                         | `{ ok }`                                                              | `requireManager` | troca de escopo                                          |
| `POST /api/cron/recurring-tickets` (existente) | POST          | header `x-cron-secret`                                                            | relatório com `gerados`, `pulados`, `semSla` por modelo nos `details` | segredo do cron  | 401                                                      |

A tela (`RecurringTicketDialog.tsx`) ganha a escolha de escopo no topo, e no escopo por categoria os seletores de categoria, local (árvore de `listarLocaisAtivos`) e prioridade, com o preenchimento do AC-16. `RecurringTicketsClient.tsx` mostra escopo, categoria, local e o `ultimoLote`.

**Value sourcing**:

| Ação    | Valor              | Fonte                                                                     |
| ------- | ------------------ | ------------------------------------------------------------------------- |
| Tela    | subtipo sugerido   | `CategoriaAtivo.serviceSubTypeId`                                         |
| Tela    | intervalo sugerido | `CategoriaAtivo.periodicidadePreventivaDias`                              |
| Rodada  | ativos elegíveis   | `Ativo` por `categoriaId`, tier, status e `idsDaSubarvore(localizacaoId)` |
| Chamado | título             | `RecurringTicket.titulo` + `Ativo.codigo`                                 |
| Chamado | `localExato`       | `Localizacao.caminho` do local do ativo                                   |
| Chamado | `unitId`           | `RecurringTicket.unitId` (regra da 0011)                                  |
| Chamado | `finalPriority`    | `RecurringTicket.finalPriority`                                           |
| Chamado | `attendanceNature` | `toAttendanceNature(RecurringTicket.naturezaAtendimento)`, como a 0007    |
| Chamado | `sla`              | `montarSnapshotSla(finalPriority, agora)`                                 |
| Chamado | `classifiedAt`     | hora da geração; `classifiedByUserId` fica vazio (autor é o sistema)      |
| Lote    | destinatários      | `User` Admin e Preposto ativos                                            |

**Key invariants**:

- No máximo uma preventiva não finalizada por `(modelo, ativo)`. A garantia vem da reserva atômica do modelo (só uma execução gera) mais a checagem do passo 4; não há índice único, porque o status muda e um índice parcial por status não cobre a regra sem custo maior.
- Chamado `validado` gerado aqui sempre tem `finalPriority` e `sla`; sem snapshot ele nasce `aberto`.
- O ramo `template` não lê nem escreve nenhum campo novo.

**Security model**: Criar e editar modelo segue `requireManager` (Admin e Preposto), como hoje. A rodada roda sob o segredo do cron. O chamado gerado fica visível para o solicitante do modelo como qualquer chamado dele; nenhum dado de `camposPatrimoniais` entra no chamado.

**Configuration required**: nenhuma variável nova.

**Critical test scenarios**:

- Happy path: categoria com 3 ativos Tier A em operação, 1 inoperante e 1 Tier B; rodada gera 3 chamados `validado`, com SLA, ativo, título com código, local exato e unidade do modelo; um só aviso de lote.
- Atraso: `nextRunAt` três períodos no passado gera um lote só, e o novo `nextRunAt` fica no futuro. Verifies **AC-22**
- Pausa: categoria desativada deixa o modelo `isActive: false` e um aviso de pausa. Verifies **AC-23** Verifies **AC-17**, **AC-18**, **AC-19**, **AC-21**
- Recorte: modelo com local "Prédio Sede" ignora o ativo de outro prédio. Verifies **AC-17**
- Duplicado: segunda rodada com uma preventiva ainda `em atendimento` pula aquele ativo e gera os outros. Verifies **AC-20**
- Sem SLA: sem `SlaConfig` ativa para `BAIXA`, todos nascem `aberto` e o lote mostra `semSla`. Verifies **AC-19**
- Concorrência (banco real): duas chamadas simultâneas de `processRecurringTickets` geram um lote só. Verifies **AC-22**
- Erro parcial: falha forçada no segundo ativo deixa o primeiro e o terceiro gerados e `erros: 1`. Verifies **AC-23**
- Lote vazio e categoria desativada: avança `nextRunAt` e o aviso traz o motivo. Verifies **AC-21**, **AC-23**
- Regressão: modelo `template` gera um `aberto` e um `ticket:new` como antes. Verifies **AC-24**

## Build plan

- **P1. O fio**: campos novos no modelo e no schema, ramo `gerarLotePreventiva` com reserva, elegíveis sem recorte, criação `validado` com snapshot, `ultimoLote` com `em_andamento` e `concluido`, salto do `nextRunAt` atrasado. Testado chamando `processRecurringTickets` direto. Satisfies **AC-17**, **AC-18**, **AC-19**, **AC-22**, **AC-24**, **AC-25**
- **P2. Regras do lote**: pulados, sem SLA, nova tentativa do número, erro parcial, pré condições com pausa do modelo, recorte por local, aviso `preventiva:lote` no modelo e no sino. Satisfies **AC-17**, **AC-20**, **AC-21**, **AC-23**
- **P3. Tela**: escopo no diálogo, seletores de categoria, local e prioridade, preenchimento pela categoria, recusa de troca de escopo, lista com escopo e último lote. Satisfies **AC-16**, **AC-21**
- **P4. Testes de banco real**: reserva concorrente e regressão do ramo `template`. Satisfies **AC-22**, **AC-24**

## Rationale (short)

Um escopo novo no `RecurringTicket`, e não um modelo separado de plano preventivo: reaproveita tela, cálculo de recorrência, rota e cron que já funcionam, e a proposta 0009 já previa esse campo. O lote nasce `validado` porque 40 classificações iguais não acrescentam julgamento; a prioridade sai do modelo, que a gestão escolheu. A reserva atômica entra só no ramo novo para não mexer no comportamento do recorrente atual (a mesma falha de dupla execução no ramo antigo vale um item próprio, ver Follow-up do rationale). Raciocínio completo em [rationale.md](rationale.md).
