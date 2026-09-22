# Scope: Sigma

Sigma é o sistema de chamados de manutenção (predial, ar condicionado, elevador) usado pelos servidores, com triagem pelo Preposto, técnicos por especialidade e SLA contratual.
Esta passada planeja a abertura de chamados por conversa: o solicitante relata o problema em linguagem natural e a IA local (vLLM com Qwen, na rede interna) escolhe o serviço, define a urgência e encaminha a um técnico. A liberação será para todos de uma vez, por isso a trava de confiança é calibrada antes de a IA decidir sozinha.

**Build approach:** Tracer Bullet (fatias verticais: cada fatia funciona de ponta a ponta antes de a próxima engrossar o fio).
**Workflow:** Beta (depois do `/develop`: `/check verify`, depois `/test`). É o nível padrão de rigor do projeto. O `/architect` é a primeira parada recomendada para funcionalidade com decisão real, mas você pode pular quando já souber como construir. Qualquer funcionalidade pode ter sua própria marca (ex.: `· GA`) para fazer mais ou menos.

_São recomendações para manter a construção organizada, não obrigações. Pule o que não servir: se você já sabe como construir uma funcionalidade, use `/develop` e pule o `/architect`. Você decide quando uma funcionalidade está `done`._

## At a glance

| #   | Feature                                            | Phase      | Status   |
| --- | -------------------------------------------------- | ---------- | -------- |
| 1   | Autenticação LDAP e perfis                         | Contexto   | existing |
| 2   | Unidades e usuários                                | Contexto   | existing |
| 3   | Catálogo de serviços                               | Contexto   | existing |
| 4   | Abertura de chamado por formulário                 | Contexto   | existing |
| 5   | Triagem, classificação e atribuição pelo Preposto  | Contexto   | existing |
| 6   | Detalhe do chamado: comentários, histórico, anexos | Contexto   | existing |
| 7   | SLA, expediente e pausas                           | Contexto   | existing |
| 8   | Notificações em tempo real                         | Contexto   | existing |
| 9   | Integração com a IA local                          | Foundation | done     |
| 10  | Conversa e decisões da IA no banco                 | Foundation | done     |
| 11  | Tela de chat de chamados                           | Slice 1    | done     |
| 12  | Abertura do chamado pela IA                        | Slice 1    | done     |
| 13  | Andamento e conversa com o técnico                 | Slice 2    | planned  |
| 14  | Calibração da trava de confiança                   | Slice 3    | planned  |
| 15  | Prioridade e SLA automáticos                       | Slice 3    | planned  |
| 16  | Atribuição automática ao técnico                   | Slice 3    | planned  |
| 17  | Revisão das decisões da IA pelo Preposto           | Slice 3    | planned  |
| 18  | Painel de acurácia da IA                           | Slice 3    | planned  |
| 19  | Fotos no chat                                      | Slice 4    | planned  |
| 20  | Aviso de chamado duplicado                         | Slice 4    | planned  |
| 21  | Entrada por voz                                    | Slice 4    | planned  |

## Existing (contexto)

O que esta fatia usa e que já está pronto. Outras áreas prontas (relatório IMR, chamados recorrentes, relatório de breach, feriados) estão descritas no `AGENTS.md` e não são tocadas aqui.

### 1. Autenticação LDAP e perfis · existing

Login por matrícula via LDAP/AD com reserva de senha local, 4 perfis e guards na DAL. code in `auth.ts`, `lib/ldap.ts`, `lib/dal.ts`

### 2. Unidades e usuários · existing

Cadastro de unidades (nome, andar) e usuários; a unidade do usuário vem do departamento do AD no primeiro login e pode estar vazia. code in `app/(dashboard)/unidades/`, `app/(dashboard)/usuarios/`, `models/unit.ts`, `models/user.model.ts`

### 3. Catálogo de serviços · existing

Catálogo em três níveis (tipo, subtipo, serviço) com prioridade padrão por serviço. code in `app/(dashboard)/catalogo/`, `models/ServiceType.ts`, `models/ServiceSubType.ts`, `models/ServiceCatalog.ts`

