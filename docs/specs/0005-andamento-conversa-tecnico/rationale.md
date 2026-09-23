# Rationale: 0005. Andamento do chamado na conversa

## Context

> ⚠️ Nota de premissa: durante a conversa de design, o alcance cresceu do que a linha do escopo descrevia (a experiência do solicitante) para as quatro pessoas envolvidas no chamado (solicitante, técnico, Preposto e Admin) escreverem pela mesma tela `/conversas/[id]`. Foi uma escolha explícita, tomada pergunta por pergunta, não uma suposição silenciosa. Registro aqui porque muda o tamanho da fatia: a lateral da tela, hoje só pensada para o solicitante, ganha uma consulta nova por perfil, e a caixa de envio precisa do alternador público/interno que hoje só existe no formulário antigo.

A tela `/conversas/[id]` já junta mensagens da conversa, comentários do chamado e entradas do histórico numa leitura só (`lerLinhaDoTempo`, spec 0002 AC-12), e quando o chamado está vinculado ela vira modo leitura: sem caixa de envio, sem atualização automática além do que a rota atualiza a cada 800 milissegundos ao receber uma notificação genérica. Separadamente, uma mensagem que o solicitante escreve numa conversa já vinculada a um chamado já vira comentário do chamado (`criarComentario`, spec 0002 AC-13), mas essa gravação nunca é exercida na prática, porque a tela de leitura não tem onde escrever.

O sistema de notificação em tempo real (Socket.IO, salas por usuário e por gestão) já cobre a maioria dos eventos que interessam aqui, mas de forma desigual: alguns eventos emitem para a sala do solicitante e o cliente (`RealtimeProvider`) já reage a eles (execução registrada, encerramento); outros emitem para o solicitante mas o cliente ainda não reage (pausa, retomada, recusa na triagem, reabertura, comentário novo); a atribuição de técnico hoje só emite para a sala do técnico, nunca para o solicitante; e a classificação não emite nada, para ninguém. Isso significa que o trabalho não é construir tempo real do zero, é fechar lacunas específicas e pontuais num sistema que já existe.

Um chamado aberto pelo formulário tradicional nunca ganha uma Conversa (`canalAbertura: 'formulario'`, `conversaId: null`), então o caminho de escrita que já existe (mensagem vira comentário) não tem onde se apoiar para esse caso. E a lateral de `/conversas` hoje só lista chamados em que a pessoa é a solicitante, então técnico e gestão, mesmo já lidos como permitidos por `lerLinhaDoTempo`, não têm hoje uma porta de entrada até um chamado alheio.

Não há dado regulado novo aqui: a mesma regra de visibilidade que já protege comentário interno e sugestão da IA continua valendo, só passa a ser exercida por mais gente na mesma tela.

## Options considered

### Option 1: Fechar as lacunas do que já existe (emissão, cliente e uma caixa de envio nova)

Reaproveita a leitura combinada, o comentário que já vira mensagem e a maior parte dos eventos do socket; soma só o que falta: a emissão de classificação, o segundo destinatário da atribuição, os manipuladores novos no `RealtimeProvider`, e a caixa de envio na tela que hoje é só leitura.

**Pros**:

- Risco baixo: quase todo o mecanismo já roda em produção, só ganha mais gente ouvindo e mais uma emissão.
- Nenhuma coleção nova, nenhuma migração de dado existente.
- Consistente com o padrão que a tela já usa (notificação genérica, atualização suave).

**Cons**:

- Cotação, observação de material e pausa por terceiros ficam de fora desta fatia; quem depende delas continua nas telas antigas.
- A atribuição passa a ter dois públicos com textos diferentes no mesmo evento, o que o cliente não precisava resolver antes.

### Option 2: Uma sala de socket por chamado, com eventos de diferença (delta) na própria linha do tempo

Cria uma sala nova por chamado (`chamado:<id>`) e o servidor manda cada item novo da linha do tempo já pronto para inserir no lugar certo, sem depender de um reload completo da página.

**Pros**:

- Atualização mais fina e mais rápida de perceber, sem o efeito de "a tela toda pisca" de um `router.refresh()`.
- Escala melhor se o número de pessoas olhando o mesmo chamado ao mesmo tempo crescer muito.

