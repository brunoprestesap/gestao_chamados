# 0002. Conversa e decisões da IA no banco: raciocínio e opções

Registro da decisão. O `/develop` não precisa deste arquivo; ele constrói pelo [index.md](index.md).

## Context

> ⚠️ Nota sobre a premissa: esta fundação é desenhada antes das telas que vão usá-la (funcionalidades 11, 12 e 13), então tipos de mensagem e conteúdo do cartão resumo ainda não existem de verdade. O risco é gravar um formato que a tela depois não usa. A saída adotada é deixar aberto só o que é de tela (o `tipo` da mensagem e o `payload` validado por schema) e fechar o que é de auditoria e métrica (a decisão e a correção), porque esse segundo grupo é o que a funcionalidade 18 vai medir e ninguém quer migrar depois. O tópico também junta duas coisas que poderiam ser specs separadas, a conversa e o registro das decisões, e elas ficam juntas de propósito: as duas se resolvem na mesma operação, a confirmação que cria o chamado.

O Sigma vai ganhar uma entrada por conversa: o solicitante relata o problema em texto livre, a IA local escolhe o serviço no catálogo, tira o local do texto e, mais adiante, define prioridade e técnico. Hoje o chamado nasce de um formulário, e tudo que existe no banco pressupõe que o chamado já existe: comentário, anexo e histórico são todos filhos de um `chamadoId` obrigatório. A conversa acontece antes disso, então não há onde guardá-la sem inventar um lugar novo.

Ao mesmo tempo, a liberação da IA será para todos de uma vez, e a autonomia (a IA definir prioridade e mandar direto ao técnico) só é liberada depois de medida. A medida principal é o percentual de chamados que ninguém precisou corrigir, por campo e por tipo de serviço. Isso só existe se, desde a primeira fatia, cada valor decidido pela IA e cada mudança humana ficarem gravados de forma comparável. Sem isso, a calibração da trava de confiança não tem base e a liberação vira aposta.

Três restrições do ambiente pesam mais que as outras. O MongoDB da VPS roda sozinho, sem replica set, então não existe transação entre coleções: criar o chamado e ligar a conversa são gravações separadas, e uma falha entre elas precisa ter conserto. O `ChamadoHistory` exige um usuário em toda entrada, e a IA não é um usuário do sistema. E o relato costuma ter dado pessoal (nome, telefone, sala), o que torna relevante o que fazer com uma conversa que o usuário começou e nunca confirmou, algo que hoje não existe em lugar nenhum do sistema.

Não decidir agora tem custo concreto: as funcionalidades 11, 12 e 13 precisam gravar mensagem e decisão para funcionar, e cada uma inventaria o seu formato. Quando a funcionalidade 18 fosse medir, mediria formatos diferentes, e a correção seria migração de dado de produção.

## Options considered

### Opção 1: conversa própria, mensagens em coleção separada, decisões por campo e leitura combinada

Três coleções novas. `Conversa` é do solicitante e existe antes do chamado; `ConversaMensagem` guarda cada mensagem; `DecisaoIa` guarda um documento por campo decidido, com valor, confiança, motivo, modelo e a lista de correções. Na confirmação, a conversa passa a pertencer ao chamado, com o id guardado nos dois lados. Depois da abertura nada é copiado: o que o solicitante escreve vira comentário, e a tela lê mensagens, comentários e histórico juntos.

**Pros**:

- A conversa existe antes do chamado sem poluir a coleção de chamados com rascunho.
- Métrica por campo sai de uma consulta simples, que é exatamente o que as funcionalidades 14, 17 e 18 pedem.
- Nada de texto duplicado, então comentário e histórico continuam sendo a fonte única depois da abertura.
- Rascunho pode expirar sozinho por TTL sem tocar em nada que pertença a um chamado.

**Cons**:

- Três coleções novas e uma leitura que junta três fontes em memória.
- A confirmação vira uma sequência de seis passos sem transação, com reparo próprio.

### Opção 2: conversa embutida no documento do chamado

Mensagens e decisões viram listas dentro do `Chamado`. Para existir antes da confirmação, o chamado nasceria em estado de rascunho e só depois receberia número e status `aberto`.

