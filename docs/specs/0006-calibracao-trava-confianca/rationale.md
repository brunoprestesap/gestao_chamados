## Context

Desde a spec 0004, todo chamado aberto pelo chat carrega uma decisão da IA sobre serviço e, quando a proposta tem, sobre prioridade, gravada em `DecisaoIa` com a confiança que o próprio modelo declara. A prioridade sugerida fica escondida de propósito, pra dar um jeito honesto de medir o acerto sem viés; o serviço sugerido, ao contrário, já aparece pré preenchido pro Preposto na classificação (ver a terceira força abaixo). O follow up da spec 0004 já registra o risco central desta decisão: a confiança que o modelo declara sobre si mesmo costuma ser mal calibrada, e não pode virar um limite de autonomia sem antes medir contra resultado real.

Hoje nada faz essa medição. As fatias seguintes do roteiro (prioridade e SLA automáticos, atribuição automática ao técnico, revisão do Preposto, painel de acurácia) dependem de um número confiável de "a partir de qual confiança a IA acerta o suficiente" e de um jeito de desligar qualquer autonomia sem esperar um deploy. Sem essa base, cada uma dessas fatias teria que inventar sua própria régua, provavelmente incoerente entre elas.

A força que mais pesa nesta decisão é o tamanho da amostra: a liberação do chat é recente e o volume de chamados classificados com decisão da IA ainda é pequeno (dezenas, não centenas). Qualquer desenho que dependa de uma amostra grande imediata está descasado da realidade atual do projeto. Outra força é a regra já em vigor de proteção da GPU compartilhada (`lib/llm/AGENTS.md`): qualquer chamada nova ao vLLM tem custo real de vaga e de operação, então gerar decisões novas só para medir é uma escolha que precisa se justificar sozinha, não vir de graça.

Uma terceira força só apareceu durante o desenho: nem todo campo é medido às cegas. `CAMPOS_OCULTOS` (`lib/conversas/decisoes.ts`) só esconde `prioridade` do Preposto; o `ClassificarChamadoDialog` já mostra o `catalogServiceId` sugerido pela IA, pré preenchido, com um selo. Isso significa que o acerto de `servico` mede em parte concordância induzida, não um julgamento independente, e qualquer desenho desta fatia precisa admitir esse viés em vez de escondê-lo atrás de um número só. Uma quarta força, também descoberta tarde, é que o projeto já resolve boa parte do problema de "o que o Preposto decidiu de verdade": toda vez que `classificarChamadoAction` roda, ela chama `aplicarVeredito` (spec 0002), que grava em `DecisaoIa.situacao` se a escolha final bateu (`confirmada`) ou não (`corrigida`) com a sugestão da IA, e `revisadaEm` marca quando isso aconteceu. Esse veredito já existe hoje, sem depender de nenhuma fatia futura.

## Options considered

### Opção 1: amostra viva do chat, relatório sob demanda, configuração num documento único

Mede só os chamados abertos pelo chat que já têm decisão da IA e já foram classificados, lendo o veredito que a própria classificação já grava (`DecisaoIa.situacao`, via `aplicarVeredito`), calculando a acurácia ao vivo a cada vez que a tela é aberta, sem gravar nenhum retrato. Guarda o limite de confiança, a amostra mínima e o interruptor de autonomia num único documento, com uma sub configuração por campo.

**Pros**:

- Não custa nenhuma chamada nova ao vLLM: reaproveita decisões que já existem.
- Reflete o comportamento real do prompt que está valendo agora, porque a amostra vem do uso de produção, não de um replay.
- Lê `DecisaoIa.situacao` direto, sem precisar cruzar com `Chamado`: reaproveita o veredito que o projeto já calcula sozinho desde a spec 0002, em vez de reimplementar a comparação.
- Reaproveita o padrão de agregação sob demanda já usado no relatório IMR (`lib/imr-service.ts`), sem infraestrutura nova.

**Cons**:

- A amostra cresce devagar, então a calibração pode ficar presa em "amostra insuficiente" por semanas.
- O acerto de `servico` herda o viés de o Preposto ver a sugestão antes de classificar; a opção não resolve isso, só torna o viés visível.

### Opção 2: reprocessamento retroativo contra o histórico pré-chat

Roda a IA de novo contra chamados antigos, abertos pelo formulário e já classificados antes de a IA existir, gerando decisões novas contra o catálogo de hoje para engordar a amostra imediatamente.

**Pros**:

- Amostra muito maior desde o primeiro dia, sem esperar o volume do chat crescer.

**Cons**:

- Custa chamadas reais ao vLLM só para medir, o que a proteção de GPU compartilhada do projeto trata como um custo a justificar, não uma ação de graça.
- O catálogo e o prompt da época desses chamados antigos podem ter mudado; a decisão gerada hoje contra um relato antigo não necessariamente reflete como a IA se comportaria num relato novo.
- Adiciona uma tarefa de reprocessamento em lote que este projeto ainda não tem, só para esta fatia.

### Opção 3: job periódico com retrato gravado numa coleção nova

Em vez de calcular ao vivo, um job agendado (no padrão do cron de chamados recorrentes já existente) grava periodicamente o resultado da medição numa coleção nova, e a tela só lê o último retrato.

**Pros**:

- Adianta parte da infraestrutura de tendência histórica que a fatia 18 (painel de acurácia) vai querer.

**Cons**:

- Acrescenta um cron, uma coleção nova e a defasagem de um retrato desatualizado, para uma tela que o Admin abre raramente.
- No volume de dado de hoje, a agregação ao vivo já é barata o bastante (o mesmo argumento que já vale pro relatório IMR); o custo operacional do job não se paga ainda.

## Rationale

A Opção 1 vence porque as duas forças mais fortes do Contexto, a amostra pequena e o custo real de qualquer chamada nova ao vLLM, favorecem não gastar recurso nenhum além do que já existe: medir contra o que já está gravado é a única opção que não pede uma justificativa extra pra equipe da GPU. A Opção 2 resolveria o problema da amostra pequena mais rápido, mas às custas de exatamente o recurso que o projeto já documenta como escasso e mais de uma incerteza nova (catálogo e prompt desatualizados no replay); fica registrada no Follow up como caminho a reconsiderar se o volume do chat continuar baixo por muito tempo. A Opção 3 resolve um problema que este projeto ainda não tem (tendência histórica é explicitamente escopo da fatia 18) trocando uma agregação barata por um job e uma coleção que ninguém consome ainda.

A escolha do documento único de configuração, em vez de um documento por campo no padrão de `SlaConfig`, segue a mesma lógica de simplicidade: o interruptor de autonomia é global por natureza (não faz sentido "meio desligado"), então um único documento com sub configuração por campo evita duas fontes de verdade pra um estado que precisa ser lido junto (limite do campo mais o interruptor) sempre que uma fatia futura for decidir se age sozinha.

Sobre a fonte da verdade: o desenho original desta decisão cruzava `DecisaoIa.valorIa` direto com os campos finais do `Chamado` (`catalogServiceId`, `finalPriority`), presumindo que ninguém revisava a sugestão da IA antes da fatia 17. Essa premissa estava errada: `classificarChamadoAction` já chama `aplicarVeredito` hoje, toda vez que um chamado é classificado, e grava o mesmo veredito que esta fatia precisava calcular. Cruzar direto com o `Chamado` também escondia um problema: um chamado do chat nasce com `catalogServiceId` igual ao da IA antes mesmo de ser classificado, então usar esse campo como sinal de "já foi classificado" contava chamados ainda `aberto`, inflando a amostra e a acurácia. Ler `DecisaoIa.situacao` e `revisadaEm` resolve as duas coisas de uma vez: só conta o que passou pela classificação de verdade, e não reinventa uma comparação que o projeto já faz.
