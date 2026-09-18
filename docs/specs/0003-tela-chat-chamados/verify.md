# Verify: tela de conversas de chamados · spec 0003 · updated 2026-09-18

_Passos derivados dos critérios de aceite da spec 0003 e da tabela `Value sourcing`. O `/check verify` roda estes passos; o `/test` tranca os duráveis._

> **Rodada de 18/09/2026, terceira passada (`/check verify`): passou.** Checklist inteiro rodado de novo,
> não só o passo que o `/debug` tinha consertado.
> Marcado `[x]` = rodado e aprovado. Continua `[ ]` = falhou, ou não deu para rodar.
>
> O que mudou nesta passada, em relação à segunda:
>
> - O login do `admin` completou normalmente, então os quatro perfis foram conferidos na sidebar.
> - Os seis caminhos de falha da IA (AC-7) foram provocados de verdade, com o servidor reiniciado sem as
>   variáveis `LLM_*`, com `LLM_ENABLED=false` e apontando para um vLLM de mentira (objeto reprovado pelo
>   schema, servidor fora do ar, prazo estourado e disjuntor aberto).
> - O AC-5b foi reproduzido pelos dois caminhos: descarte noutra aba (a resposta e o aviso continuavam na
>   tela 16 segundos depois) e teto de 30 estourado por uma segunda aba.
> - O AC-13 mediu a rajada: quatro eventos em 90ms viraram uma única recarga, 809ms depois do último.
>
> Ainda em aberto, e por quê:
>
> - A saudação `Olá` sem nome não acontece em execução: o NextAuth preenche `session.user.name` com o
>   `username` quando o AD não manda nome, então a metade sem nome do passo é defesa em código, coberta
>   por teste unitário, e não dá para reproduzir com login de verdade.
> - O log da VPS não foi lido: exige acesso à produção e um envio real lá, que não cabe num verify local.
>
> Fora do escopo desta fatia, mas visto de novo na rodada, tudo em `components/dashboard/dashboard-shell.tsx`:
> o sino de notificações mede 36 por 36 pixels (AC-8 pede 44) e o número dentro dele fica em 2,87 para 1 de
> contraste na aparência escura (AC-8 pede 4,5). Na aparência clara, quatro textos da barra lateral do painel
> (`Gestão de Chamados`, `Principal`, a inicial do avatar e o rótulo do perfil) ficam entre 2,77 e 4,44 para 1.
> Nada disso é desta fatia: o conteúdo de `/conversas` passa nas duas aparências.

Antes de começar: suba o Next (`npm run dev`) e o socket (`npm run socket:dev`, necessário só para o passo de tempo real). Entre como **Solicitante**, que é o perfil da tela.

## UI / manual

### Entrada e lateral

- [x] Entrar com cada um dos quatro perfis → `Conversas` aparece no grupo Principal da sidebar em todos → AC-1
      _(os quatro entraram nesta rodada, inclusive o `admin`, que da outra vez não completava)_
- [x] Abrir `/conversas` → a lateral já vem preenchida na primeira pintura, sem piscar estado de carregamento (desligue o JavaScript ou olhe o HTML da resposta) → AC-1
- [x] Usuário sem rascunho e sem chamado → a lateral mostra o estado vazio explicando o que fazer, não um espaço em branco → AC-2
- [x] Usuário com rascunho e chamados → a lateral mostra dois blocos, `Rascunhos` em cima e `Chamados` embaixo → AC-2
- [x] Usuário com mais de 20 chamados → `Carregar mais` aparece, traz os 20 seguintes e não repete nenhum → AC-2
- [x] Dois chamados com o mesmo `updatedAt` na virada da página → nenhum dos dois some nem aparece duas vezes (cursor composto) → AC-2
- [x] Linha de chamado com técnico e situação `em atendimento` → a linha de apoio traz `#<número> · <primeiro nome> está atendendo`; sem técnico, traz só o número → AC-2
- [x] Rascunho com confirmação em andamento → a marca mostra `Confirmando` → AC-2
- [x] Clicar em qualquer linha → abre o endereço que o servidor calculou: `/conversas/<conversaId>` quando há conversa, `/conversas/<chamadoId>` quando não há → AC-10

