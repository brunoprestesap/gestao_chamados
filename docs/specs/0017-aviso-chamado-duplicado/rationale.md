# 0017. Aviso de chamado duplicado: decision record

Build spec: [index.md](index.md).

## Context

Com a abertura pelo chat (spec 0004), abrir um chamado ficou fácil, e o mesmo defeito costuma afetar várias pessoas ao mesmo tempo: o ar condicionado de uma sala compartilhada, o elevador de um prédio, a infiltração de um corredor. Cada uma relata do seu jeito, e a triagem recebe vários chamados para um conserto só. O Preposto precisa perceber a repetição, cancelar os extras e explicar a cada solicitante, e o técnico pode ser mandado duas vezes ao mesmo lugar. A métrica de volume do IMR também infla.

O escopo (funcionalidade 20) pede que, antes de confirmar, o Sigma procure chamado em andamento parecido no mesmo local e ofereça acompanhar aquele em vez de abrir outro, sem mostrar dados pessoais de outro solicitante e sem nunca impedir a abertura. Dois fatos do sistema pesam. Primeiro, o cartão resumo já reúne no servidor os sinais certos para comparar: subtipo de serviço, unidade, local digitado e, desde a spec 0014, o equipamento sugerido por código ou por regra. Segundo, hoje o solicitante só enxerga os próprios chamados (`lerLinhaDoTempo` só deixa passar dono, técnico atribuído e gestão), então "acompanhar o chamado de outra pessoa" não existe como permissão.

As forças em jogo: a GPU é compartilhada e cada chamada ao modelo disputa vaga com o resto do chat; a autonomia da IA está amarrada a uma calibração (spec 0006) que muda de versão com o prompt; o tratamento de dados segue a LGPD, e o relato, a descrição e os comentários de um chamado são texto livre com nome, ramal e horário das pessoas. Sem decidir, os duplicados continuam chegando e o único filtro é a memória do Preposto.

## Options considered

### Option 1: Regra no servidor dentro do cartão, com interessado em coleção própria

A busca roda em `montarCartao`, junto da sugestão de ativo: mesmo ativo em qualquer unidade, ou mesmo subtipo e unidade com pelo menos uma palavra do local em comum, só entre chamados em andamento. O cartão mostra até três, com campos fechados num schema estrito. Acompanhar grava um `ChamadoInteressado`, descarta o rascunho e abre uma vista só de leitura, com leitor próprio, seção na lateral e aviso no sino quando o chamado termina. Abrir mesmo assim marca o chamado novo para a gestão.

**Pros**:

- Não usa a GPU nem toca no prompt, então não mexe na calibração nem na autonomia.
- Cada aviso tem um motivo que dá para explicar ("mesmo equipamento", "mesma sala"), e a regra é testável sem modelo.
- Reaproveita a função de palavras do local e o ativo do cartão da spec 0014.
- Dá ao solicitante um acompanhamento real e à gestão um sinal de impacto e de duplicado.

**Cons**:

- Perde duplicados escritos de jeitos diferentes e pode avisar sobre problemas diferentes na mesma sala.
- Cria um quarto tipo de leitor do chamado, com rota, tipo e seção de lateral próprios.
- Exige ligar o aviso de fim em três pontos de mudança de status.

### Option 2: Regra filtra, modelo julga o texto

A mesma regra, mais larga (sem exigir palavra em comum), acha candidatos, e o modelo compara o relato com o título de cada candidato e devolve quais são o mesmo problema, com confiança.

**Pros**:

- Pega casos em que o local foi escrito de outro jeito, e descarta casos de problema diferente na mesma sala.
- Deixa o aviso mais preciso conforme o modelo melhora.

**Cons**:

- Uma chamada a mais ao modelo por cartão, disputando a vaga da GPU com o chat, e um prompt e um schema novos para registrar, versionar e calibrar.
- Precisa de reserva para quando o modelo falha, e sem medição prévia não se sabe se o ganho compensa.
- O título e o relato de outros chamados passariam a entrar no prompt.

### Option 3: Só o mesmo equipamento

Avisa só quando o cartão tem ativo e já existe chamado em andamento nesse ativo.

**Pros**:

- Quase sem falso aviso: mesmo equipamento é quase sempre o mesmo problema.
- Implementação mínima, só uma consulta por `ativoId`.

**Cons**:

- Cobre pouco: só ativos Tier A e B identificados no cartão, e nada de infiltração, iluminação ou qualquer problema sem equipamento cadastrado.

### Option 4: Aviso sem acompanhamento

A mesma regra da Option 1, mas "acompanhar" só mostra número e status e descarta o rascunho, sem registro de interesse, sem vista e sem aviso de fim.

**Pros**:

- Sem coleção nova, sem leitor novo, sem mexer em notificação.

**Cons**:

- O usuário troca um chamado próprio, que ele acompanha, por nada: não sabe quando o problema foi resolvido e tende a abrir mesmo assim para ter como acompanhar.
- A gestão não fica sabendo quantas pessoas foram afetadas.

## Rationale