**Pros**:

- Nenhuma coleção nova, uma leitura só, e o vínculo é automático porque tudo é o mesmo documento.
- Sem costura entre coleções, portanto sem o problema da falta de transação.

**Cons**:

- Chamado rascunho contamina tudo que hoje lê chamado: listas, contagens, dashboards, IMR, monitor de SLA e o gerador de número. Cada consulta passaria a precisar de um filtro novo, e esquecer um vira erro de relatório contratual.
- O documento cresce a cada mensagem e a cada correção, e toda gravação reescreve a lista inteira, com risco em correções simultâneas.
- Apagar rascunho abandonado passa a ser apagar chamado, o que é um caminho que o sistema não tem nem deve ter.

### Opção 3: reaproveitar `ChamadoComment` como mensagem

O comentário passaria a aceitar `chamadoId` vazio, ganharia autor `ia` e um campo de conversa, e serviria tanto para o chat quanto para a comunicação com o técnico.

**Pros**:

- Nenhuma coleção nova de mensagem, e a tela do chat reusaria o que já existe.
- A comunicação com o técnico já estaria unificada por construção.

**Cons**:

- Quebra o invariante mais forte da coleção (todo comentário pertence a um chamado), e toda consulta, rota e teste de comentário passa a ter que tratar o caso vazio.
- Mistura rascunho descartável com registro de chamado, que é auditoria: o TTL do rascunho passaria a rondar a mesma coleção que guarda a comunicação oficial.
- O caminho de comentário carrega notificação, histórico e socket, coisas que uma mensagem de rascunho não deve disparar.

### Opção 4: conversa só na tela, nada no banco antes da confirmação

O relato e as perguntas da IA ficariam no navegador, e só o chamado final seria gravado.

**Pros**:

- Menos código, nenhuma coleção nova e nenhum dado pessoal guardado antes do pedido existir.
- Sem problema de vínculo, porque não há nada para ligar.

**Cons**:

- Recarregar a página perde o relato, e retomar depois é impossível, justamente na hora em que o usuário está descrevendo um problema.
- As sugestões feitas antes da confirmação somem, então a calibração perde o caso mais informativo: quando o usuário discordou do que a IA propôs.
- Não atende o que o escopo pede para esta funcionalidade, que é uma conversa existindo antes do chamado.

## Rationale

A Opção 1 é a única que respeita as três restrições do Context ao mesmo tempo. O rascunho precisa existir sem ser chamado, porque tudo que lê chamado no Sigma é código contratual (IMR, SLA, listas da gestão) e não vale arriscar cada uma dessas consultas por causa de um relato que talvez nem vire pedido. A Opção 2 tem a vantagem real de não ter costura, mas paga isso com risco espalhado por todo o sistema, e risco espalhado é pior que risco concentrado em uma função que dá para testar.

A falta de transação é o ponto delicado, e a resposta é fazer o chamado ser o ponto de virada. As decisões são gravadas antes dele, com o id que ele vai ter, então elas não existem para ninguém enquanto o chamado não existe. O `_id` reservado e o índice único em `conversaId` transformam a repetição em uma operação segura: seja clique duplo, seja repetição depois de falha, o resultado é um chamado só. O que sobra é reparo de etapas posteriores (histórico e vínculo), que é justamente a parte que não perde dado se demorar um pouco. Preferir isso a ligar replica set em produção é escolha consciente: a auditoria de 2026-05-25 já deixou pendências no MongoDB da VPS, e trocar o modo de execução do banco para ganhar transação em uma operação seria mexer no que está de pé para resolver um problema que dá para resolver com desenho.

Uma conferência independente da spec, feita antes de ela ser aceita, apertou justamente esses passos. A reserva passou a ser dita como uma única gravação condicional, e a gravação das decisões, o vínculo e o reparo passaram a casar pelo `chamadoIdReservado` esperado. Isso fecha dois buracos: duas confirmações ao mesmo tempo não seguem as duas, e um processo lento que ressurge depois de o reparo já ter agido desiste em vez de gravar por cima, o que evitaria o estado ilegal de conversa ligada ainda com prazo de expiração. Na mesma linha, erro de chave duplicada deixou de ser exceção solta: em `conversaId` vira o caminho de "já existia", em `ticket_number` vira nova tentativa, e o resto vira um motivo de falha comum. A alternativa seria confiar em try e catch genérico, que é onde esse tipo de bug costuma se esconder.