**Cons**:

- Um mecanismo de tempo real inteiro novo, paralelo ao que a tela já usa em todo o resto do painel; mais uma coisa para manter e testar.
- Custo bem maior do que o problema pede agora: o volume de gente olhando o mesmo chamado ao mesmo tempo é pequeno.

### Option 3: Buscar atualização por intervalo (polling) em vez de socket

A tela pergunta ao servidor a cada alguns segundos se há novidade no chamado aberto, sem depender do Socket.IO.

**Pros**:

- Mais simples de escrever, sem depender do estado da conexão do socket.

**Cons**:

- Atraso perceptível e chamadas desperdiçadas quando nada mudou.
- Contradiz o tempo real que o resto do painel já entrega por socket; a pessoa notaria a diferença entre telas.

## Rationale

O Context mostra que a peça que falta é pequena e pontual: uma emissão nova (classificação), um destinatário a mais numa emissão que já existe (atribuição) e alguns manipuladores no cliente que ainda não escutam eventos que o servidor já manda (pausa, comentário). Construir uma sala por chamado (Option 2) resolveria o mesmo problema com uma arquitetura de tempo real diferente da que o resto do painel usa, para um volume de uso (poucas pessoas olhando o mesmo chamado ao mesmo tempo) que não justifica o custo de operar dois mecanismos. Buscar por intervalo (Option 3) joga fora o investimento que o Socket.IO já tem no projeto e entrega uma experiência pior, não melhor.

A escolha de também abrir `/conversas/[id]` para técnico e gestão (registrada no Premise note acima) segue a mesma lógica de reaproveitamento: a permissão de leitura para esses dois papéis já existe em `lerLinhaDoTempo` desde a spec 0002, só nunca foi exercida por falta de porta de entrada; a lateral por perfil e o alternador público/interno reaproveitam consultas e regras que `/chamados-atribuidos`, `/gestao` e `criarComentario` já aplicam.

### Correção depois da checagem cruzada: como um chamado do formulário passa a aceitar mensagem

A primeira versão desta spec resolvia o AC-9 (chamado do formulário, sem Conversa) com uma função que criava uma Conversa nova e a ligava ao chamado na primeira mensagem, reaproveitando o mesmo sentido de vínculo que o chat já usa. Uma checagem cruzada, feita por outro modelo lendo o código real, achou três problemas reais nessa ideia: os dois índices únicos envolvidos (`Chamado.conversaId`, `Conversa.chamadoId`) não têm transação disponível em produção (o Mongo roda standalone), então um clique duplo tinha um caminho real para corrida; a Conversa nasceria com a mesma expiração de 30 dias que um rascunho comum, e esquecer de zerar esse campo apagaria a Conversa sozinha; e, mais fundamental, essa Conversa nunca guardaria nenhuma mensagem própria, porque tanto a mensagem do solicitante quanto a resposta do técnico já viram comentário do chamado (`ChamadoComment`), não mensagem de conversa.

A correção é mais simples que a ideia original: como `criarComentario` já trabalha só com o id do chamado, e `abrirConversa`/`lerLinhaDoTempo` já toleram um chamado sem `conversaId`, um chamado do formulário passa a ser endereçado pelo próprio id (`/conversas/<chamadoId>`) e a gravação vai direto para o chamado, sem nunca criar Conversa nenhuma. Isso elimina a corrida, a expiração por engano e a função nova inteira, sem abrir mão do que o AC-9 pede.

### Correção depois da checagem cruzada: comentário de gestor para gestor

A mesma checagem notou que `criarComentario` hoje só emite para a sala `managers` quando quem escreveu não é da gestão, então um comentário público de um Preposto não avisa outro Preposto olhando o mesmo chamado, o que quebra o AC-5 nesse caso específico (o caso que a abertura de `/conversas` para a gestão criou). A correção é emitir sempre para `managers`, independente de autor e visibilidade: como a leitura (`lerLinhaDoTempo`) já decide quem enxerga comentário interno pelo papel de quem lê, mandar o evento para a sala não vaza nada que a leitura já não filtrasse. É uma mudança de contrato de uma função compartilhada por várias telas, não só a conversa, registrada como tradeoff em Consequences.