A Option 1 foi escolhida porque o problema do escopo é de lugar e de serviço, e esses dois sinais já estão no cartão de forma estruturada; um modelo não acrescenta o suficiente para justificar a vaga na GPU compartilhada e uma terceira tarefa para calibrar. A exigência de pelo menos uma palavra do local em comum é o que impede o aviso de virar ruído em prédio com vários equipamentos do mesmo tipo, e o ramo do ativo cobre o caso mais forte em qualquer unidade e até no cartão manual. Errar aqui custa pouco: o aviso nunca bloqueia, então um falso aviso custa uma leitura e um falso silêncio deixa as coisas como estão hoje. A Option 2 fica como evolução se a medição do Follow-up mostrar muitos duplicados escapando.

O interessado em coleção própria, e não como ramo de `lerLinhaDoTempo`, foi escolhido porque a leitura de chamado hoje devolve comentários, autoria e histórico com texto, todos pensados para quem já tem direito de ver. Um filtro esquecido nesse caminho exporia dados de outro solicitante; um leitor separado, com tipo estreito, só consegue devolver o que foi desenhado para ele. Pelo mesmo motivo nenhuma entrada de `ChamadoHistory` é gravada por interesse: o histórico chega ao dono pela linha do tempo, e uma linha "Fulano passou a acompanhar" seria justamente o vazamento que a funcionalidade promete evitar.

O aviso de fim só no sino, e só uma vez por fim, responde à pergunta que o interessado de fato tem ("já consertaram?") sem acrescentar eventos ao Socket.IO. O campo `avisadoFimEm` existe porque o cancelamento não grava data no chamado; ele resolve ao mesmo tempo o relógio da janela de sete dias na lateral e a garantia de um aviso só, com uma gravação condicional, sem depender de campos de data espalhados pelo `Chamado`. Marcar o chamado aberto mesmo assim (`avisoDuplicado`) fecha o ciclo do lado da gestão sem criar ação nova de triagem; cancelar como duplicado com transferência do solicitante fica como decisão própria.

## Interview record

Respostas do engenheiro na conversa de 2026-10-07, todas na opção recomendada:

- Detecção por regra no servidor, sem modelo.
- Acompanhar grava o usuário como interessado, com vista só de leitura e lateral.
- O aviso aparece junto do cartão resumo.
- Em andamento: `aberto`, `validado`, `em atendimento`, `aguardando_solicitante`, `aguardando_terceiros`.
- Sem ativo e sem palavra do local em comum, não avisa.
- Cartão manual só pelo ativo do código.
- O aviso mostra número, serviço, local, equipamento, status e idade; até 3 itens.
- Chamado próprio aparece com "Ver meu chamado", que só navega.
- Vista do interessado com status e marcos, sem comentários; sino só no fim.
- Gestão vê contagem e nomes; técnico só contagem.
- O rascunho é descartado ao acompanhar; o chamado aberto mesmo assim guarda o aviso para a gestão.
- O interessado pode sair; o registro ganha data de saída.
- Sem `ChamadoHistory` por interesse.
- Leitor separado na mesma URL; botão de confirmar sem passo extra; corrida recusa e mantém o rascunho.
- Lateral mostra até 7 dias depois do fim; "cancelar como duplicado" fora desta spec; sem interruptor, só constantes; rigor Beta; sem seção de referências.

## Ajuste de 2026-10-07: o local na vista do interessado

A revisão do código por outro modelo apontou que o cartão esconde o local de um chamado de outra unidade (AC-6), mas a vista de acompanhamento e a lateral mostravam o local sempre. Com um clique em "Acompanhar este", quem é de fora lia o texto que o cartão tinha escondido.

Opções consideradas:

- **Mesma regra do cartão, gravada no clique (escolhida).** O interesse guarda `localVisivel` com a decisão que o cartão já tomou naquele item. Fecha o vazamento, não precisa de nova consulta nem de regra nova, e não muda depois se o perfil da pessoa mudar.
- **Mostrar sempre e registrar.** Mais simples, mas deixa a proteção do AC-6 sem efeito.
- **Nunca mostrar na vista.** Mais fechado, mas tira de quem é da mesma unidade uma informação útil para reconhecer o problema.

O engenheiro escolheu a primeira. Interesse sem o campo vale `false`, o lado seguro.

Na mesma revisão, outras quatro correções foram feitas como implementação, sem decisão nova: o técnico atribuído deixa de contar como interessado, o status é lido de novo depois de gravar o interesse, a marca de avisado é desfeita quando a notificação falha, e o cancelamento só grava se o status não mudou. Elas estão descritas nos AC-9, AC-15, AC-17 e AC-19.

## Cross check

Uma leitura independente da spec, feita por outro modelo antes do aceite, achou lacunas que foram fechadas com a aprovação do engenheiro. As principais: a recusa do serviço pelo solicitante também reabre um chamado concluído (passou a zerar `avisadoFimEm`); a chave dos parecidos precisava entrar em `conteudoDaProposta` como o `ativoChave` da 0014; ativo sugerido por regra com vários candidatos é palpite e deixou de valer como "mesmo equipamento"; o local digitado por alguém de outra unidade deixou de aparecer; a corrida entre acompanhar e confirmar passou a desfazer o interesse; quem já enxerga o chamado (técnico atribuído, gestão) vê "Ver chamado" em vez de acompanhar; e o tipo de notificação novo precisa entrar também no `switch` do sino.
