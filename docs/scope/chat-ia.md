# Escopo: Chat e IA

Parte do escopo do Sigma. Tabela geral, Deferred e legenda em [index.md](index.md).

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

### 17. Revisão das decisões da IA pelo Preposto · done · GA

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
- [x] Document it: `/document revisão das decisões da IA pelo Preposto` · pulado

## Slice 3: fechamento

### 18. Painel de acurácia da IA · needs a decision

Visão do Admin sobre a qualidade da IA, base para ajustar a trava de confiança.
**Done when:** o Admin vê o percentual de chamados sem correção humana (a métrica principal) por período e por tipo de serviço; vê quais campos são mais corrigidos, quantos chamados caíram na triagem manual e quantas vezes a IA falhou.

- [ ] Design it (spec): `/architect painel de acurácia da IA`

## Slice 4: Extras da conversa

### 19. Fotos no chat · needs a decision

Anexar fotos do problema durante o relato, reaproveitando os anexos que já existem.
**Done when:** o usuário anexa fotos antes de confirmar e elas ficam no chamado criado; fotos enviadas depois da abertura também entram; o técnico vê as fotos como qualquer anexo.

- [ ] Design it (spec): `/architect fotos no chat`

### 20. Aviso de chamado duplicado · done

Antes de confirmar, a IA procura chamado em andamento parecido no mesmo local e oferece acompanhar aquele em vez de abrir outro.
**Done when:** um relato parecido com chamado em andamento no mesmo local mostra o aviso; o usuário pode acompanhar o existente ou abrir mesmo assim, sem ver dados pessoais de outro solicitante; o aviso nunca impede a abertura.
spec [0017](../specs/0017-aviso-chamado-duplicado/index.md) · code in `lib/assistente/duplicados.ts`, `lib/chamados/interessados.ts`, `models/ChamadoInteressado.ts`, `app/(dashboard)/conversas/_lib/acompanhar.ts`, `app/(dashboard)/conversas/_components/AvisoDuplicados.tsx`

- [x] Design it (spec): `/architect aviso de chamado duplicado`
- [x] Build it: `/develop aviso de chamado duplicado`
  - [x] O aviso de ponta a ponta: busca por regra, bloco no cartão, abrir mesmo assim marcado e "possível duplicado" na gestão · AC-1 a AC-8, AC-12, AC-13, AC-20, AC-21
  - [x] Acompanhar: `ChamadoInteressado`, ação com as conferências e a corrida, vista só de leitura, lateral e deixar de acompanhar · AC-9, AC-10, AC-11, AC-14, AC-15, AC-16
  - [x] Fim e visibilidade: aviso `interesse:fim` no sino, reaberturas, contagem e nomes para a gestão · AC-17, AC-18, AC-19
  - [x] Local escondido continua escondido: `localVisivel` gravado no clique e lido na vista e na lateral (revisão de 2026-10-07) · AC-9, AC-14, AC-15
- [x] Verify it: `/check verify aviso de chamado duplicado`
- [x] Test it: `/test aviso de chamado duplicado`

### 21. Entrada por voz · needs a decision

Ditar o problema em vez de digitar, com a transcrição acontecendo dentro da rede interna.
**Done when:** o usuário grava, vê o texto transcrito e pode editar antes de enviar; o áudio não sai da rede interna; sem microfone ou sem permissão, digitar continua funcionando.

- [ ] Design it (spec): `/architect entrada por voz`
