# 0003. Tela de conversas de chamados — raciocínio

Registro da decisão. O `/develop` não precisa deste arquivo; ele constrói pelo [index.md](index.md).

## Context

> ⚠️ Nota sobre a premissa: esta fatia cria uma segunda porta de entrada para a mesma coisa. A rota `/conversas` lista os chamados do usuário na lateral, e `/meus-chamados` continua listando os mesmos chamados em tabela, sem nenhuma mudança. Isso é deliberado (provar a conversa antes de aposentar a tabela), e é a escolha certa para uma tela que depende de um modelo de IA na rede interna. O risco é o clássico: duas telas do mesmo dado envelhecem em ritmos diferentes, e a decisão de unificar fica adiada para sempre porque nunca é urgente. A saída não é evitar a segunda porta, é combinar agora o sinal que encerra a convivência. Está registrado como pendência no `index.md`.

> ⚠️ Nota sobre a premissa: a escolha de já chamar a IA aqui aproxima esta funcionalidade da 12. A fronteira precisa ser explícita, senão a 12 nasce sem conteúdo ou esta fatia cresce sem fim. A fronteira desta spec: o assistente conversa em texto livre e nada mais. Ele não escolhe serviço, não define prioridade, não sugere técnico, não grava decisão e não cria chamado. Tudo isso continua sendo a funcionalidade 12, inclusive o cartão de confirmação.

O Sigma já tem tudo o que uma conversa precisa por baixo e nada por cima. A spec [0001](../0001-integracao-ia-local/index.md) entregou o caminho único até o Qwen3 no vLLM, com prazos, limite de chamadas simultâneas, disjuntor, streaming e registro em `LlmCall`, e nenhuma função que lança exceção. A spec [0002](../0002-conversa-decisoes-ia/index.md) entregou onde a conversa vive: `Conversa`, `ConversaMensagem` e `DecisaoIa`, com rascunho que expira em 30 dias, tetos de 5 rascunhos, 30 mensagens e 2.000 caracteres, reserva sem transação para o rascunho virar chamado, e leitura combinada de mensagens, comentários e histórico. As duas fundações estão prontas, testadas e sem nenhuma tela que as use.

Quem abre chamado hoje passa pelo formulário: escolher unidade, local, tipo de serviço no catálogo hierárquico e urgência. Para quem só quer avisar que o ar condicionado está pingando, é bastante coisa para saber antes de pedir ajuda. O escopo desta passada aposta que relatar em linguagem natural resolve isso, e a funcionalidade 11 é a primeira metade da aposta: a tela onde o relato acontece. A segunda metade, a IA lendo o relato e montando o chamado, é a funcionalidade 12.

As forças que moldam a decisão são quatro. Primeira: a GPU é compartilhada com outras equipes do tribunal, então cada mensagem enviada consome uma vaga combinada, e a tela precisa ser explícita sobre espera e sobre falha. Segunda: a liberação será para todos de uma vez, sem grupo piloto, então a tela precisa funcionar com leitor de tela, só com teclado e no celular desde o primeiro dia, não numa passada de polimento depois. Terceira: o projeto roda Next.js 16 com App Router, componentes de servidor, Server Actions e um `RealtimeProvider` de Socket.IO que já funciona; qualquer coisa que se afaste desses padrões vira dívida na primeira revisão. Quarta: a tela atual de Meus Chamados está estável e em uso, com busca, filtros e paginação, e mexer nela para experimentar a conversa arriscaria o que já funciona.

Não decidir custa caro de um jeito específico: as duas fundações ficam paradas no repositório sem entregar valor nenhum, e cada semana sem tela é uma semana em que a spec 0002 envelhece sem ninguém descobrir o que ela errou.

## Options considered

### Opção 1: tela toda no cliente, uma rota de API para tudo

A página `/conversas` seria um componente de cliente que busca a lista e as mensagens por `fetch`, como `/meus-chamados` faz hoje, com rotas de API para listar, enviar e receber a resposta.

**Pros**:

- Um jeito só de buscar dados na tela inteira, fácil de seguir.
- Rolagem infinita e busca na lateral saem quase de graça.
- Segue o padrão que a tela de Meus Chamados já usa, então ninguém precisa aprender nada novo.

**Cons**:

- A tela abre vazia e enche depois, com esqueleto de carregamento, o que é pior justamente na entrada principal.
- Duplica em rotas de API a leitura que `lib/conversas` já faz bem, e cria mais superfície para errar autorização.
- Mais estado no cliente para manter em sincronia com o socket e com a resposta em streaming.

### Opção 2: leitura no servidor, uma rota de streaming para o envio (escolhida)

A página é um componente de servidor que chama `lib/conversas` direto e entrega a lateral e a conversa já prontas. Só o envio de mensagem passa por uma rota de API, porque a resposta precisa chegar aos poucos. O resto das ações (descartar, carregar mais) são Server Actions.