### 4. Abertura de chamado por formulário · existing

Formulário completo com unidade, local exato, catálogo e urgência. Continua como alternativa ao chat. code in `app/(dashboard)/meus-chamados/_components/NewTicketDialog.tsx`, `app/(dashboard)/meus-chamados/actions.ts`

### 5. Triagem, classificação e atribuição pelo Preposto · existing

Preposto classifica (prioridade final e snapshot de SLA), atribui técnico elegível por especialidade e carga, recusa, reatribui e encerra. code in `app/(dashboard)/gestao/`, `app/api/gestao/chamados/[id]/eligible-technicians/`

### 6. Detalhe do chamado: comentários, histórico, anexos · existing

Página do chamado com linha do tempo de auditoria, comentários, galeria de anexos e cancelamento. code in `app/(dashboard)/meus-chamados/[id]/`, `models/ChamadoComment.ts`, `models/ChamadoHistory.ts`, `models/Attachment.ts`

### 7. SLA, expediente e pausas · existing

Cálculo de prazos por prioridade respeitando expediente e feriados, pausas por aguardando solicitante ou terceiros, monitor de breach. code in `lib/sla-utils.ts`, `lib/sla-monitor.ts`, `lib/expediente-config.ts`, `models/SlaConfig.ts`

### 8. Notificações em tempo real · existing

Socket.IO separado com salas por usuário e gestores, emissão sem bloquear a regra de negócio e reserva no banco. code in `socket-server/`, `lib/realtime-emit.ts`, `shared/socket.ts`

## Foundations

### 9. Integração com a IA local · done

Acesso do servidor ao modelo Qwen no vLLM da rede interna, com respostas estruturadas e validadas, para que toda funcionalidade de IA use o mesmo caminho.
**Done when:** o servidor consulta o modelo e recebe uma resposta estruturada e validada; lentidão ou queda viram uma falha controlada que não derruba a requisição; endereço e credenciais ficam só em variáveis de ambiente, nunca no navegador.
spec [0001](../specs/0001-integracao-ia-local/index.md) · code in `lib/llm/`, `models/LlmCall.ts`, `app/api/llm/status/`

- [x] Design it (spec): `/architect integração com a IA local`
- [x] Build it: `/develop integração com a IA local`
  - [x] Fio fino ponta a ponta contra o vLLM real (config, provedor, `LlmCall`, `generateLlmObject`, servidor falso, teste de fumaça) · AC-1, AC-5, AC-9, AC-10, AC-13
  - [x] Streaming, prazos e cancelamento · AC-2, AC-3, AC-5, AC-10
  - [x] Proteção da GPU compartilhada (vagas, novas tentativas, disjuntor, limite por usuário) · AC-4, AC-6, AC-7, AC-8, AC-10
  - [x] Operação e guarda (rota de status, debug, ESLint, variáveis na VPS) · AC-9, AC-11, AC-12, AC-13
  - [x] Amostragem revisada (valores do card do Qwen3 em todo pedido, medição de velocidade com carga, comparação de repetição contra o vLLM real, `finishReason` e `sampling` no registro) · AC-10, AC-14, AC-15, AC-16
- [x] Verify it: `/check verify integração com a IA local`
- [x] Test it: `/test integração com a IA local`

### 10. Conversa e decisões da IA no banco · done

Onde a conversa vive antes e depois de o chamado existir, como ela se liga aos comentários e ao histórico, e como cada decisão da IA fica registrada para auditoria e métricas.
**Done when:** uma conversa existe antes do chamado e passa a pertencer a ele na criação; cada decisão da IA guarda o que foi decidido, a confiança, o motivo em uma frase e a versão do modelo; uma correção humana posterior fica ligada à decisão original.
spec [0002](../specs/0002-conversa-decisoes-ia/index.md) · code in `lib/conversas/`, `models/Conversa.ts`, `models/ConversaMensagem.ts`, `models/DecisaoIa.ts`, `shared/conversas/`, `lib/chamados/comentarios.ts`

