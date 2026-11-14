# Escopo: Vários órgãos

Parte do escopo do Sigma. Tabela geral, Deferred e legenda em [index.md](index.md).

Um Sigma só passa a atender vários órgãos do Judiciário, cada um com seus dados separados, seu AD, seus tipos de serviço e seus contratos, e cada contrato com seus níveis de serviço (SLA e IMR). Os dados de hoje viram o órgão 1, sem parar a produção.

**Liberação de tudo junto:** a construção segue em fatias (Tracer Bullet), mas nenhum órgão novo entra em produção antes de 38 a 48 estarem prontas; a 49 é o ensaio geral. Até lá, o órgão 1 continua funcionando como hoje a cada fatia entregue.

**Nível:** o padrão do projeto segue Beta. Isolamento, login, migração, tempo real e o que mexe em prazo contratual e glosa levam `· GA`, porque vazar dado entre órgãos (LGPD) e mudar SLA ou IMR de quem já usa são os riscos mais caros até aqui.

## Vários órgãos: fundação

### 38. Órgão e isolamento dos dados · in-progress · GA

Todo dado passa a pertencer a um órgão, e cada consulta e cada gravação enxerga só o órgão de quem está logado. É a decisão que todas as outras desta fatia seguem.
**Done when:** chamados, usuários, unidades, catálogo, ativos, material, IMR, notificações e configurações pertencem a um órgão; nenhuma tela, rota de API, Server Action, relatório ou PDF devolve dado de outro órgão; um teste de varredura quebra quando surge consulta nova sem o órgão; os índices únicos (número do chamado, matrícula, número do contrato, código `MNT`) passam a valer dentro do órgão.
spec [0025](../specs/0025-orgao-isolamento-dados/index.md) · code in `lib/orgaos/`, `models/Orgao.ts`

- [x] Design it (spec): `/architect órgão e isolamento dos dados`
- [ ] Build it: `/develop órgão e isolamento dos dados`
  - [x] O fio inteiro com `Chamado` e `User`: `Orgao` e órgão 1, contexto, plugin de leitura e gravação, sessão com `orgaoId`, modo observação na VPS (fatia 1) · AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8, AC-9, AC-10, AC-15
  - [x] Plugin completo nos 55 modelos de órgão e varredura dos modelos (fatia 2) · AC-4, AC-5, AC-6, AC-14, AC-15
  - [x] Índices únicos por órgão e `Contador` por órgão (fatia 3) · AC-11, AC-12, AC-15
  - [ ] Cron por órgão e gravações depois da resposta (fatia 4) · AC-13, AC-15
  - [ ] Varredura de APIs proibidas, seed, cargas, fixtures e suíte inteira em estrito (fatia 5) · AC-1, AC-3, AC-7, AC-14, AC-16
- [ ] Verify it: `/check verify órgão e isolamento dos dados`
- [ ] Test it: `/test órgão e isolamento dos dados`
- [ ] Review it (fresh model): `/check review órgão e isolamento dos dados`
- [ ] Document it: `/document órgão e isolamento dos dados`

### 39. Migração do órgão atual para o órgão 1 · needs a decision · GA

Os dados de hoje passam a ser do órgão 1 sem parada e sem perder histórico; quem usa hoje não percebe a mudança. As funcionalidades seguintes trazem, cada uma, a migração da parte delas.
**Done when:** todo documento existente recebe o órgão 1 por uma migração que pode rodar de novo sem estragar nada; os índices únicos trocam para a versão por órgão sem janela de duplicado; há um caminho de volta testado antes de rodar na VPS; o E2E de hoje passa igual depois da migração.

- [ ] Design it (spec): `/architect migração do órgão atual para o órgão 1`

### 40. Gestor da plataforma e cadastro de órgãos · needs a decision · GA

Um papel novo, acima do Admin, cria os órgãos e o primeiro Admin de cada um, sem nunca ver chamado, pessoa ou custo de órgão nenhum.
**Done when:** o Gestor da plataforma cria um órgão (nome, sigla) com o primeiro Admin, e esse Admin entra e configura o resto sozinho; desativar um órgão bloqueia o login de todos dele sem apagar nada; o Gestor da plataforma não abre nenhuma tela de dentro de um órgão; tudo o que ele faz fica numa trilha própria.

- [ ] Design it (spec): `/architect gestor da plataforma e cadastro de órgãos`

### 41. Login com o AD de cada órgão · needs a decision · GA

Cada órgão configura o próprio LDAP/AD na tela, e a mesma matrícula pode existir em dois órgãos sem confusão. Cada conta pertence a um órgão só.
**Done when:** o Admin do órgão cadastra e testa o AD dele, e o segredo nunca volta para a tela nem para o log; o login descobre o órgão certo antes de falar com o AD; o primeiro login cria o usuário no órgão certo, com a unidade dele; o órgão 1 segue com o AD das variáveis de ambiente até passar para a tela; a senha local continua como reserva.

- [ ] Design it (spec): `/architect login com o AD de cada órgão`

