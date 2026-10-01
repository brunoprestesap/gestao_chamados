# Scope: Sigma

Sigma é o sistema de chamados de manutenção (predial, ar condicionado, elevador) usado pelos servidores, com triagem pelo Preposto, técnicos por especialidade e SLA contratual.
Esta passada planeja a abertura de chamados por conversa: o solicitante relata o problema em linguagem natural e a IA local (vLLM com Qwen, na rede interna) escolhe o serviço, define a urgência e encaminha a um técnico. A liberação será para todos de uma vez, por isso a trava de confiança é calibrada antes de a IA decidir sozinha.

**Build approach:** Tracer Bullet (fatias verticais: cada fatia funciona de ponta a ponta antes de a próxima engrossar o fio).
**Workflow:** Beta (depois do `/develop`: `/check verify`, depois `/test`). É o nível padrão de rigor do projeto. O `/architect` é a primeira parada recomendada para funcionalidade com decisão real, mas você pode pular quando já souber como construir. Qualquer funcionalidade pode ter sua própria marca (ex.: `· GA`) para fazer mais ou menos.

_São recomendações para manter a construção organizada, não obrigações. Pule o que não servir: se você já sabe como construir uma funcionalidade, use `/develop` e pule o `/architect`. Você decide quando uma funcionalidade está `done`._

## At a glance

| #   | Feature                                            | Phase         | Status      |
| --- | -------------------------------------------------- | ------------- | ----------- |
| 1   | Autenticação LDAP e perfis                         | Contexto      | existing    |
| 2   | Unidades e usuários                                | Contexto      | existing    |
| 3   | Catálogo de serviços                               | Contexto      | existing    |
| 4   | Abertura de chamado por formulário                 | Contexto      | existing    |
| 5   | Triagem, classificação e atribuição pelo Preposto  | Contexto      | existing    |
| 6   | Detalhe do chamado: comentários, histórico, anexos | Contexto      | existing    |
| 7   | SLA, expediente e pausas                           | Contexto      | existing    |
| 8   | Notificações em tempo real                         | Contexto      | existing    |
| 9   | Integração com a IA local                          | Foundation    | done        |
| 10  | Conversa e decisões da IA no banco                 | Foundation    | done        |
| 11  | Tela de chat de chamados                           | Slice 1       | done        |
| 12  | Abertura do chamado pela IA                        | Slice 1       | done        |
| 13  | Andamento e conversa com o técnico                 | Slice 2       | done        |
| 14  | Calibração da trava de confiança                   | Slice 3       | done        |
| 15  | Prioridade e SLA automáticos                       | Slice 3       | done        |
| 16  | Atribuição automática ao técnico                   | Slice 3       | done        |
| 17  | Revisão das decisões da IA pelo Preposto           | Slice 3       | in-progress |
| 18  | Painel de acurácia da IA                           | Slice 3       | planned     |
| 19  | Fotos no chat                                      | Slice 4       | planned     |
| 20  | Aviso de chamado duplicado                         | Slice 4       | planned     |
| 21  | Entrada por voz                                    | Slice 4       | planned     |
| 22  | Prazo para avaliar e encerramento definitivo       | Ciclo de vida | in-progress |
| 23  | Gestão de ativos: cadastro, etiqueta e vínculo     | Ativos        | done        |
| 24  | Importador SICAM e vistoria em campo               | Ativos        | planned     |
| 25  | Documentos do ativo e preventiva por categoria     | Ativos        | planned     |
| 26  | Ativo pela IA no chat e indicadores no IMR         | Ativos        | planned     |

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

### 13. Andamento e conversa com o técnico · done

A mesma conversa acompanha o chamado até o fim: cada mudança aparece como mensagem em tempo real, e o que o usuário escreve vira comentário que o técnico vê. A spec ampliou o alcance para os quatro perfis (solicitante, técnico, Preposto, Admin) escreverem pela mesma tela `/conversas/[id]`, não só o solicitante.
**Done when:** classificação, atribuição, início, pausa, conclusão e encerramento aparecem na conversa sem recarregar a página; mensagens de qualquer um dos quatro perfis viram comentário do chamado e aparecem ao vivo para quem mais estiver na mesma conversa; a avaliação de 1 a 5 pode ser feita pela conversa quando o chamado fecha.
spec [0005](../specs/0005-andamento-conversa-tecnico/index.md) · code in `app/(dashboard)/conversas/`, `app/api/conversas/chamado/`, `components/realtime/RealtimeProvider.tsx`, `lib/chamados/comentarios.ts`, `lib/conversas/linha-do-tempo.ts`, `app/(dashboard)/gestao/actions.ts`