- [x] Design it (spec): `/architect conversa e decisões da IA no banco`
- [x] Build it: `/develop conversa e decisões da IA no banco`
  - [x] Fio fino do rascunho ao chamado (`meta.callId` na IA, três modelos novos, campos novos no chamado e no histórico, `lib/conversas/`, teste contra Mongo em container) · AC-1, AC-3, AC-6, AC-11, AC-15, AC-16
  - [x] Expiração do rascunho, limites, clique duplo e reparo do vínculo · AC-1, AC-2, AC-4, AC-5, AC-16
  - [x] Decisões, vereditos e correções ligadas às ações da gestão · AC-7, AC-8, AC-9, AC-10, AC-16
  - [x] Leitura combinada, visibilidade por perfil e caminho do comentário · AC-11, AC-12, AC-13, AC-14
- [x] Verify it: `/check verify conversa e decisões da IA no banco`
- [x] Test it: `/test conversa e decisões da IA no banco`

## Slice 1: Relatar e abrir pelo chat

### 11. Tela de chat de chamados · done

Tela no estilo dos assistentes conhecidos: os chamados do usuário na lateral como conversas, a conversa aberta no centro e a caixa de mensagem embaixo. Entra como rota própria (`/conversas`), ao lado de Meus Chamados, que continua intacta, com link para o formulário tradicional.
**Done when:** o usuário vê seus chamados como conversas na lateral, começa uma nova e envia o relato; percebe quando a IA está respondendo; a tela funciona no celular e só com teclado, e novas mensagens são anunciadas ao leitor de tela (WCAG 2.1 AA); o link para o formulário fica visível.
spec [0003](../specs/0003-tela-chat-chamados/index.md) · code in `app/(dashboard)/conversas/`, `app/api/conversas/`, `lib/assistente/`, `shared/conversas/quadro.schemas.ts`

- [x] Design it (spec): `/architect tela de chat de chamados`
- [x] Build it: `/develop tela de chat de chamados`
  - [x] Fio fino ponta a ponta: índice novo em `Chamado`, item na sidebar, `/conversas` no servidor com a lateral, tela de boas vindas, rota que cria o rascunho e transmite a resposta do assistente · AC-1, AC-3, AC-5, AC-6
  - [x] Conversa que continua: `/conversas/[id]`, mensagens seguintes, envio otimista com `Tentar de novo`, contadores, frases de erro, descartar rascunho · AC-4, AC-9, AC-12
  - [x] Falha da IA como parte do desenho: mensagem de sistema, quadro de reserva, resposta boa que não grava, link do formulário · AC-7, AC-5b
  - [x] Chamado em modo leitura pela linha do tempo, com cabeçalho e rodapé próprios · AC-10
  - [x] Lateral completa e tempo real: dois blocos, carregar mais com cursor composto, recarga por evento do navegador · AC-2, AC-13
  - [x] Celular e acessibilidade: duas telas com voltar, foco, região ao vivo, alvos de toque e contraste · AC-8, AC-11
- [x] Verify it: `/check verify tela de chat de chamados`
- [x] Test it: `/test tela de chat de chamados`

### 12. Abertura do chamado pela IA · done

A IA lê o relato, escolhe o serviço no catálogo, preenche unidade e andar pelo perfil, tira o local exato do texto, pergunta só o que faltar e mostra um cartão resumo para o usuário confirmar. Nesta fatia o chamado ainda nasce `aberto` para a triagem do Preposto, já com a sugestão da IA.
**Done when:** um relato em texto livre vira chamado confirmado com serviço, unidade e local exato sem o usuário abrir o catálogo; quem não tem unidade no perfil, ou relata problema em outro lugar, recebe uma pergunta; com a IA fora do ar ou lenta, o chamado abre mesmo assim com o texto como descrição; o chamado mostra que foi classificado pela IA e o histórico registra a sugestão.
**Herda da 9:** no verify desta funcionalidade, conferir na VPS com `docker logs` do `next-app` que as chamadas reais geram linhas `[llm]` com `task`, `status`, `reason`, `finishReason`, `attempts` e `latencyMs`, sem texto de relato nem chave (passo movido do verify da spec 0001, AC-11).
spec [0004](../specs/0004-abertura-chamado-ia/index.md) · code in `lib/assistente/`, `lib/conversas/proposta-store.ts`, `app/(dashboard)/conversas/`, `components/chamado/MarcaAberturaChat.tsx`