### Conversa nova

- [x] `Nova conversa` → abre boas vindas com saudação, três exemplos e a caixa em foco; conferir no Mongo que **nenhuma** conversa foi criada → AC-3
- [ ] Usuário com nome no perfil → a saudação traz o primeiro nome; usuário sem nome → a saudação é só `Olá` → AC-3
      _(a metade com nome passou, `Olá, Solicitante`. A outra metade não acontece em execução: com um usuário criado sem `name` no banco, a saudação saiu `Olá, semnomeverify`, porque o NextAuth cai no `username`. O caminho `Olá` sozinho é defesa em código, coberta por teste unitário.)_
- [x] Clicar num exemplo → o texto entra na caixa e o foco volta para ela, sem enviar sozinho → AC-3
- [x] Enviar a primeira mensagem → a mensagem aparece na hora, o texto do assistente cresce aos poucos e o aviso `O assistente está respondendo` fica à vista → AC-4, AC-5
- [x] Terminado o envio → a URL vira `/conversas/<id>`, o rascunho aparece na lateral e o Mongo tem uma `Conversa` com duas `ConversaMensagem` (autor `solicitante` e autor `ia`) → AC-3, AC-5
- [x] Na mensagem de autor `ia` → `llmCallId` bate com o `_id` do `LlmCall` daquela chamada → AC-5
- [x] Nenhuma `ConversaMensagem` guarda texto parcial: só o objeto final aprovado pelo schema vira mensagem → AC-5
- [x] Com 5 rascunhos ativos, tentar a primeira mensagem de um sexto → a tela explica o limite de 5 em português; conferir no Mongo que nada foi criado → AC-3, AC-9
- [x] Forçar falha na gravação da primeira mensagem → conferir no Mongo que **não sobrou conversa vazia**: o rascunho recém criado foi descartado → AC-3

### Conversa que continua

- [x] Enviar a segunda mensagem → a requisição vai para `POST /api/conversas/[id]/mensagens` (aba Rede), nunca para a rota sem id → AC-4
- [x] Cortar a rede e enviar → a mensagem fica marcada como não enviada, com o texto preservado e o botão `Tentar de novo` → AC-4
- [x] Voltar a rede e clicar `Tentar de novo` → a mensagem entra; conferir no Mongo que **não nasceu um segundo rascunho** → AC-4
- [x] Recarregar uma conversa cuja última mensagem é do solicitante → nenhuma chamada ao modelo dispara sozinha (conferir que não surge `LlmCall` novo) → AC-5
- [x] Digitar → o contador de caracteres anda contra 2.000; passar de 2.000 → o envio é barrado e a borda muda → AC-9
- [x] Chegar a 30 mensagens no rascunho → a caixa dá lugar ao aviso de limite com o link do formulário → AC-9
- [x] Provocar cada motivo de falha (`nao_encontrada`, `sem_permissao`, `limite_rascunhos`, `limite_mensagens`, `confirmacao_em_andamento`, `invalida`, `erro`) → cada um mostra uma frase própria em português; nenhum motivo cru aparece na tela → AC-9
      _(cinco vistos na tela: `confirmacao_em_andamento`, `limite_rascunhos`, `limite_mensagens`, `nao_encontrada` (descarte noutra aba) e `erro` (índice único temporário no Mongo derrubando a gravação). `invalida` e `sem_permissao` só existem na API, de propósito: a caixa barra texto vazio e acima de 2.000 antes de enviar, e `sem_permissao` sai como `nao_encontrada` para não revelar conversa de terceiro. Os dois foram provocados na API: 400 e 404 com o motivo em JSON. Nenhum motivo cru apareceu na tela.)_
- [x] `Descartar` → pede confirmação; confirmando, a conversa e as mensagens somem do Mongo e a tela volta para a lista → AC-12
- [x] Descartar um rascunho com confirmação em andamento → falha com a frase própria e a tela continua onde está → AC-12

### Falha da IA

