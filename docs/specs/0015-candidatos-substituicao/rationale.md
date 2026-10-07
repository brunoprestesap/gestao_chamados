# 0015. Candidatos à substituição de ativo: o registro da decisão

## Context

A proposta de ativos (spec 0011, `proposta.md`) nasceu de um problema dito em uma linha: a decisão entre consertar e trocar um equipamento é tomada por percepção, não por número. As fatias 1 a 4 deram ao Sigma o cadastro, o vínculo do chamado com o equipamento e, na 0014, os indicadores por ativo (MTBF, MTTR, reincidência e ranking). A fatia 5 pede o passo seguinte: o próprio sistema apontar quem merece a conversa sobre substituição.

Os dados disponíveis hoje são a idade (a `dataInstalacao` do cadastro, quase sempre vazia, e a data do tombo do SICAM nos `camposPatrimoniais`), a vida útil por categoria (`CategoriaAtivo.vidaUtilAnos`, que existe desde a 0011 e nada usa) e os corretivos por ativo. O custo de conserto não existe: as cotações têm `valorEstimado`, mas só cobrem o que passou por cotação, e o custo acumulado por ativo foi deixado em Deferred na 0014.

O público é pequeno e definido. O Admin olha o IMR (só dele) e prepara o planejamento de compras; o Preposto conhece o equipamento no local e trabalha na lista de ativos. São centenas de ativos Tier A e B, não milhares. Qualquer sinalização precisa ser explicável numa frase ("passou da vida útil", "quebrou 5 vezes no ano"), porque vai parar num pedido de compra.

Sem uma forma de registrar "já avaliamos, fica", uma lista assim cresce e vira ruído: o equipamento cuja troca já está prevista no contrato novo apareceria todo mês. Por outro lado, esconder um item para sempre faz perder justamente o caso que piorou.

## Options considered

### Option 1: Regra calculada na leitura, com dispensa gravada no ativo

Uma função pura avalia idade, corretivos em 12 meses e reincidência em 90 dias contra a vida útil e os limites da categoria, a cada leitura, a partir dos mesmos números da ficha. Qualquer critério basta, e a tela mostra quais bateram. A única escrita é a dispensa, um subdocumento no `Ativo` com prazo de 6 meses e os critérios que valiam, para o ativo voltar se aparecer um critério novo.

**Pros**:

- Nada fica desatualizado: mudar um limite, vincular um chamado ou preencher a vida útil muda a lista na próxima leitura, sem job nem migração.
- Reaproveita `numerosDoAtivo` e as janelas da 0014, então o selo e a linha de indicadores sempre concordam.
- A dispensa fica junto do ativo, com histórico pelo caminho que todo o módulo já usa (`gravarHistoricoOuDesfazer`).

**Cons**:

- A conta roda a cada abertura do IMR e do filtro; serve para centenas de ativos, não para dezenas de milhares.
- Sem estado gravado, não dá para avisar "virou candidato hoje" sem acrescentar um job depois.

### Option 2: Marca gravada por um job diário

Um job do cron calcula os candidatos uma vez por dia, grava `candidatoSubstituicao` no ativo e avisa a gestão no sino quando um ativo entra.

**Pros**:

- Leitura barata em qualquer volume e um momento claro para o aviso.
- Permite contar "há quanto tempo é candidato".

**Cons**:

- O valor gravado fica velho entre as rodadas: mudar um limite ou corrigir um vínculo só aparece no dia seguinte, e a ficha pode discordar da linha de indicadores.
- Mais uma peça no cron, com marca, idempotência e falha para tratar, para uma informação que a gestão consulta, não que precisa interromper ninguém.

### Option 3: Pontuação com corte

Cada sinal soma pontos (anos acima da vida útil, corretivos, reincidências) e entra quem passa de um corte configurável.

**Pros**:

- Captura combinações que nenhum critério isolado pega (meio velho e quebrando um pouco).
- Um número só para ordenar.

**Cons**:

- Difícil de explicar por que um ativo entrou, e a sinalização vai virar argumento de compra.
- Os pesos não têm base nos dados de hoje; seriam chutes calibrados depois.

## Rationale

O peso aqui está em duas forças do Context: a lista precisa ser explicável numa frase, e o volume é pequeno. A Option 1 responde as duas com o menor número de peças. Cada critério é uma regra que o Admin entende e ajusta por categoria, a lista diz qual bateu, e calcular na leitura sobre centenas de ativos é barato e nunca fica velho. A Option 2 só se paga com volume grande ou com aviso ativo, e o engenheiro escolheu deixar a sinalização só na leitura; a Option 3 troca explicação por uma sofisticação que os dados ainda não sustentam.

A combinação "qualquer critério" deixa a lista maior do que "idade e falha juntas", mas não perde o equipamento novo que quebra sem parar, que é exatamente o caso que a percepção costuma justificar com "é novo, vai melhorar". A dispensa por 6 meses, com volta antecipada só quando surge um critério novo, é o equilíbrio entre lista limpa e não esconder o que piorou: mais corretivos no mesmo critério não trazem de volta (a gestão já sabia que quebrava), mas um equipamento dispensado por idade que começa a quebrar volta no mesmo dia.

Guardar a dispensa no `Ativo`, e não numa coleção própria, segue o padrão do módulo: o ativo é o dono do próprio estado, toda escrita passa pelo `AtivoHistory`, e a leitura da ficha e do lote não precisa juntar duas coleções. As dispensas antigas ficam no histórico, que é onde alguém procuraria. A escrita condicional pelo `em` lido dá "a primeira vale" sem transação, do mesmo jeito que a vistoria resolve a corrida.

A idade usa a data do tombo como reserva da data de instalação, sabendo que ela pode ser a da compra. A alternativa, só a instalação, deixaria o critério de idade praticamente morto hoje; a nota "idade não avaliada" e a vistoria preenchendo `dataInstalacao` corrigem o rumo com o tempo.