- [x] Design it (spec): `/architect andamento e conversa com o técnico`
- [x] Build it: `/develop andamento e conversa com o técnico`
  - [x] Sinal ao vivo das seis mudanças de status (emissão de classificação, segundo destinatário da atribuição, manipuladores novos no `RealtimeProvider`) · AC-1, AC-2, AC-3, AC-4, AC-5
  - [x] Escrever pela conversa (rota de comentário nova, caixa de envio do solicitante, do técnico e da gestão) · AC-5, AC-6, AC-7, AC-9
  - [x] Lateral por perfil e avaliação na conversa · AC-8, AC-10
  - [x] Conferência de permissão ponta a ponta para os quatro perfis · AC-11
- [x] Verify it: `/check verify andamento e conversa com o técnico`
- [x] Test it: `/test andamento e conversa com o técnico`

## Slice 3: IA decide prioridade e técnico

### 14. Calibração da trava de confiança · done

Como a liberação é para todos de uma vez, a IA é medida contra chamados que os Prepostos já classificaram antes de decidir sozinha, e o limite de confiança sai dessa medição.
**Done when:** o acerto da IA em serviço e prioridade é medido sobre chamados históricos; o limite de confiança é definido a partir disso e o Admin pode ajustá-lo; o Admin desliga a autonomia sem deploy e tudo volta para a triagem manual.
spec [0006](../specs/0006-calibracao-trava-confianca/index.md) · code in `lib/ia-confianca/`, `models/IaAutonomiaConfig.ts`, `app/(dashboard)/configuracoes/ia-confianca/`

- [x] Design it (spec): `/architect calibração da trava de confiança`
- [x] Build it: `/develop calibração da trava de confiança`
  - [x] Configuração de ponta a ponta: `IaAutonomiaConfig`, `lib/ia-confianca/calibragem.ts` lendo o veredito já gravado em `DecisaoIa.situacao`, tela e formulário salvando · AC-1, AC-5, AC-6, AC-8, AC-9, AC-10
  - [x] Relatório completo: tabela de cortes de confiança, sugestão automática respeitando a meta e a amostra mínima, aviso de viés no serviço, conferência de que nada mais lê a config ainda · AC-2, AC-3, AC-4, AC-7, AC-11
- [x] Verify it: `/check verify calibração da trava de confiança`
- [x] Test it: `/test calibração da trava de confiança`

### 15. Prioridade e SLA automáticos · done · GA

Quando confiante, a IA define a prioridade (BAIXA a EMERGENCIAL), o chamado passa a `validado` e o SLA começa igual à classificação manual. Abaixo do limite, fica na triagem com a sugestão. Mexe em prazo contratual e glosa do IMR, por isso GA.
**Done when:** chamado confiante vira `validado` com snapshot de SLA idêntico ao da classificação manual; chamado com pouca confiança fica `aberto` com a sugestão já preenchida; pedir urgência no texto sem motivo real não eleva a prioridade sozinho; decisão, motivo e confiança ficam no histórico.
spec [0007](../specs/0007-prioridade-sla-automaticos/index.md) · code in `lib/assistente/confirmar.ts`, `lib/assistente/portao.ts`, `lib/sla-snapshot.ts`, `lib/conversas/abertura.ts`, `app/(dashboard)/gestao/actions.ts`, `app/(dashboard)/gestao/_components/CorrigirPrioridadeDialog.tsx`

- [x] Design it (spec): `/architect prioridade e SLA automáticos`
- [x] Build it: `/develop prioridade e SLA automáticos`
  - [x] Fio fino do caminho confiante, ponta a ponta: extrai o cálculo de SLA para reaproveitar, reforça o prompt contra urgência sem motivo, portão de confiança, `confirmarAbertura` decide status/SLA/efeito, histórico e evento de validação automática, migração que desliga `autonomiaAtiva` · AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-10, AC-16, AC-17
  - [x] Visibilidade e cópia: aviso de viés também em prioridade, sugestão pré-preenchida na classificação, selo de validado pela IA, texto de notificação e de chat variando por status · AC-8, AC-9, AC-13, AC-14, AC-15
  - [x] Correção mínima: ação e diálogo para o Preposto trocar a prioridade de um chamado validado ainda não atribuído · AC-11, AC-12