Decisão por campo, e não por chamada ao modelo, vem direto do que o escopo vai medir: acerto por campo, campos mais corrigidos, correção de prioridade com regra própria. Com um documento por campo, cada uma dessas perguntas é uma contagem; com um documento por chamada, todas viram desdobramento de subdocumento. A lista de correções, em vez de uma correção só, existe porque o caso de dois gestores mexendo no mesmo campo é real, e contar como erro da IA uma prioridade que voltou ao valor que ela sugeriu distorceria justamente a métrica que vai liberar a autonomia.

Dois pontos onde a escolha contraria uma regra geral, de propósito. Primeiro, guardamos valores derivados (`situacao` da decisão, `iaSituacao` do chamado, `mensagensCount`, `previa`), o que normalmente é evitado por ficar desatualizado: aqui eles existem para permitir filtro por índice nas listas da gestão e para aplicar o teto de mensagens de forma atômica, e o preço é a regra de que ninguém escreve nessas coleções sem passar por `lib/conversas/`. Segundo, os ganchos acoplam três ações centrais da gestão à IA: em troca, a fatia 1 já começa a gerar dado de acerto, e o acoplamento é limitado por uma regra dura, a de que a falha do gancho nunca pode derrubar a triagem, que é o que o contrato exige que funcione.

Sobre testes: o projeto testa Server Actions com o banco trocado por mocks, e isso não prova índice único, TTL nem correção simultânea, que são exatamente os mecanismos em que esta decisão se apoia. Um MongoDB em container ligado por variável de ambiente segue o padrão que a spec 0001 já usou com o teste de fumaça (roda quando a variável existe, é pulado quando não existe) e evita a alternativa comum, o banco na memória, que baixa binário na primeira execução e tende a travar na rede do tribunal e no runner da VPS.

## Evidências do código atual

Levantado durante o desenho, em 2026-09-17, e usado nas decisões acima:

- `docker-compose.yml` sobe `mongo:7` sem `--replSet`, e não há nenhum uso de `startSession` ou `withTransaction` em `app/` ou `lib/`: não existe transação entre coleções hoje.
- `models/ChamadoHistory.ts` exige `userId`, e os leitores (`app/api/chamados/[id]/history`, `app/api/gestao/chamados/[id]/assignment-history` e `HistoryTimeline.tsx`) buscam o nome do usuário por id, um por entrada.
- `app/(dashboard)/meus-chamados/actions.ts`: `createTicketAction` gera o número com `generateTicketNumber()`, cria o chamado, grava o histórico `abertura` e notifica gestores, tudo em sequência e sem transação. `addCommentAction` faz comentário, histórico, notificação e emissão para o socket no mesmo lugar, o que justifica extrair um núcleo compartilhado.
- `app/(dashboard)/gestao/actions.ts`: `classificarChamadoAction` grava serviço, prioridade e o snapshot de SLA de uma vez e só aceita chamado `aberto`; `assignTicketAction` e `reassignTicketAction` mexem no técnico; `updateTicketCatalogAction` só age em chamado validado e sem serviço, por isso não precisa de gancho.
- `models/LlmCall.ts` e `lib/llm/types.ts`: o registro é gravado uma vez, sem esperar, expira em 365 dias e tem `refType` e `refId` livres. O `LlmMeta` devolvido a quem chama não traz o id do registro, o que motivou o `callId`.
- `spec 0001`, seção Data model: já previa que "a funcionalidade 10 decide o que aponta para a conversa", ou seja, o valor de `refType` e `refId`.
- `package.json`: não há `mongodb-memory-server` nem qualquer apoio de banco real em teste; os testes atuais trocam `@/lib/db` e os modelos por mocks.