- [x] `LLM_ENABLED=false` e enviar → a conversa ganha mensagem de autor `sistema` com texto do Sigma (nunca texto do modelo), o link do formulário aparece e nenhuma exceção sobe; o relato continua gravado → AC-7
- [x] Sem as variáveis `LLM_*` → mesmo comportamento → AC-7
      _(Next reiniciado com `LLM_BASE_URL`, `LLM_API_KEY` e `LLM_MODEL` vazias: quadro `reserva` com motivo `disabled` e o mesmo texto do Sigma, gravado como mensagem de `sistema` e ainda lá no recarregamento)_
- [x] vLLM fora do ar, prazo estourado e disjuntor aberto → cada um vira mensagem de reserva com a frase daquele motivo → AC-7
      _(Next apontado para um vLLM de mentira. Servidor derrubado: três envios com `unavailable`; o quarto veio `circuit_open` (`O assistente está fora do ar e vai voltar em instantes`). Servidor de volta em modo travado, sem mandar o primeiro pedaço: `timeout` em 20s, com `O assistente demorou demais para responder`.)_
- [x] Objeto final reprovado pelo schema Zod → o texto parcial que estava na tela é trocado pela mensagem de reserva → AC-7
      _(vLLM de mentira transmitindo um texto acima dos 600 do schema: o parcial apareceu na tela em t=308ms e em t=1529ms deu lugar à mensagem `O assistente respondeu de um jeito que o Sigma não entendeu`)_
- [x] Descartar o rascunho noutra aba enquanto a resposta é transmitida → o quadro `fim` vem com `mensagemId: null`, a tela mostra a resposta com o aviso de que ela não fica salva, e o servidor registra o motivo em log → AC-5b
      _Consertado e reproduzido pelo `/debug` em 18/09/2026: a resposta e o aviso aparecem em t=1804ms e continuam na tela 16 segundos depois, sem virar 404. Antes o `router.refresh()` de `PainelConversa.aoConcluir` derrubava tudo em t=1902ms._
- [x] Duas abas na mesma conversa, a segunda passando de 30 no meio → a resposta aparece com o mesmo aviso, sem exceção → AC-5b, AC-9
- [x] Nenhuma linha de log traz texto de relato: só `conversaId`, motivo e duração → AC-7

### Chamado em modo leitura

- [x] Abrir um chamado pela lateral → cabeçalho com número, título e situação, link `Abrir detalhe do chamado`, corpo com mensagens, comentários e histórico em ordem, e rodapé explicando que responder é pelos comentários → AC-10
- [x] Não existe caixa de envio nessa tela → AC-10
- [x] Chamado aberto pelo formulário, sem `Conversa` ligada → abre igual, com comentários e histórico e sem mensagens → AC-10
- [x] Cada item traz o nome de quem agiu, resolvido contra `User.name` → AC-10

### Permissão

- [x] Pedir `/conversas/<id>` de uma conversa de outra pessoa → 404, resposta idêntica à de um id inexistente → AC-1, AC-10
- [x] `POST /api/conversas/<id>/mensagens` numa conversa de outra pessoa → 404 e **nenhum** `LlmCall` novo: o dono é conferido antes de gastar vaga na GPU → AC-1
- [x] Sem sessão → as duas rotas de POST respondem 401 em JSON, sem redirecionar → AC-1

### Acessibilidade

- [x] Com leitor de tela, enviar uma mensagem → `O assistente está respondendo` é anunciado uma vez quando o primeiro quadro chega → AC-8
- [x] A bolha em construção não é lida pedaço a pedaço enquanto cresce, e o texto completo é lido uma vez só quando a resposta termina → AC-8
- [x] Percorrer a tela inteira só com teclado → toda ação é alcançável, o foco é sempre visível e a ordem faz sentido → AC-8
- [x] Todo botão de ícone (enviar, voltar, descartar) tem nome acessível → AC-8
- [x] Todo alvo de toque tem no mínimo 44 pixels → AC-8
      _(medidos os 31 alvos de `/conversas` e os 29 da conversa aberta, no computador e em 390 pixels: todos os da tela passam. O sino do cabeçalho, que é do painel inteiro e não desta fatia, mede 36.)_
