# 0018. Custo acumulado por ativo: racional

## Context

A gestão de ativos (spec 0011) prometeu ligar `Chamado → Ativo → Contrato → Custo` para que a decisão entre consertar e trocar deixe de ser feita por percepção. As specs 0014 a 0016 entregaram corretivos, MTBF, MTTR, reincidência, candidatos à substituição e o relatório por contrato, mas deixaram o custo em Deferred porque ninguém tinha decidido de onde ele vem.

Hoje o único dinheiro do trabalho no Sigma é o `valorEstimado` da `Cotacao`: o Preposto envia, o Admin aprova ou recusa, e o chamado pausa em `aguardando_terceiros` enquanto isso. É um valor estimado, gravado em reais como número comum, e só cobre o que passou por cotação. O material trocado sem cotação aparece só como texto livre (`executions[].materialsUsed`, `materialObservations`), sem quantidade nem valor. A execução não registra horas. O `Contrato` não tem valor. O `Ativo` só tem o `valorHistorico` do SICAM, que é o valor de compra e só sai para Admin e Preposto.

As forças em jogo: o contrato de manutenção cobre a mão de obra por preço fixo, então o que varia por equipamento é peça e material; quem tem a nota do material é a gestão, não o técnico da contratada; o técnico não deve ver valores agregados por equipamento; o relatório por contrato já emite PDF com hash (spec 0016), e um número de custo que muda depois de emitido precisa ser explicável; e o projeto prefere recalcular a cada leitura em vez de gravar derivado (MTBF, candidatos).

Sem decidir, a regra de substituição continua cega para o equipamento que quebra pouco e caro (a 0015 registrou isso como consequência), e o relatório ao fiscal não diz quanto cada equipamento consumiu.

## Options considered

### Option 1: Só cotações aprovadas

O custo do ativo é a soma do `valorEstimado` das cotações aprovadas dos chamados dele. Nenhum campo novo, nenhuma tela de lançamento.

**Pros**:

- Zero digitação nova e zero mudança de processo.
- Pronto em pouco tempo: uma leitura e quatro telas.

**Cons**:

- Ignora todo o material comprado sem cotação, que é a maior parte das trocas pequenas.
- Usa a estimativa, nunca o valor pago.

### Option 2: Cotações mais horas valoradas

Soma as cotações e o tempo de reparo de cada chamado (`tempoDeReparoMs`) vezes um valor por hora configurado.

**Pros**:

- Dá um custo "cheio" sem pedir digitação, porque o tempo já é medido.

**Cons**:

- A mão de obra já está paga no preço fixo do contrato; valorar a hora inventa um gasto que não acontece por equipamento.
- O valor por hora é uma estimativa a manter e discutir, e o número final vira opinião.

### Option 3: Cotações com valor final, mais itens de material lançados pela gestão, somados na leitura

A cotação aprovada ganha um valor final opcional. O chamado ganha uma lista de itens de material fora de cotação (descrição, quantidade, valor unitário), lançados pelo Preposto ou pelo Admin entre `em atendimento` e `concluído`. O custo é recalculado a cada leitura.

**Pros**:

- Cobre as duas fontes reais de gasto variável por equipamento: peça cotada e material comprado sem cotação.
- O número reflete o valor pago quando a nota chega diferente.
- Quem digita é quem tem a nota, e o técnico não precisa ver valor.
- Sem estado derivado: troca de ativo, reabertura e correção refletem sozinhas.

**Cons**:

- Depende de a gestão lançar; o que não for lançado não existe.
- Mais uma seção, quatro actions e quatro ações de histórico.
- Risco de contar a mesma peça na cotação e no material.

### Option 4: A mesma fonte da Option 3, com o total gravado no Ativo

Igual à Option 3, mas cada aprovação, lançamento, edição, remoção e troca de vínculo atualiza um `custoAcumulado` no `Ativo`.

**Pros**:

- Leitura barata nas listas e no IMR.

**Cons**:

- Cada caminho que mexe em custo, inclusive os que ainda vão existir, precisa lembrar de atualizar; um esquecimento deixa o número errado para sempre, sem aviso.
- Janela de 12 meses não cabe num total gravado: precisaria recalcular de qualquer jeito.

## Rationale

A Option 3 foi escolhida porque é a única que mede o gasto que realmente varia por equipamento sem inventar nada. A mão de obra está no preço fixo do contrato, então a Option 2 somaria um custo que não existe por ativo; a Option 1 mede só uma fração do gasto e, sozinha, faria o critério de substituição avaliar equipamentos pelo que passou por cotação, não pelo que custou. O engenheiro escolheu as duas fontes e o valor final; a escolha de a gestão lançar (e não o técnico) segue a regra de que o técnico da contratada não vê custo agregado e de que é a gestão quem recebe a nota.

Recalcular na leitura (contra a Option 4) segue o padrão das specs 0014 e 0015 e a regra de nunca gravar derivado sem um problema de desempenho medido. A janela de 12 meses e o período do IMR já exigem conta por data, então um total gravado não economizaria a leitura onde ela importa, e abriria a porta para o número errado em silêncio quando um caminho novo de troca de ativo esquecesse de atualizar.

Decisões de detalhe tomadas na conversa: os itens vivem num array dentro do `Chamado` (como `materialObservations`), porque são poucos por chamado e são lidos junto com ele; dinheiro continua em reais como a cotação, para o Sigma não ter duas unidades, e a soma vira centavos por dentro para não acumular erro de ponto flutuante; a quantidade aceita fração para material vendido por metro ou quilo; o período do gasto é a abertura do chamado, para bater com corretivos e com o relatório por contrato; o critério de substituição soma só o corretivo, porque a preventiva continua com o equipamento novo; e o PDF já emitido não trava o mês, só diz até quando os custos foram lidos.

Decisões que fiquei com: o teto de 50 itens por chamado, conferido na própria gravação, protege o documento do chamado e resolve a corrida sem transação; a remoção apaga o item e guarda a cópia no histórico, em vez de marcar como removido, para nenhuma leitura precisar lembrar de filtrar (a outra opção era o `removidoEm`); a falha da leitura de custo é isolada na ficha e no IMR, como a 0015 fez, mas derruba o relatório por contrato, porque um PDF oficial com custo zerado por erro é pior que nenhum PDF; e `formatarReais` nasce em `shared/` para a seção, a ficha, o IMR e o PDF usarem o mesmo formato (juntar os `formatBrl` antigos fica em Follow-up, para não misturar refatoração nesta entrega).