### 42. Tempo real, cron e avisos por órgão · needs a decision · GA

O servidor de tempo real, as rodadas do cron e os e-mails passam a respeitar o órgão: a sala dos gestores de um órgão nunca recebe evento de outro.
**Done when:** evento de chamado e de cotação chega só a gente do mesmo órgão, inclusive na sala `managers`; cada cron (recorrentes, SLA, encerramento, documentos, material) roda por órgão com a configuração dele; o e-mail sai com o nome do órgão; um teste com dois órgãos prova que nada cruza.

- [ ] Design it (spec): `/architect tempo real, cron e avisos por órgão`

## Vários órgãos: contratos e níveis de serviço

### 43. Configurações próprias de cada órgão · needs a decision

Expediente, fuso, feriados e prazo para avaliar passam a ser de cada órgão, porque o SLA e o IMR dependem deles.
**Done when:** o Admin do órgão edita expediente, fuso, feriados e prazo para avaliar só do órgão dele; o cálculo de prazo de um chamado usa a configuração do órgão do chamado; o órgão 1 continua com os valores de hoje (America/Belem, 08:00 às 18:00, 48 horas).

- [ ] Design it (spec): `/architect configurações próprias de cada órgão`

### 44. Tipos de serviço por órgão · needs a decision

A lista fixa de três tipos vira cadastro de cada órgão, para cada um ter os tipos que contrata (limpeza, jardinagem, incêndio e outros).
**Done when:** o Admin do órgão cria, renomeia e desativa tipos sem apagar histórico; catálogo, formulário, chat com IA, gestão, especialidade do técnico, IMR e relatório por contrato seguem os tipos do órgão; o órgão 1 continua com os três de hoje, e os relatórios antigos dão os mesmos números.

- [ ] Design it (spec): `/architect tipos de serviço por órgão`

### 45. Contrato com níveis de SLA · needs a decision · GA

Cada órgão cadastra os contratos (um por tipo de serviço, ou um que cubra vários) e define em cada um os prazos de resposta e de solução por prioridade, contando só no expediente ou 24x7. O SLA único de hoje deixa de existir. Mexe em prazo contratual e glosa, como a 15.
**Done when:** o Admin do órgão cadastra o contrato com os níveis por prioridade; o snapshot de SLA de todo chamado (formulário, chat, preventiva, correção de prioridade) sai do contrato vigente para o tipo do chamado; chamado sem contrato vigente segue uma regra definida e visível para a gestão; mudar o nível depois não altera chamado já classificado; os contratos do órgão 1 recebem os prazos do SLA de hoje.

- [ ] Design it (spec): `/architect contrato com níveis de SLA`

### 46. IMR configurável por contrato · needs a decision · GA

Indicadores, pesos, faixas e glosa do IMR deixam de estar fixos no código e passam a vir de cada contrato, porque cada edital traz o seu. Mexe em glosa, por isso GA.
**Done when:** o Admin do órgão define no contrato os indicadores e a pontuação; o IMR geral, o IMR do contrato e o PDF do fechamento leem do contrato; fechamento já feito nunca muda (a foto imutável da 0023 segue valendo); o contrato 01/2022 do órgão 1 dá os mesmos pontos de hoje.

- [ ] Design it (spec): `/architect IMR configurável por contrato`

## Vários órgãos: operação

### 47. Módulos ligados por órgão · needs a decision

O Gestor da plataforma liga ou desliga, por órgão, o chat com IA, os ativos, a cotação de material e a integração com o SICAM, para o órgão novo começar só com chamados e contratos.
**Done when:** módulo desligado some do menu, recusa as rotas e as Server Actions e não roda no cron daquele órgão; ligar depois não exige deploy; o órgão 1 nasce com tudo o que usa hoje ligado.

- [ ] Design it (spec): `/architect módulos ligados por órgão`

### 48. IA por órgão: calibração e cota · needs a decision

Cada órgão tem a própria calibração de confiança, os próprios interruptores de autonomia e uma cota de uso da GPU, para um órgão não esgotar a IA dos outros.
**Done when:** a calibração e a autonomia de um órgão usam só os chamados dele; o órgão que passa da cota segue sem IA (o chat abre pelo modo manual) e os outros seguem normais; cada `LlmCall` registra o órgão; o órgão 1 mantém a calibração atual.

- [ ] Design it (spec): `/architect IA por órgão: calibração e cota`

## Vários órgãos: liberação

### 49. Entrada do segundo órgão · GA

O ensaio geral antes de liberar: um segundo órgão real entra em produção só depois de 38 a 48 prontas.
**Done when:** um E2E com dois órgãos cobre login, abertura pelo formulário e pelo chat, atribuição, SLA pelo contrato, IMR e relatórios, e prova que nada cruza; o segundo órgão é criado em produção pelo Gestor da plataforma e abre o primeiro chamado; o passo a passo de entrada de órgão novo está em `DOCKER_PRODUCAO.md`.

- [ ] Build it: `/develop entrada do segundo órgão`