- [x] Verify it: `/check verify prioridade e SLA automáticos`
- [x] Test it: `/test prioridade e SLA automáticos`
- [x] Review it (fresh model): `/check review prioridade e SLA automáticos`
- [x] Document it: `/document prioridade e SLA automáticos`

### 16. Atribuição automática ao técnico · done · GA

Chamado validado pela IA segue direto para um técnico com a especialidade do serviço e espaço na carga, sem esperar o Preposto. Mexe no SLA de resposta contratual e atribui trabalho a pessoas sozinha, por isso GA.
**Done when:** o técnico escolhido tem a especialidade (subtipo) do serviço e está abaixo do seu limite de chamados; sem técnico elegível, o chamado vai ao Preposto com o motivo; o técnico recebe a notificação de sempre e a atribuição aparece na conversa do solicitante.
spec [0008](../specs/0008-atribuicao-automatica-tecnico/index.md) · code in `lib/chamados/atribuicao-automatica.ts`, `lib/chamados/atribuicao-criterio.ts`, `lib/chamados/notificar-atribuicao.ts`, `lib/assistente/confirmar.ts`, `shared/chamados/atribuicao-automatica.constants.ts`, `app/(dashboard)/gestao/`, `app/(dashboard)/configuracoes/ia-confianca/`

- [x] Design it (spec): `/architect atribuição automática ao técnico`
- [x] Build it: `/develop atribuição automática ao técnico`
  - [x] Fio fino do caminho feliz, ponta a ponta (constantes, interruptor `atribuicaoAutomaticaAtiva`, campo `atribuicaoAutomatica`, `notificarAtribuicao` extraída, critério puro, `tentarAtribuicaoAutomatica`, chamada em `confirmarAbertura`, teste contra Mongo) · AC-1, AC-2, AC-5, AC-6, AC-9, AC-10, AC-11, AC-12, AC-14
  - [x] Falhas, concorrência e idempotência (sem técnico, erro, conferência de carga com desfazer, corrida com a atribuição manual, log) · AC-3, AC-4, AC-7, AC-8, AC-17
  - [x] Gestores, técnico e solicitante veem o resultado (`ticket:new` por resultado, aviso do técnico, detalhe e selo na Gestão, teste de vazamento) · AC-11, AC-12, AC-13, AC-15, AC-16
  - [x] Regressão e limitações (atribuição manual e calibração intactas, correção pela reatribuição, janela de prioridade fechada) · AC-9, AC-18, AC-19
- [x] Verify it: `/check verify atribuição automática ao técnico`
- [x] Test it: `/test atribuição automática ao técnico`
- [x] Review it (fresh model): `/check review atribuição automática ao técnico`
- [x] Document it: `/document atribuição automática ao técnico`

### 17. Revisão das decisões da IA pelo Preposto · in-progress · GA

Na Gestão, o Preposto separa o que a IA decidiu do que aguarda triagem e corrige serviço, prioridade ou técnico quando precisar. Cada correção alimenta a métrica principal. Mexe em prazo contratual e glosa do IMR (a regra de SLA para corrigir a prioridade com o atendimento em curso), por isso GA.
**Done when:** o Preposto filtra chamados decididos pela IA e pendentes de triagem; os pendentes abrem com a sugestão da IA já preenchida; corrigir registra o que mudou; corrigir a prioridade de um chamado com SLA já iniciado segue uma regra definida e registrada.
spec [0009](../specs/0009-revisao-decisoes-ia-preposto/index.md) · code in `app/(dashboard)/gestao/`, `lib/conversas/decisoes.ts`

- [x] Design it (spec): `/architect revisão das decisões da IA pelo Preposto`
- [x] Build it: `/develop revisão das decisões da IA pelo Preposto`
  - [x] Revisar de ponta a ponta (filtro "Revisão da IA", painel por campo, confirmar, visibilidade da trilha e índice) · AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-13, AC-17, AC-19
  - [x] Correção de prioridade com o atendimento em curso (regra de SLA assimétrica, só o Admin baixa com técnico, monitor de SLA, diálogo) · AC-7, AC-8, AC-9, AC-10, AC-16, AC-20, AC-21
  - [x] Correção de serviço (ação, técnico elegível pelo serviço novo, `tipoServico`, diálogo) · AC-11, AC-12
  - [x] Avisos e regressão (`ticket:corrected`, reatribuição avisa o técnico novo, vazamento do motivo, calibração e atribuição intactas) · AC-14, AC-15, AC-18