- [x] Design it (spec): `/architect abertura do chamado pela IA`
- [x] Build it: `/develop abertura do chamado pela IA`
  - [x] Fio fino do relato ao chamado com sugestão (tarefa `conversa.abertura` com catálogo no prompt, `propostaIa`, tipo `cartao` e quadro novo, confirmação por `abrirChamadoDaConversa`, notificação extraída, modo leitura) · AC-1, AC-2, AC-3, AC-4, AC-5, AC-10, AC-11, AC-13, AC-14
  - [x] Unidade, local, `Revisar e abrir` e cartão que muda (unidade do perfil ou obrigatória, edição no cartão, botão, cartão substituído, `cartao_desatualizado`, respostas fora de ordem) · AC-3, AC-4, AC-6, AC-7, AC-10, AC-12, AC-13, AC-17
  - [x] Sem IA, o chamado abre mesmo assim (serviço opcional só no chat, cartão manual, cartão depois da reserva, tetos de entrada) · AC-2, AC-7, AC-8, AC-9
  - [x] Marca da IA, desenho, acessibilidade e medição (marca em três telas, pranchetas no artefato da 0003, região ao vivo, logs, teste de fumaça) · AC-5, AC-15, AC-16, AC-18, AC-19
- [x] Verify it: `/check verify abertura do chamado pela IA`
- [x] Test it: `/test abertura do chamado pela IA`

## Slice 2: Acompanhar pelo chat

### 13. Andamento e conversa com o técnico · needs a decision

A mesma conversa acompanha o chamado até o fim: cada mudança aparece como mensagem em tempo real, e o que o usuário escreve vira comentário que o técnico vê.
**Done when:** classificação, atribuição, início, pausa, conclusão e encerramento aparecem na conversa sem recarregar a página; mensagens do usuário depois da abertura chegam ao técnico como comentário, e as respostas voltam para a conversa; a avaliação de 1 a 5 pode ser feita pela conversa quando o chamado fecha.

- [ ] Design it (spec): `/architect andamento e conversa com o técnico`

## Slice 3: IA decide prioridade e técnico

### 14. Calibração da trava de confiança · needs a decision

Como a liberação é para todos de uma vez, a IA é medida contra chamados que os Prepostos já classificaram antes de decidir sozinha, e o limite de confiança sai dessa medição.
**Done when:** o acerto da IA em serviço e prioridade é medido sobre chamados históricos; o limite de confiança é definido a partir disso e o Admin pode ajustá-lo; o Admin desliga a autonomia sem deploy e tudo volta para a triagem manual.

- [ ] Design it (spec): `/architect calibração da trava de confiança`

### 15. Prioridade e SLA automáticos · needs a decision · GA

Quando confiante, a IA define a prioridade (BAIXA a EMERGENCIAL), o chamado passa a `validado` e o SLA começa igual à classificação manual. Abaixo do limite, fica na triagem com a sugestão. Mexe em prazo contratual e glosa do IMR, por isso GA.
**Done when:** chamado confiante vira `validado` com snapshot de SLA idêntico ao da classificação manual; chamado com pouca confiança fica `aberto` com a sugestão já preenchida; pedir urgência no texto sem motivo real não eleva a prioridade sozinho; decisão, motivo e confiança ficam no histórico.

- [ ] Design it (spec): `/architect prioridade e SLA automáticos`

### 16. Atribuição automática ao técnico · needs a decision

Chamado validado pela IA segue direto para um técnico com a especialidade do serviço e espaço na carga, sem esperar o Preposto.
**Done when:** o técnico escolhido tem a especialidade (subtipo) do serviço e está abaixo do seu limite de chamados; sem técnico elegível, o chamado vai ao Preposto com o motivo; o técnico recebe a notificação de sempre e a atribuição aparece na conversa do solicitante.

- [ ] Design it (spec): `/architect atribuição automática ao técnico`

### 17. Revisão das decisões da IA pelo Preposto · needs a decision