- [x] Rodar um verificador de contraste nas duas aparências (clara e escura): todo texto passa em 4,5 para 1 → AC-8

### Celular

- [x] Em 390 pixels de largura, `/conversas` mostra só a lista ocupando a tela → AC-11
- [x] `/conversas/<id>` mostra só a conversa, com botão de voltar que leva à lista e o foco indo para o título → AC-11
- [x] No computador as duas rotas mostram lateral e conversa lado a lado; a troca é por CSS e rota, sem gaveta → AC-11
- [x] Nenhuma rolagem horizontal em 390 pixels, inclusive com título longo na conversa → AC-11

### Tempo real

- [x] Com o socket no ar, provocar `ticket:assigned` noutro perfil → a tela de conversas recarrega sozinha em cerca de 800ms, atualizando lateral e conversa aberta → AC-13
- [x] Vários eventos em rajada → uma recarga só, não uma por evento → AC-13
- [x] Conferir que nenhuma sala nova, nenhum evento novo e nenhuma mudança no socket server entraram nesta fatia → AC-13

## Commands

- [x] `npx tsc --noEmit` → sem erro
- [x] `npm run lint` → sem erro
- [x] `npm test` → toda a suíte passa
- [x] `npm run build` → build limpo, com `/conversas`, `/conversas/[id]`, `/api/conversas/mensagens` e `/api/conversas/[id]/mensagens` na lista de rotas dinâmicas
- [x] No Mongo, `db.chamados.getIndexes()` → o índice `{ solicitanteId: 1, updatedAt: -1, _id: -1 }` existe → AC-2
- [x] `db.chamados.find({ solicitanteId: <id> }).sort({ updatedAt: -1, _id: -1 }).limit(20).explain()` → usa esse índice, sem ordenação em memória → AC-2
- [ ] Na VPS, `docker logs severino-next-app-1` durante um envio → linhas `[llm]` e `[assistente]` sem texto de relato e sem chave
      _(não dá para rodar de um verify local: precisa de acesso à produção e de um envio real lá. A mesma conferência foi feita no log do servidor de desenvolvimento, com os seis motivos de falha: as linhas trazem só `task`, `lane`, `mode`, `status`, `reason`, `attempts`, `latencyMs`, `conversaId`, `motivo` e `duracaoMs`, e nenhuma ocorrência de texto de relato.)_

## Acceptance-criteria coverage

- AC-1 · rota, sessão, primeira pintura e permissão → passos de _Entrada e lateral_ e _Permissão_
- AC-2 · dois blocos, paginação por cursor, linha de apoio, marca `Confirmando` → _Entrada e lateral_, mais os dois comandos do índice
- AC-3 · boas vindas sem gravar, criação no envio, descarte no insucesso, limite de rascunhos → _Conversa nova_
- AC-4 · envio otimista, falha preservando o texto, nova tentativa pela rota com id → _Conversa que continua_
- AC-5 · quadros `inicio`, `parcial`, `fim`, parcial nunca gravado, `llmCallId`, sem disparo ao recarregar → _Conversa nova_ e _Conversa que continua_
- AC-5b · `mensagemId: null`, aviso na tela, log no servidor → _Falha da IA_
- AC-6 · assistente só conversa; tipo de mensagem continua só `texto` → conferir no Mongo que nenhuma `DecisaoIa` nasce e que todo `tipo` é `texto`
- AC-7 · todos os caminhos de falha da IA viram mensagem de `sistema` com texto do Sigma → _Falha da IA_
- AC-8 · região ao vivo, teclado, nomes acessíveis, alvos de toque, contraste → _Acessibilidade_
- AC-9 · contadores, limite de 30, frase própria por motivo → _Conversa que continua_
- AC-10 · chamado em leitura, resolução conversa primeiro e chamado depois, 404 igual → _Chamado em modo leitura_ e _Permissão_
- AC-11 · duas telas no celular, lado a lado no computador → _Celular_
- AC-12 · descarte com confirmação e falha em confirmação em andamento → _Conversa que continua_
- AC-13 · recarga por `notification:new` com agrupamento, sem mexer no socket → _Tempo real_