- [x] Verify it: `/check verify revisão das decisões da IA pelo Preposto`
- [x] Test it: `/test revisão das decisões da IA pelo Preposto`
- [x] Review it (fresh model): `/check review revisão das decisões da IA pelo Preposto`
- [ ] Document it: `/document revisão das decisões da IA pelo Preposto`

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

## Ciclo de vida do chamado

### 22. Prazo para avaliar e encerramento definitivo · in-progress · GA

Pedido de stakeholder (modelo do e-SOSTI): depois da conclusão, o solicitante tem um prazo para avaliar ou recusar; passado o prazo o chamado encerra sozinho e não reabre mais, e o problema que volta vira chamado novo ligado ao anterior. Mexe no tempo de atendimento e no SLA medidos pelo IMR (glosa), por isso GA.
**Done when:** a conclusão grava o prazo (48 horas, configurável pelo Admin); avaliar encerra na hora; o cron encerra o que venceu; nenhum perfil reabre um encerrado; o encerramento manual sai da Gestão; "O problema voltou" abre um chamado novo com o vínculo visível.
spec [0010](../specs/0010-prazo-avaliacao-encerramento-definitivo/index.md) · code in `app/(dashboard)/meus-chamados/`, `app/(dashboard)/gestao/`, `app/(dashboard)/chamados-atribuidos/actions.ts`, `app/(dashboard)/conversas/`, `app/api/cron/encerramento-automatico/`, `lib/chamados/encerramento-automatico.ts`, `shared/chamados/janela-avaliacao.ts`, `models/Chamado.ts`

- [x] Design it (spec): `/architect prazo para avaliar e encerramento definitivo`
- [x] Build it: `/develop prazo para avaliar e encerramento definitivo`
  - [x] O fio: concluir grava o prazo, avaliar encerra, e o detalhe do solicitante mostra o prazo · AC-1, AC-2, AC-5, AC-10
  - [x] As travas: recusa e reabertura só na janela, encerrado terminal, encerramento manual removido · AC-3, AC-4, AC-5, AC-8
  - [x] Encerramento pelo sistema: cron, preenchimento do legado, crontab num bloco só, `ticket:closed` para o solicitante · AC-6, AC-7, AC-9b
  - [x] Configuração e aviso: prazo em `/configuracoes/expediente`, aviso de conclusão com o prazo · AC-9, AC-13
  - [x] Reincidência e demais telas: "O problema voltou", vínculo, dica de recorrência, chat, cards e painéis · AC-11, AC-12, AC-14, AC-15, AC-16
- [x] Verify it: `/check verify prazo para avaliar e encerramento definitivo`
- [x] Test it: `/test prazo para avaliar e encerramento definitivo`
- [x] Review it (fresh model): `/check review prazo para avaliar e encerramento definitivo`
- [ ] Document it: `/document prazo para avaliar e encerramento definitivo`

## Gestão de ativos

Proposta completa em `docs/0009 — Gestão de Ativos.md`. Cada fatia da proposta vira uma funcionalidade.

### 23. Gestão de ativos: cadastro, etiqueta e vínculo · done

O chamado passa a apontar para o equipamento: árvore de locais, categorias, ativo, carga dos 108 do Tier A, leitura de etiqueta e vínculo no formulário e na gestão.
**Done when:** os 108 ativos estão carregados; ler ou digitar o tombamento abre a ficha; dá para abrir chamado a partir dela, e o chamado aparece no histórico da ficha; a gestão vincula ou corrige o ativo de qualquer chamado aberto.
spec [0011](../specs/0011-gestao-ativos/index.md) · code in `lib/ativos/`, `app/(dashboard)/ativos/`, `models/Ativo.ts`

- [x] Design it (spec): `/architect gestão de ativos fatia 1`
- [x] Build it: `/develop gestão de ativos fatia 1`
  - [x] O fio: modelos, carga do Tier A, leitura digitada, ficha e chamado com ativo · AC-4, AC-8, AC-9, AC-11, AC-13, AC-14, AC-15
  - [x] Cadastro de verdade: árvore de locais, categorias, CRUD do ativo, status e validação · AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
  - [x] Uso diário: lista com filtros, câmera, atalho de cadastro e vínculo na gestão · AC-10, AC-11, AC-12, AC-16
  - [x] Testes de banco real, de permissão e E2E do fio · AC-2, AC-4, AC-5, AC-17