Na Gestão, o Preposto separa o que a IA decidiu do que aguarda triagem e corrige serviço, prioridade ou técnico quando precisar. Cada correção alimenta a métrica principal.
**Done when:** o Preposto filtra chamados decididos pela IA e pendentes de triagem; os pendentes abrem com a sugestão da IA já preenchida; corrigir registra o que mudou; corrigir a prioridade de um chamado com SLA já iniciado segue uma regra definida e registrada.

- [ ] Design it (spec): `/architect revisão das decisões da IA pelo Preposto`

### 18. Painel de acurácia da IA · needs a decision

Visão do Admin sobre a qualidade da IA, base para ajustar a trava de confiança.
**Done when:** o Admin vê o percentual de chamados sem correção humana (a métrica principal) por período e por tipo de serviço; vê quais campos são mais corrigidos, quantos chamados caíram na triagem manual e quantas vezes a IA falhou.

- [ ] Design it (spec): `/architect painel de acurácia da IA`

## Slice 4: Extras da conversa

### 19. Fotos no chat · needs a decision

Anexar fotos do problema durante o relato, reaproveitando os anexos que já existem.
**Done when:** o usuário anexa fotos antes de confirmar e elas ficam no chamado criado; fotos enviadas depois da abertura também entram; o técnico vê as fotos como qualquer anexo.

- [ ] Design it (spec): `/architect fotos no chat`

### 20. Aviso de chamado duplicado · needs a decision

Antes de confirmar, a IA procura chamado em andamento parecido no mesmo local e oferece acompanhar aquele em vez de abrir outro.
**Done when:** um relato parecido com chamado em andamento no mesmo local mostra o aviso; o usuário pode acompanhar o existente ou abrir mesmo assim, sem ver dados pessoais de outro solicitante; o aviso nunca impede a abertura.

- [ ] Design it (spec): `/architect aviso de chamado duplicado`

### 21. Entrada por voz · needs a decision

Ditar o problema em vez de digitar, com a transcrição acontecendo dentro da rede interna.
**Done when:** o usuário grava, vê o texto transcrito e pode editar antes de enviar; o áudio não sai da rede interna; sem microfone ou sem permissão, digitar continua funcionando.

- [ ] Design it (spec): `/architect entrada por voz`

## Deferred

Fora desta passada, guardado para o plano continuar honesto.

- **IA tira dúvidas sobre o chamado**: responder perguntas como "quando vai ser atendido?" com os dados do chamado · needs a decision
- **`cache_salt` do vLLM**: proteger o cache de prefixo da GPU se ela passar a ser compartilhada com sistemas de fora do tribunal · from spec 0001
- **Número de chamado sem corrida**: `generateTicketNumber()` lê o maior número existente e incrementa, sem lock; o chat aumenta as aberturas simultâneas · from spec 0002
- **Histórico do catálogo atualizado**: `updateTicketCatalogAction` grava a ação `catalogo_atualizado`, que não existe no enum do histórico, e falha depois de já ter alterado o chamado · from spec 0002
- **Testes de banco no CI**: decidir se o CI passa a subir um MongoDB de serviço para rodar os testes que dependem de índice e TTL · from spec 0002
- **Formulário a um clique pela conversa**: fazer `/meus-chamados` aceitar um parâmetro que já abre o diálogo do formulário, para o link da lateral não exigir um clique a mais · from spec 0003
- **Unificar as duas entradas**: definir o sinal (por exemplo, percentual de aberturas pelo chat) que encerra a convivência entre `/conversas` e a tabela de `/meus-chamados`, para a decisão não ficar aberta para sempre · from spec 0003
- **Evento próprio de conversa no socket**: hoje a tela de conversas recarrega pelo evento genérico de notificação, e aviso de SLA também dispara recarga; um evento próprio resolve se o desperdício incomodar · from spec 0003
- **Cache de prefixo do vLLM**: confirmar com a equipe da GPU se o vLLM roda com cache de prefixo ligado, porque o catálogo vai no prompt de toda mensagem do chat e o custo cai muito com ele · from spec 0004
- **Telefone de contato no chamado do chat**: o chat não pede dado pessoal, então o chamado nasce sem telefone; decidir como pedir se os técnicos sentirem falta · from spec 0004
- **Logs `[llm]`/`[assistente]` na VPS**: o `/check verify` da 0004 provou tudo o que dava para provar localmente; falta conferir com `docker logs` do `next-app` que as chamadas reais de produção geram as linhas esperadas, sem texto de relato nem chave, depois que esta fatia for implantada · from spec 0004
- **Leitor de tela de verdade no AC-18**: o `/check verify` da 0004 conferiu a região ao vivo programaticamente (o texto que ela recebe bate com o esperado), mas sem NVDA ou outro leitor de tela instalado nesta máquina para ouvir o anúncio de verdade; rodar quando houver um leitor de tela disponível · from spec 0004

