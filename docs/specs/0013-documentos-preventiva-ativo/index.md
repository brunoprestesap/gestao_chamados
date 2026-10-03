# 0013. Documentos do ativo e preventiva por categoria

**Date**: 2026-10-03
**Status**: Accepted

## Summary

Esta é a fatia 3 da gestão de ativos (spec 0011). Ela tem duas partes que se constroem separadas. Na primeira, o Sigma passa a guardar laudos e certificados (PMOC, AVCB, ART, laudo de SPDA, garantia) presos a um ativo ou a um local, e avisa a gestão 90, 60 e 30 dias antes de vencerem, e de novo quando vencem. Na segunda, um modelo de chamado recorrente pode apontar para uma categoria de ativo e gerar um chamado preventivo para cada equipamento em operação, já validado e com prazo de SLA. As duas partes resolvem o mesmo problema: o contrato predial tem obrigações por equipamento, e hoje o sistema não sabe nem o que está vencido nem o que deixou de receber preventiva.

## Structure

- [0001-documentos-ativo.md](0001-documentos-ativo.md): tipos de documento configuráveis, cadastro com arquivo, substituição, correção e exclusão, ficha, painel geral com o que falta e o job diário de vencimento. Decide como o documento vira prova e alerta sem gerar aviso repetido. AC-1 a AC-15.
- [0002-preventiva-categoria.md](0002-preventiva-categoria.md): modelo recorrente com escopo por categoria de ativo, geração de um chamado por ativo elegível, nascimento validado com SLA, pulo de duplicado e aviso por lote. Decide como um lote de dezenas de chamados nasce sem passar pela triagem e sem duplicar. AC-16 a AC-25.

## Requirements

**User stories**:

- Como Preposto, quero ser avisado com meses de antecedência de que o AVCB ou o PMOC vai vencer, para ter tempo de cobrar a renovação da contratada.
- Como Admin, quero ver numa tela só o que está vencido, o que vence em breve e quais equipamentos estão sem o documento que a categoria exige, para responder a uma fiscalização.
- Como técnico, quero abrir o PMOC e a ART do equipamento pela ficha, para não depender de alguém me mandar o PDF.
- Como Preposto, quero que a preventiva dos splits saia sozinha, um chamado por aparelho, já com prazo, para só distribuir os técnicos.

**Acceptance criteria**: cada parte traz os seus, com numeração única no conjunto (AC-1 a AC-15 nos documentos, AC-16 a AC-25 na preventiva). Eles são o contrato do `/develop` e do `/check verify`.

## Decision

**Chosen option**: documentos em coleção própria com arquivo no mesmo disco dos anexos e alerta por job diário com marca por limite; preventiva como um novo escopo do `RecurringTicket` existente, gerando o lote na rodada do cron de recorrentes.

- Documentos: `TipoDocumento` (cadastro do Admin) e `DocumentoAtivo` (preso a ativo ou local, um vigente por tipo e alvo garantido por índice único parcial). Upload por `POST /api/ativos/documentos` em multipart (Server Action tem limite de corpo pequeno), arquivo em `data/uploads/documentos/`. Job `POST /api/cron/documentos-vencimento` uma vez por dia, que grava em `alertasEnviados` cada limite já avisado.
- Preventiva: `RecurringTicket.escopo = 'categoria_ativo'` com categoria, recorte de local opcional e prioridade final. `processRecurringTickets` ganha um ramo que reserva o modelo de forma atômica, monta a lista de ativos elegíveis e cria os chamados um a um, `validado` com `montarSnapshotSla`, pulando o ativo que ainda tem preventiva aberta do mesmo modelo.

Reasoning and options: see [rationale.md](rationale.md).

## Cross part contract

Regras que as duas partes respeitam juntas:

- **Ativo baixado está fora de tudo.** Não alerta documento, não entra em "faltando", não gera preventiva. A preventiva é ainda mais estreita (só Tier A e `em_operacao`, ver a parte 2).
- **Árvore de locais.** As duas partes percorrem a árvore só pelos apoios de `lib/ativos/localizacao.ts`: `ancestraisDe` (novo, sobe pelo `parentId`, para documento herdado e para achar o prédio) e `idsDaSubarvore` (já existe, desce pelo prefixo de `caminho`, inclui locais desativados, para o recorte do modelo). Nenhuma das duas reimplementa o percurso. **Prédio** de um local é o próprio local ou o ancestral mais próximo com `tipo: 'predio'`; sem nenhum, o local não tem prédio.
- **Unidade do chamado não vem do local.** Como manda o comentário de `models/Localizacao.ts` (spec 0011), o `unitId` de um local é quem ocupa e nunca vira o `unitId` de chamado. A preventiva usa a unidade do modelo.
- **Notificações novas.** `NOTIFICATION_TYPES` de `models/Notification.ts` ganha `documento:vencimento` e `preventiva:lote` (sem isso o `insertMany` falha na validação). Nenhuma das duas vira evento do Socket.IO: o aviso fica gravado e aparece no sino na próxima leitura. `getNotificationUrl` (`lib/notification-url.ts`) e `getNotificationMeta` (`components/realtime/NotificationsBell.tsx`) ganham os dois tipos, lendo o `data` definido em cada parte.
- **Destinatários.** Os dois avisos vão para todo usuário `Admin` ou `Preposto` com `isActive: true`, a mesma consulta que `lib/recurring-job.ts` já usa.
- **Crontab num bloco só.** A linha nova do job de documentos entra no mesmo `printf ... | crontab -` do serviço `cron` do `docker-compose.yml` (um segundo `crontab -` apagaria os outros).

## Build plan

Tracer Bullet, documentos primeiro (é o que tem prazo legal). Cada passo funciona de ponta a ponta antes do próximo. Os detalhes de cada passo estão na parte correspondente.

**Parte 1: documentos** ([0001-documentos-ativo.md](0001-documentos-ativo.md), seção _Build plan_, passos D1 a D6)

**Parte 2: preventiva** ([0002-preventiva-categoria.md](0002-preventiva-categoria.md), seção _Build plan_, passos P1 a P4)

## Consequences

**Positive**:

- O Sigma passa a responder "o que vence este trimestre" e "que equipamento está sem laudo", que hoje dependem de planilha.
- `exigeDocumento` e `periodicidadePreventivaDias`, criados na 0011 e até hoje sem uso, passam a valer.
- Um lote de preventiva não entope a fila de triagem do Preposto.

**Negative / tradeoffs**:

- Mais um job no container `cron` e mais uma pasta no volume de uploads, que entra no backup.
- O nginx ganha um bloco `location` próprio, mais uma coisa para lembrar no `default.tls.conf`.
- O lote de preventiva gera dezenas de números de chamado seguidos pelo `generateTicketNumber`, que não tem trava (item já no Deferred do scope); o índice único de `ticket_number` transforma a corrida em erro de um ativo, não em número duplicado.

**Neutral**:

- Nenhum campo nem índice novo em `Chamado`: a preventiva é reconhecida por `originTemplateId` mais `ativoId`, e o índice parcial `{ ativoId, createdAt }` da 0011 basta para a checagem de duplicado.
- A extração do apoio de upload para `lib/uploads/` refatora `app/api/upload/route.ts`, que já funciona; os testes atuais dessa rota precisam continuar passando.
- Modelos recorrentes antigos continuam `escopo: 'template'` sem migração (padrão do campo).

## Follow-up

- [ ] Depois de `/develop`, acrescentar em `lib/ativos/AGENTS.md` as regras de documento (um vigente por tipo e alvo, herança pelos locais acima, marcas de aviso) e o escopo novo do recorrente.
- [ ] `default.tls.conf` precisa do mesmo bloco `location` de 21M quando o TLS for ligado (item já no Deferred do scope).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