- [x] Verify it: `/check verify gestão de ativos fatia 1`
- [x] Test it: `/test gestão de ativos fatia 1`

### 24. Importador SICAM e vistoria em campo · needs a decision

Importar o CSV bruto do SICAM com diferença e revisão, e conduzir a vistoria pelo celular, inclusive sem sinal. from spec 0011
**Done when:** o Admin sobe o CSV, revisa novos, alterados e sumidos e aplica; a vistoria mostra cobertura por prédio; o cadastro em campo funciona offline e sincroniza; os ativos `MNT-` (elevador, QGBT, SPDA, hidrante) estão cadastrados.

- [ ] Design it (spec): `/architect importador SICAM e vistoria`

### 25. Documentos do ativo e preventiva por categoria · needs a decision

Laudos e certificados com alerta de vencimento, e chamados preventivos gerados por ativo. from spec 0011
**Done when:** PMOC, AVCB, ART e laudos têm validade e alerta em 90, 60 e 30 dias; o recorrente por categoria gera um chamado por ativo em operação.

- [ ] Design it (spec): `/architect documentos e preventiva por ativo`

### 26. Ativo pela IA no chat e indicadores no IMR · needs a decision

A IA reconhece o equipamento na conversa, e o IMR ganha MTBF, MTTR, reincidência e os ativos mais problemáticos. from spec 0011
**Done when:** a conversa sugere o ativo (ou pede a escolha entre candidatos) sem passar pelo portão de confiança; o IMR mostra os indicadores de ativo como informativos.

- [ ] Design it (spec): `/architect ativo no chat e indicadores`

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
- **Leitor de tela de verdade no AC-18**: o `/check verify` da 0004 conferiu a região ao vivo programaticamente (o texto que ela recebe bate com o esperado), mas sem NVDA ou outro leitor de tela instalado nesta máquina para ouvir o anúncio de verdade; rodar quando houver um leitor de tela disponível · from spec 0004
- **Cotação, observação de material e pausa por terceiros na conversa**: hoje ficam fora do sinal ao vivo de `/conversas`; considerar se a gestão sentir falta · from spec 0005
- **Aviso de reatribuição de técnico**: `reatribuicao_tecnico` não emite nenhum evento hoje; se o solicitante precisar saber quando o técnico muda, cobrir numa fatia futura · from spec 0005
- **Viés de concordância no acerto de serviço**: o Preposto vê a sugestão de serviço pré preenchida na classificação, então o número medido mede concordância, não um julgamento independente; considerar esconder a sugestão também na classificação se o viés atrapalhar a calibração · from spec 0006
- **Unificar a escolha de técnico manual e automática**: `findBestTechnician`, as duas rotas `eligible-technicians` e as cópias à mão de `ACTIVE_STATUSES` passam a usar o critério novo (desempate justo) e `CHAMADO_STATUS_CARGA_TECNICO` · from spec 0008
- **Nova tentativa de atribuição automática**: reavaliar chamados `sem_tecnico` quando um técnico libera vaga (ao concluir ou encerrar um chamado, ou pelo cron de 30 minutos) se o volume mostrar espera demais · from spec 0008
- **Reprocessamento retroativo pra calibração**: se o volume de chamados pelo chat crescer devagar, considerar rodar a IA contra chamados antigos do formulário pra engordar a amostra de acurácia, custeando as chamadas extras ao vLLM · from spec 0006
- **Desatribuir chamado e avisar o técnico anterior**: sem "desatribuir", um chamado com serviço errado, técnico sem a especialidade e nenhum outro elegível não tem saída; e o técnico que perde um chamado numa reatribuição continua sem aviso · from spec 0009
- **Reconciliar decisão divergente**: chamado corrigido cuja `DecisaoIa` ficou `sem_revisao` (falha entre os dois passos, sem transação); hoje o painel avisa e a confirmação é recusada, falta uma ação "registrar a correção já feita" · from spec 0009
- **`classificationNotes` chega ao solicitante**: `/api/meus-chamados` devolve as observações da classificação manual do Preposto; decidir se isso é aceitável (a 0009 só fecha o vazamento do motivo das correções) · from spec 0009
- **Contadores no controle "Revisão da IA"**: mostrar quantos chamados há em cada recorte, se a fila ficar grande · from spec 0009

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