## Legend

**A caixa de decisão.** Toda funcionalidade tem exatamente uma, a subtarefa cujo rótulo termina com `(spec)`. O texto pode variar, então as skills a encontram pelo final `(spec)`, nunca pelo rótulo exato. Toda outra caixa é de execução, e o `/architect` nunca marca nenhuma delas.

**Ciclo de vida da funcionalidade**: o plano muda conforme a funcionalidade avança; cada linha mostra o que aparece e quem define:

| Estado                       | Definido por                                                                          | A funcionalidade mostra                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planned` · needs a decision | `/scope`                                                                              | uma caixa: `Design it (spec): /architect <funcionalidade>`                                                                                                                                                                                                 |
| `in-progress` (desenhada)    | **`/architect` ao capturar a spec**                                                   | `Design it` marcada; spec ligada; `Build it: /develop <funcionalidade>` com **2 a 5 marcos**; as caixas finais do nível (`Verify it` de Alpha em diante, `Test it` de Beta em diante, `Review it` e `Document it` em GA); pendências surgidas já inscritas |
| `in-progress` (construindo)  | `/develop`                                                                            | os marcos são marcados um a um; o ponteiro de código é preenchido                                                                                                                                                                                          |
| `in-progress` (verificada)   | `/check verify`                                                                       | `Build it` e marcos marcados; `Verify it` marcada                                                                                                                                                                                                          |
| `done`                       | **você, quando decidir** (qualquer skill marca quando você pedir); `/sync` reconcilia | caixas executadas marcadas, as puladas indicadas; a última etapa do nível (`Prototype` depois do `/develop`; `Alpha` depois do `/check verify`; `Beta`/`GA` depois do `/test`) é o ponto sugerido para encerrar; `/sync` registra as convenções            |

- **Próximo passo** = a primeira caixa não marcada (sempre um comando ou um marco acompanhado).
- **needs a decision** = rode `/architect` primeiro; sem essa marca, vá direto ao `/develop`. A marca sai quando a spec é capturada.
- **Tarefas atômicas ficam na `## Build plan` da spec, não aqui**: o plano guarda só o resumo por marcos.
- **Status** `planned` → `in-progress` → `done`, mais `existing` (anterior ao workflow; `/develop` e `/sync` não mexem) e `dropped` (retirado do escopo, mantido para histórico).
- **Marca de abordagem** ao lado do título (ex.: `· Facade`) troca a abordagem só daquela funcionalidade; sem marca, herda o padrão.
- **Marca de nível** ao lado do título (ex.: `· GA`) define o rigor daquela funcionalidade acima ou abaixo do padrão; sem marca, herda. Ela decide as caixas de verificação e a próxima sugestão de cada skill.
- **Workflow** (linha do cabeçalho) é o padrão do projeto, o que roda depois do `/develop`: **Prototype** = nada além do autoteste do próprio `/develop`; **Alpha** = `/check verify`; **Beta** = `/check verify` e depois `/test`; **GA** = acrescenta `/check review` com modelo novo e depois `/document`. Funcionalidade construída sobre decisão ainda não ratificada (spec `Assumed`) fica sinalizada, mas isso nunca impede `done`.
- **Linha de ponteiro** (`spec <n> · code in <path>`): o link da spec vem do `/architect`, o caminho do código vem do `/develop`.