**Pros**:

- Primeira pintura já com conteúdo, sem esqueleto na entrada mais usada do sistema.
- A autorização continua num lugar só, dentro de `lib/conversas`, porque o servidor chama as funções direto.
- Só uma superfície de rede nova, a do streaming, que é exatamente onde o streaming é necessário.

**Cons**:

- Duas formas de trazer dados convivem na mesma tela: servidor para ler, rota para responder. Quem lê o código precisa saber por que.
- O `Carregar mais` precisa de uma Server Action própria, já que a página de servidor não pagina sozinha.
- O contrato de quadros JSON é caseiro e precisa de teste próprio; nenhuma biblioteca cuida dele.

### Opção 3: tudo em Server Actions, sem streaming

Toda a tela por Server Actions, inclusive o envio: a ação grava a mensagem, chama `generateLlmObject` e devolve a resposta inteira no fim.

**Pros**:

- Nenhuma rota de API nova, nenhum formato de quadros para manter, menos código no total.
- Revalidação e cache ficam no caminho que o Next.js já resolve.

**Cons**:

- O usuário fica olhando o indicador por até 20 segundos sem ver nada acontecer, que é a espera máxima da raia interativa.
- Contraria diretamente o item do escopo sobre perceber que o assistente está respondendo.
- Joga fora o `streamLlmObject` que a spec 0001 construiu justamente para este caso, e a funcionalidade 12 teria de refazer tudo.

## Rationale

A opção 2 vence pela terceira força do Context: o projeto já é App Router com componentes de servidor, e a autorização da conversa já mora dentro de `lib/conversas`. Ler pelo servidor mantém a regra num lugar só e entrega a tela cheia na primeira pintura, que importa mais aqui do que em qualquer outra tela, porque esta vira a porta de entrada. A opção 1 recriaria em rotas de API uma leitura que já existe, e cada rota nova é mais uma chance de esquecer um filtro por dono.

A opção 3 foi descartada pela primeira e pela segunda forças. Esperar 20 segundos olhando para três pontinhos não é espera aceitável para quem só quer avisar que a lâmpada queimou, e a liberação é para todos de uma vez, sem chance de descobrir isso com um grupo pequeno. A spec 0001 construiu `streamLlmObject` exatamente para este caso; não usar seria pagar o custo da fundação sem colher o benefício.

O formato de quadros JSON linha a linha foi escolhido em vez de eventos do servidor (SSE) por um motivo prático: o padrão do navegador para SSE não envia corpo em POST, e a mensagem do usuário precisa ir junto com o pedido. Ler linhas do corpo da resposta com `getReader()` custa umas poucas dezenas de linhas de código e não traz dependência nova, o que combina com a quarta força: nada de novo onde o simples resolve.

Duas decisões menores merecem registro, porque a primeira já causou bug em outros sistemas. A conversa nasce no envio da primeira mensagem, não no clique em `Nova conversa`: com o teto de 5 rascunhos, criar no clique deixaria qualquer pessoa curiosa travada depois de cinco cliques sem digitar nada. E se a gravação da primeira mensagem falhar, o rascunho criado na mesma chamada é descartado ali mesmo, senão a falha deixaria exatamente o lixo que o teto pretende evitar. A segunda é o comportamento do leitor de tela: anunciar cada pedaço que chega transforma a resposta em fala picada e inútil, então a região ao vivo anuncia só o status no começo e o texto inteiro no fim, e a bolha em construção fica escondida do leitor enquanto cresce.

Uma conferência independente da spec, antes de qualquer código, derrubou nove pontos que estavam em aberto e dois erros de nome de campo. Os que mudaram o desenho valem registro. Primeiro, ninguém era dono da sequência que cria o rascunho e grava a primeira mensagem, porque `lib/conversas` expõe as duas funções separadas: a rota sem `id` passou a ser a dona, e `lib/assistente` ficou proibido de criar ou descartar conversa. Segundo, faltava o caso da resposta boa que não consegue ser gravada, quando o rascunho é descartado noutra aba ou o teto de 30 é atingido no meio da resposta; ele virou `mensagemId: null` no quadro `fim`, com aviso na tela, em vez de sumir em silêncio. Terceiro, o `RealtimeProvider` não expõe gancho nenhum, só dispara o evento de navegador `notification:new`: em vez de criar sala e evento novos, a tela pega carona nesse evento com uma espera curta, aceitando recarga supérflua em aviso de SLA. Quarto, a lateral prometia uma ordem única misturando rascunhos e chamados, que a paginação não permite; virou dois blocos, que é também o que o desenho mostra.

A fronteira com a funcionalidade 12 é a parte mais frágil desta decisão e por isso está escrita como critério de aceite (AC-6), não como combinado verbal. O assistente desta fatia conversa e nada mais. No dia em que ele começar a escolher serviço, isso é a funcionalidade 12 começando, e ela tem spec própria.
