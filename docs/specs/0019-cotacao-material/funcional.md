# Especificação Funcional — Cotação e Fornecimento de Material

**Versão 3** — 15/10/2026
**Contexto:** gestão de serviços de manutenção predial terceirizada — SJAP/TRF1
**Natureza:** especificação funcional. Processo, regras e critérios de aceite. Não trata de arquitetura nem de solução técnica.

> **Histórico.** A v1 foi escrita a partir do conhecimento do domínio, sem acesso aos documentos. A v2 incorporou o contrato e o termo de referência. A **v3 incorpora as planilhas de custo e a proposta vencedora**, que revelaram o preço efetivamente pactuado do material — e inverteram uma premissa central. O registro completo está na seção 20.

---

## 1. Objetivo

Estabelecer como o material aplicado na manutenção predial é solicitado, precificado, conferido, aprovado, autorizado, executado e atestado, de modo que cada aplicação tenha:

- origem de preço identificada entre as bases admitidas pelo contrato
- **conferência de preço, ainda quando a pesquisa for dispensada**
- aprovação por quem detém competência para o valor
- autorização **anterior** à execução
- lastro no saldo do empenho específico de material
- trilha de decisão recuperável a qualquer tempo

## 2. Escopo

**No escopo:** a instrução técnica do fornecimento de material — da identificação da necessidade até o ateste.

**Fora do escopo:** empenho, liquidação e pagamento, que permanecem no sistema orçamentário e no SEI. O processo descrito produz a instrução e o ateste; não movimenta dotação.

## 3. Documentos de referência

| Documento                      | Identificação                                                   | O que fundamenta                                                 |
| ------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Contrato                       | **01/2022** · SEI 14960251 · Processo 0000357-90.2022.4.01.8003 | Vigência, valor, limite de alteração, remissão ao TR             |
| Termo de Referência            | **SEI 14733135** · Processo 0000653-49.2021.4.01.8003           | Modelo de fornecimento, pesquisa de preços, IMR, recebimento     |
| Estimativa da Administração    | `PLANILHA_MANUTENCAO_PREDIAL_2020`                              | Composição de custos por posto, proposta comercial de referência |
| Pesquisa de preços de material | `PLANILHA_MANUTENCAO_PREDIAL_2021`                              | 79 itens, 31 fontes consultadas                                  |
| **Proposta vencedora**         | `Planilha_de_Custo_Preco_Final_Rev03`                           | **Preços unitários pactuados do Anexo V**                        |
| Contratada                     | ARAUJO ABREU ENGENHARIA NORTE LTDA · CNPJ 03.543.374/0001-41    | Parte obrigada                                                   |
| Regime do contrato vigente     | **Lei 8.666/1993** · IN SEGES/MP 5/2017                         | Fundamento aplicável hoje                                        |
| Regime da próxima contratação  | Lei 14.133/2021 · Decreto 11.246/2022 · IN SEGES 65/2021        | Fundamento aplicável ao novo TR                                  |

**RN-00.** O enquadramento normativo é duplo. O contrato vigente é regido pela Lei 8.666/1993 e pela IN SEGES/MP 5/2017; a próxima contratação será regida pela Lei 14.133/2021. As regras desta especificação são exigências de controle que atravessam os dois regimes, mas a citação normativa deve acompanhar o contrato a que se aplica.

### 3.1 Números do contrato que a especificação pressupõe

|                                         |                                                         |
| --------------------------------------- | ------------------------------------------------------- |
| Valor mensal do contrato                | R$ 52.655,99 — **integralmente mão de obra** (7 postos) |
| Valor anual                             | R$ 631.871,93                                           |
| Material                                | **fora do valor do contrato**, por empenho específico   |
| Estimativa SERAE de consumo de material | **R$ 1.000,00/mês · R$ 12.000,00/ano**                  |
| Anexo V completo, a preços pactuados    | R$ 338.041,69 (79 itens)                                |
| Encerramento máximo da vigência         | **28/02/2027**                                          |

## 4. Atores

| Ator                                  | Responsabilidade                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Solicitante**                       | Abre o chamado. Não participa da cotação                                                                                          |
| **Executante**                        | Diagnostica e identifica o material necessário                                                                                    |
| **Responsável técnico da contratada** | Especifica, quantifica e monta a cotação. No contrato vigente é atribuição expressa do **Engenheiro Eletricista** (TR, seção 7.3) |
| **Preposto da contratada**            | Representa administrativamente; recebe chamadas de emergência noturnas e em feriados (TR, 29.5)                                   |
| **Fiscal dos serviços**               | Analisa pertinência técnica, quantidade e especificação. Confere preço. Devolve ou encaminha. Afere os indicadores 3 e 4 do IMR   |
| **Aprovador**                         | Aprova o valor dentro do limite de competência delegado                                                                           |
| **Gestor do contrato**                | Emite recebimento provisório e definitivo; afere os indicadores 1, 2 e 4; acompanha o saldo do empenho                            |
| **Administrador**                     | Mantém faixas de competência, bases de preço e parâmetros de controle                                                             |

**RN-01.** Um mesmo servidor pode acumular papéis, exceto na combinação vedada por RN-18: quem monta a cotação não a aprova.

---

## 5. Modelo de fornecimento — três caminhos de preço

O contrato vigente é de **postos de trabalho em dedicação exclusiva (7 profissionais, empreitada por preço global)**, com **fornecimento de material sob demanda pago por empenho específico**, fora do valor contratado.

A cláusula 9.1.2 do TR estabelece **três origens de preço**:

| #     | Caminho                              | Origem do preço                      | Pesquisa de preços | Conferência        | Fundamento |
| ----- | ------------------------------------ | ------------------------------------ | ------------------ | ------------------ | ---------- |
| **1** | Item do **Anexo V**                  | Preço unitário da proposta vencedora | ❌ dispensada      | ✅ **obrigatória** | TR 9.1.2.1 |
| **2** | Item da **tabela de insumos SINAPI** | Preço SINAPI vigente                 | ❌ dispensada      | ✅ automática      | TR 9.1.2.2 |
| **3** | Item **fora de ambos**               | 3 orçamentos da contratada           | ✅ **exigida**     | ✅ obrigatória     | TR 9.1.2.2 |

> TR 9.1.2.2: _"Caso o material ou equipamento não conste nos anexos citados no subitem anterior, **ou na tabela de insumos do Sinapi**, a Contratada apresentará **03 (três) orçamentos distintos**, discriminando as peças/materiais, quantidades, valores unitário e total para cada item, **para a aprovação prévia por parte do Contratante**, sem prejuízo de realização de pesquisas com vistas à comprovação do custo **e autorização do serviço**."_

**RN-02.** O sistema registra para cada item a **origem de preço** entre as três admitidas. A origem determina se a pesquisa de preços é exigível, **mas não dispensa a conferência** (seção 6).

**RN-03.** O caminho 1 pressupõe a planilha de preços unitários da proposta vencedora carregada no sistema — os 79 itens do Anexo V. Sem ela, item do Anexo V é tratado pelo caminho 3.

**RN-04.** Item cujo preço ofertado divirja do preço pactuado do Anexo V, ou do preço SINAPI vigente, é **impedimento**: o preço pactuado não é negociável no curso da execução.

**RN-05.** Independentemente do caminho, **todo pedido de material é registrado e autorizado antes da aplicação**. A dispensa dos caminhos 1 e 2 alcança a _pesquisa de preços_, não a autorização.

> **Decisão de interpretação a validar:** o TR exige expressamente "aprovação prévia" apenas no caminho 3. Para os caminhos 1 e 2 a especificação impõe autorização registrada por dois motivos: o Indicador 4 do IMR é aferido a partir de pedido documentado, e o material consome saldo de empenho próprio, cuja folga é estreita (seção 14). Se o fiscal entender que isso trava a rotina nos itens de prateleira, a alternativa é registro simplificado sem etapa de aprovação — **pendência 5 da seção 18**.

**RN-06.** Os preços de material, em qualquer caminho, já compreendem todos os custos de aquisição — tributos, frete, seguro, garantias e demais despesas (TR 9.1.2.3). Não há parcela adicional a título de intermediação.

---

## 6. Hierarquia das bases de preço

Esta seção responde ao achado de maior impacto financeiro do levantamento.

### 6.1 O problema

A comparação entre a pesquisa de preços da Administração e a proposta vencedora, nos 79 itens do Anexo V, com unidades e quantidades conferidas:

|                                              |                             |
| -------------------------------------------- | --------------------------- |
| Itens com preço pactuado acima da estimativa | **67 de 79 (85%)**          |
| Variação mediana                             | **+104,7%**                 |
| Total aos preços da estimativa               | R$ 218.386,83               |
| Total aos preços pactuados                   | R$ 338.041,69               |
| Diferença agregada                           | **+R$ 119.654,86 (+54,8%)** |

Exemplos de maior impacto: lâmpada LED 65W de R$ 129,70 para R$ 306,00 (+136%); tinta semi-brilho interna de R$ 297,57 para R$ 679,80 (+128%); cabo de aço galvanizado de **R$ 3,54/m para R$ 432,00/m**, com unidade e quantidade idênticas nas duas planilhas.

A causa é estrutural: o pregão foi julgado pelo preço global, e o material representava **1,8%** dele (R$ 1.000 de R$ 56.190 mensais). Majorar o preço unitário do material praticamente não afetava a competitividade da proposta. Não se afirma irregularidade — a proposta foi aceita e o contrato é válido —, mas a estrutura do certame **não protegeu o preço do material**.

### 6.2 A consequência para a especificação

O preço pactuado **não é sinônimo de preço seguro**. O caminho 1 é o **menos protegido** dos três:

| Caminho            | Exposição                                                               |
| ------------------ | ----------------------------------------------------------------------- |
| 1. Anexo V         | 🔴 **alta** — mediana 105% acima da estimativa da própria Administração |
| 2. SINAPI          | 🟢 baixa — tabela oficial, atualizada periodicamente                    |
| 3. Três orçamentos | 🟡 média, com controle ativo do fiscal                                  |

### 6.3 A lacuna contratual

A cláusula 9.1.2.2 exige os três orçamentos apenas quando o item **não consta** no Anexo V **nem** no SINAPI. **O TR não estabelece qual preço prevalece quando o item consta nos dois.**

Boa parte dos 79 itens do Anexo V é material comum de construção, com entrada na tabela de insumos do SINAPI. Na maioria dos casos, portanto, existem duas bases admitidas, uma delas sistematicamente mais alta, sem critério contratual de escolha.

**RN-51.** Quando o item consta no Anexo V **e** na tabela de insumos do SINAPI, o sistema apresenta **as duas bases ao fiscal e ao aprovador**, e **registra qual foi aplicada, com justificativa**. A escolha nunca é implícita.

**RN-52.** Preço pactuado do Anexo V que exceda o SINAPI vigente além do percentual admitido gera **advertência** visível a quem aprova. A dispensa de pesquisa não dispensa conferência.

**RN-53.** Itens do Anexo V identificados como de preço anômalo integram **lista de conferência obrigatória**: não avançam sem conferência registrada, independentemente do valor.

**RN-54.** O relatório de gestão apresenta, por período, a **diferença entre o valor autorizado a preços do Anexo V e o valor equivalente a preços SINAPI** — medida do custo de oportunidade do caminho 1 e insumo direto do próximo termo de referência.

> **Pendência 1 da seção 18:** a hierarquia entre as bases exige posicionamento formal do gestor e cláusula expressa no próximo TR. Enquanto não houver, a RN-51 garante que a escolha seja consciente e registrada.

---

## 7. Competência de aprovação

**RN-07.** A competência para aprovar é **nominal e por valor**: cada aprovador tem limite próprio, decorrente do ato de delegação que o designou.

**RN-08.** A competência não decorre do cargo nem do perfil de acesso. Dois servidores na mesma função podem ter limites diferentes.

**RN-09.** A delegação tem vigência. Delegação vencida não aprova, qualquer que seja o valor.

**RN-10.** Quando o valor excede o limite do aprovador, o sistema não permite a aprovação e **informa a quem encaminhar**.

**RN-11.** As faixas de competência são parametrizáveis e decorrem de ato interno. A especificação não presume valores.

**RN-12.** Os parâmetros vigentes no momento da aprovação ficam registrados junto ao ato. Alteração posterior das faixas não altera aprovações concluídas.

> ⚠️ **Nem o contrato nem o TR resolvem a competência.** A cláusula 9.1.2.2 diz "aprovação prévia por parte do Contratante", sem nomear autoridade nem valor. É a **única trava remanescente** do levantamento inicial — depende da portaria de delegação vigente.

---

## 8. Fluxo do processo

### 8.1 Etapas

1. **Diagnóstico** — o executante registra o material necessário, com especificação, unidade e quantidade
2. **Classificação da origem de preço** — Anexo V, SINAPI, ambos, ou nenhum
3. **Formação do preço** — preço pactuado, preço SINAPI, ou 3 orçamentos
4. **Análise técnica** — pertinência, quantidade e equivalência da especificação
5. **Conferência de preço** — sempre; pesquisa exigível apenas no caminho 3
6. **Verificação de lastro** — saldo do empenho de material comporta o valor
7. **Aprovação** — pelo aprovador competente para a faixa
8. **Autorização** — libera formalmente a aquisição e a execução
9. **Execução** — material aplicado, com nota fiscal e evidência
10. **Ateste** — recebimento provisório e definitivo, nos termos do TR

### 8.2 Situações da cotação

```
   rascunho → enviada → em análise técnica → em aprovação → autorizada → executada → atestada
                  ↑              ↓                  ↓
              devolvida ─────────┘            reprovada
```

| Situação               | Significado                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| **Rascunho**           | Em montagem. Não visível ao fiscal                                  |
| **Enviada**            | Aguardando análise técnica                                          |
| **Em análise técnica** | Sob avaliação do fiscal dos serviços                                |
| **Devolvida**          | Retornada para correção, com motivo registrado                      |
| **Em aprovação**       | Aprovada tecnicamente, aguardando competência de valor              |
| **Reprovada**          | Negada, com motivo registrado. Final                                |
| **Autorizada**         | Aquisição e execução liberadas                                      |
| **Executada**          | Material aplicado, com evidência (a NF vem depois do ateste, RN-20) |
| **Atestada**           | Recebimento definitivo emitido. Final                               |
| **Cancelada**          | Encerrada sem efeito, possível até a execução                       |

### 8.3 Regras de transição

**RN-13.** A execução só pode ser registrada quando a cotação está _autorizada_. **Fundamento contratual:** TR 9.1.2.2 exige aprovação prévia e autorização do serviço.

**RN-14.** A data da autorização precisa ser anterior à data do registro da execução. Autorização posterior à aplicação do material é recusada.

**RN-15.** Devolução e reprovação exigem motivo preenchido.

**RN-16.** Cotação reprovada não é reaproveitada. Nova necessidade gera nova cotação, com referência à anterior.

**RN-17.** Alteração de item, quantidade ou valor após a autorização invalida a autorização e devolve a cotação para aprovação.

**RN-18.** Quem montou a cotação não pode aprová-la.

**RN-19.** O ateste observa o fluxo do TR em dois tempos: **recebimento provisório** pelo gestor em até 5 dias corridos do recebimento da documentação, e **recebimento definitivo** em até 5 dias corridos do provisório, ato que concretiza o ateste (TR 17.3 e 17.4).

**RN-20.** A nota fiscal é **posterior** ao recebimento definitivo (TR 17.1 e 18.2). O sistema não aceita NF antes do ateste.

---

## 9. Pesquisa de preços e conferência

**RN-21.** No caminho 3, são exigidos **3 orçamentos distintos**, com discriminação de peças, materiais, quantidades, valores unitário e total por item. O número é fixado pelo TR 9.1.2.2 e **não é parametrizável** neste contrato.

**RN-22.** Nos caminhos 1 e 2 a **pesquisa** é dispensada, por haver preço pactuado ou de tabela oficial. **A conferência não é dispensada:** no caminho 1 o sistema compara automaticamente o preço pactuado com o SINAPI vigente (RN-52).

**RN-23.** Orçamentos de fornecedores com a mesma raiz de CNPJ entre si não satisfazem a exigência de serem "distintos".

**RN-24.** Orçamento emitido por fornecedor cuja raiz de CNPJ coincida com a **da própria contratada** não satisfaz a exigência. _(Raiz da contratada vigente: 03543374.)_

**RN-25.** Cada orçamento registra fornecedor, CNPJ, valor, data e validade, com o documento anexado.

**RN-26.** A fonte de referência nomeada no contrato é o **SINAPI** (TR 9.1.2.2). O sistema admite fontes complementares, mas exige ao menos uma referência com valor numérico no caminho 3.

**RN-27.** Variação da proposta vencedora acima do percentual admitido em relação à referência impede o encaminhamento para aprovação. O percentual **é calibrado contra SINAPI vigente, nunca contra a estimativa de 2021** — ver 9.1.

**RN-28.** Orçamento com validade expirada gera advertência e exige confirmação expressa do fiscal.

### 9.1 Por que a estimativa de 2021 não serve de referência

A pesquisa de preços da Administração, examinada item a item:

|                                |                                                     |
| ------------------------------ | --------------------------------------------------- |
| Itens com fonte única          | **56 de 79 (71%)** — exclusivamente Banco de Preços |
| Itens com menos de 3 fontes    | **64 de 79 (81%)**                                  |
| Valor concentrado nesses itens | R$ 132.384,79 (60,6% do total)                      |

E, nos 15 itens com 3 ou mais cotações, a estimativa adotou a **média** em vez do menor preço, elevando a referência — item 23 com média 286% acima da menor cotação; item 47, 216% acima.

**RN-55.** A base de conferência é o **SINAPI vigente no momento do uso**, ou pesquisa própria contemporânea. A estimativa de 2021 serve de contexto histórico, não de parâmetro.

> Isso não enfraquece a exigência de 3 orçamentos da contratada, que é obrigação do TR. Significa apenas que a referência de conferência precisa ser atual.

## 10. Taxa de administração

**RN-29.** **Não há taxa de administração sobre material neste contrato.** A cláusula 9.1.2.3 do TR determina que os preços de material já incluam todos os custos de aquisição. A taxa de administração mencionada no contrato (cláusulas 3.2 e 16.8) compõe a planilha de custos da mão de obra e custeia a conta-depósito vinculada — não remunera intermediação de compra.

**RN-30.** O parâmetro nasce em **zero e não editável** para este contrato. Alteração exige cláusula expressa em novo termo de referência, com justificativa registrada.

---

## 11. Controles automáticos

Dividem-se em **impedimentos**, que travam o avanço, e **advertências**, que acompanham a cotação e ficam visíveis a quem aprova.

### 11.1 Impedimentos

| Controle                           | Condição                                       | Fundamento |
| ---------------------------------- | ---------------------------------------------- | ---------- |
| **Saldo de empenho insuficiente**  | Valor excede o saldo do empenho de material    | RN-41      |
| Orçamentos insuficientes           | Menos de 3 no caminho 3                        | TR 9.1.2.2 |
| Fornecedores de mesma raiz de CNPJ | Entre si, no mesmo conjunto                    | RN-23      |
| Orçamento da própria contratada    | Raiz de CNPJ igual à da contratada             | RN-24      |
| CNPJ inválido                      | Dígito verificador não confere                 | RN-25      |
| Ausência de referência de preço    | Nenhuma fonte com valor, no caminho 3          | RN-26      |
| Variação acima do admitido         | Vencedora distante do SINAPI vigente           | RN-27      |
| Divergência de preço pactuado      | Caminhos 1 e 2, preço diferente do pactuado    | RN-04      |
| Conferência obrigatória pendente   | Item da lista de preço anômalo sem conferência | RN-53      |
| Base de preço não registrada       | Item em duas bases sem escolha justificada     | RN-51      |
| Competência insuficiente           | Valor acima do limite do aprovador             | RN-10      |
| Delegação vencida                  | Vigência expirada                              | RN-09      |

### 11.2 Advertências

| Controle                                   | Condição                                                    |
| ------------------------------------------ | ----------------------------------------------------------- |
| **Preço pactuado acima do SINAPI**         | Além do percentual admitido (RN-52)                         |
| **Projeção de esgotamento do empenho**     | A autorização consome parcela relevante do saldo (RN-56)    |
| Consumo acima do estimado no Anexo V       | RN-42                                                       |
| Possível fracionamento                     | Ver 11.3                                                    |
| Orçamento vencido                          | Validade anterior à análise                                 |
| Reincidência no mesmo equipamento          | Terceira cotação para o mesmo ativo na janela               |
| Divergência na execução                    | Valor executado diferente do autorizado                     |
| Item provavelmente no Anexo V ou no SINAPI | Descrição semelhante a item pactuado, cotado pelo caminho 3 |

### 11.3 Apuração de fracionamento

**RN-31.** Apuram-se as cotações autorizadas para o mesmo equipamento (ou, na ausência, o mesmo local) e o mesmo item, dentro de janela parametrizável.

**RN-32.** Quando cada cotação isolada ficou abaixo de uma faixa de competência, mas a soma na janela ultrapassa essa faixa, gera-se advertência.

**RN-33.** A advertência de fracionamento **não impede** o avanço. É indício, não prova; a decisão permanece com o fiscal, e fica registrada no relatório.

---

## 12. Exceção por urgência

**RN-34.** Existe caminho de exceção para urgência que não admita o tempo do fluxo ordinário. O TR reconhece chamadas de emergência noturnas e em feriados (29.5), **mas não disciplina autorização excepcional de material** — a regra é proposta da especificação, não decorrência contratual.

**RN-35.** A exceção exige justificativa circunstanciada registrada no ato, e **não dispensa a aprovação por competência nem a verificação de saldo** — apenas permite que a pesquisa de preços seja completada depois.

**RN-36.** Cotação tramitada por exceção fica permanentemente sinalizada e integra relatório próprio.

**RN-37.** Não existe forma de suprimir controles sem registro. Toda dispensa de etapa deixa rastro nominal.

## 13. Trilha de decisão

**RN-38.** Cada transição registra: situação anterior, situação nova, autor, limite de competência do autor naquele momento, base de preço aplicada, data e hora, e motivo quando exigido.

**RN-39.** A trilha é somente de inclusão. Não admite alteração nem exclusão.

**RN-40.** A trilha é recuperável como peça única, legível por terceiro que não acompanhou o processo, e apta a instruir processo administrativo de fiscalização.

---

## 14. Saldo do empenho de material

**Esta é a restrição que de fato limita a operação, e por isso integra a primeira fatia de implantação.**

### 14.1 A dimensão do problema

|                                      |                                        |
| ------------------------------------ | -------------------------------------- |
| Estimativa SERAE de consumo          | **R$ 1.000,00/mês · R$ 12.000,00/ano** |
| Anexo V completo, a preços pactuados | R$ 338.041,69                          |
| Razão                                | **28x**                                |

As quantidades do Anexo V, se consumidas integralmente, custam 28 vezes o empenho anual estimado. Ou as quantidades são catálogo de teto e não expectativa de consumo, ou a estimativa de R$ 1.000,00/mês está muito abaixo da demanda real.

Na prática operacional: **a R$ 679,80 o balde de tinta, dois baldes esgotam o mês. A R$ 432,00 o metro de cabo de aço, dois metros e meio.**

### 14.2 Regras

**RN-41.** O material tem **empenho específico**, emitido conforme estimativa do Serviço de Arquitetura e Engenharia (TR 9.1.2.4). O sistema controla o saldo e **impede autorização sem lastro**. É impedimento, não advertência.

**RN-42.** O Anexo V traz quantidade estimada por item. O consumo acumulado que ultrapasse a estimativa gera advertência — indica subdimensionamento do planejamento ou desvio de consumo, e é insumo do próximo termo de referência.

**RN-43.** **O material não consome o limite de 25% para acréscimos contratuais** (Contrato, cláusula 13.2). O valor do contrato — R$ 631.871,93 — é integralmente mão de obra, conforme a proposta vencedora; o material corre por empenho próprio, fora dele. O limite de 25% é acompanhado apenas em relação à mão de obra.

**RN-56.** O sistema apresenta **projeção de esgotamento do empenho** de material: saldo atual, consumo médio do período e data estimada de esgotamento. A projeção acompanha cada autorização que consuma parcela relevante do saldo, para que o fiscal saiba que o orçamento vai acabar antes de ele acabar.

## 15. Vínculo com o equipamento

**RN-44.** A cotação é vinculada ao equipamento objeto do chamado, quando houver.

**RN-45.** O vínculo permite apurar custo acumulado de material por equipamento, fundamento da decisão entre reparar e substituir.

**RN-46.** Chamado sem equipamento identificado permite cotação, com vínculo ao local.

---

## 16. Indicadores e efeito contratual

### 16.1 O IMR vigente

O contrato **tem** Instrumento de Medição de Resultado (TR, seção 30), com reflexo direto no pagamento:

| Indicador                                                        | Pontos | Afere                        |
| ---------------------------------------------------------------- | ------ | ---------------------------- |
| 1. Atraso no pagamento de salários e benefícios                  | 40     | Gestor                       |
| 2. Fornecimento de EPIs e uniformes                              | 20     | Gestor                       |
| **3. Tempo de resposta e não atendimento às solicitações**       | **20** | **Fiscal dos serviços**      |
| **4. Não fornecimento de materiais, equipamentos e ferramentas** | **20** | Gestor + fiscal dos serviços |

**Faixas de ajuste no pagamento:**

| Pontuação    | Fator | Pagamento |
| ------------ | ----- | --------- |
| 80 a 100     | 1,00  | 100%      |
| 70 a 79      | 0,97  | 97%       |
| 60 a 69      | 0,95  | 95%       |
| 50 a 59      | 0,93  | 93%       |
| Abaixo de 50 | 0,90  | 90%       |

Reincidência de zero em qualquer indicador: multa de 0,3% sobre a NF mensal, cumulada com a faixa. Avaliação abaixo de 50 por três vezes pode motivar sanção, inclusive rescisão.

### 16.2 Os indicadores 3 e 4 têm efeito contratual

**RN-47.** A premissa de que os indicadores nasceriam informativos **não se aplica aos indicadores 3 e 4**, que têm meta, mecanismo de cálculo e efeito financeiro definidos no TR.

- **Indicador 3** — meta: **"até dia útil posterior à solicitação"**. Escala: sem atrasos 20 pontos; 1 ocorrência 15; 2 ocorrências 10; 3 ocorrências 5; 4 ou mais, **ou uma ocorrência de não atendimento**, 0 pontos. O instrumento previsto é planilha mensal com solicitante, setor, data da solicitação, descrição, data de início e tempo de atendimento ou não atendimento.
- **Indicador 4** — mesma escala. O instrumento previsto é o acompanhamento dos pedidos de fornecimento de material, hoje mantido por e-mails digitalizados.

**RN-48.** O prazo do Indicador 3 — **até o dia útil seguinte à solicitação** — é prazo contratual, e não convenção interna. O sistema o trata como prazo de referência do atendimento.

**RN-49.** Os dados que o sistema produz para os indicadores 3 e 4 **têm efeito contratual** e integram o cálculo da glosa. Exigem o mesmo rigor de registro e a mesma imutabilidade da trilha de aprovação.

### 16.3 Indicadores de gestão, sem efeito contratual

Permanecem informativos, como linha de base para o próximo TR:

- tempo entre envio da cotação e autorização
- percentual de cotações devolvidas
- percentual com impedimento na primeira tentativa
- custo de material acumulado por equipamento
- divergência entre valor autorizado e executado
- quantidade de cotações por exceção de urgência
- advertências de fracionamento no período
- consumo acumulado por item do Anexo V contra a estimativa
- **diferença entre o valor autorizado a preços do Anexo V e o equivalente SINAPI** (RN-54)
- **saldo e projeção de esgotamento do empenho de material** (RN-56)

### 16.4 Defeito no IMR vigente

**RN-50.** O IMR do TR vigente apresenta inconsistência aritmética que o sistema **não deve replicar**:

- a seção 30.2.1 anuncia "cinco indicadores" e descreve quatro (a numeração salta de 30.2.1.3 para 30.2.1.5)
- a fórmula 3.1.1 soma "Indicador 1 + 2 + 3 + 4 + 5"
- o checklist final soma quatro indicadores e fecha em 100 pontos
- a planilha qualitativa produz até 30 pontos por fórmula própria, sem lugar definido na soma

O sistema adota a **soma de quatro indicadores, totalizando 100 pontos**, conforme o checklist. A divergência é registrada como pendência de correção no próximo TR e deve ser comunicada formalmente, por afetar a segurança de eventual glosa contestada.

---

## 17. Critérios de aceite

| #     | Critério                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------- |
| CA-01 | Item do Anexo V é cotado sem exigência de orçamentos, com o preço pactuado                                    |
| CA-02 | Item da tabela SINAPI é cotado sem exigência de orçamentos                                                    |
| CA-03 | Item fora do Anexo V e do SINAPI exige 3 orçamentos para avançar                                              |
| CA-04 | Cotação com menos de 3 orçamentos no caminho 3 não avança                                                     |
| CA-05 | Dois orçamentos com a mesma raiz de CNPJ são recusados                                                        |
| CA-06 | Orçamento com a raiz de CNPJ da própria contratada é recusado                                                 |
| CA-07 | CNPJ com dígito verificador inválido é recusado                                                               |
| CA-08 | Cotação do caminho 3 sem referência de preço com valor numérico não avança                                    |
| CA-09 | Preço divergente do pactuado nos caminhos 1 e 2 é recusado                                                    |
| CA-10 | Aprovador com limite inferior ao valor não visualiza a ação de aprovar e recebe a indicação de encaminhamento |
| CA-11 | Aprovador com delegação vencida não aprova                                                                    |
| CA-12 | Quem montou a cotação não consegue aprová-la                                                                  |
| CA-13 | Execução registrada antes da autorização é recusada                                                           |
| CA-14 | Alteração de valor após a autorização devolve a cotação para aprovação                                        |
| CA-15 | Devolução sem motivo é recusada                                                                               |
| CA-16 | Nota fiscal registrada antes do recebimento definitivo é recusada                                             |
| CA-17 | Autorização que exceda o saldo do empenho de material é recusada                                              |
| CA-18 | Taxa de administração sobre material não é editável                                                           |
| CA-19 | Três cotações do mesmo item e equipamento na janela geram advertência sem travar o fluxo                      |
| CA-20 | Consumo acumulado acima da estimativa do Anexo V gera advertência                                             |
| CA-21 | Alteração das faixas de competência não altera aprovações anteriores                                          |
| CA-22 | Cotação por exceção de urgência permanece sinalizada após a conclusão                                         |
| CA-23 | A trilha de uma cotação concluída é legível de ponta a ponta por terceiro                                     |
| CA-24 | Atendimento concluído após o dia útil seguinte à solicitação é contabilizado como ocorrência do Indicador 3   |
| CA-25 | O cálculo do IMR soma quatro indicadores e totaliza no máximo 100 pontos                                      |
| CA-26 | Item presente no Anexo V e no SINAPI exibe as duas bases e exige registro justificado da escolha              |
| CA-27 | Preço do Anexo V acima do SINAPI além do limite gera advertência visível a quem aprova                        |
| CA-28 | Item da lista de conferência obrigatória não avança sem conferência registrada                                |
| CA-29 | Autorização que consuma parcela relevante do saldo apresenta a projeção de esgotamento antes de confirmar     |
| CA-30 | O relatório de gestão apresenta a diferença entre valor autorizado a preços do Anexo V e o equivalente SINAPI |

---

## 18. Pendências

| #     | Pendência                                                                                                                            | Situação                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **1** | **Qual preço prevalece quando o item consta no Anexo V e no SINAPI**                                                                 | 🔴 **Maior impacto financeiro do levantamento.** Exige posicionamento formal do gestor |
| **2** | **Conferência do item 74** do Anexo V — cabo de aço galvanizado a R$ 432,00/m, contra R$ 3,54/m da estimativa, com unidade conferida | 🔴 Provável erro grosseiro de precificação. Conferir antes de qualquer aquisição       |
| **3** | **Faixas de alçada e titulares da delegação**                                                                                        | 🔴 **Trava.** Nem o contrato nem o TR nomeiam autoridade ou valor                      |
| 4     | Valor e saldo atual do empenho de material do exercício                                                                              | 🔴 Calibra a RN-41 e a RN-56                                                           |
| 5     | Autorização nos caminhos 1 e 2: etapa de aprovação ou registro simplificado?                                                         | 🟠 Decisão de interpretação da RN-05                                                   |
| 6     | Percentual de variação admitido sobre o SINAPI                                                                                       | 🟠 Parâmetro da RN-27 e RN-52                                                          |
| 7     | Houve repactuação dos preços do Anexo V nos aditivos?                                                                                | 🟠 Os preços de 2022 podem ter sido reajustados                                        |
| 8     | Janela de apuração de fracionamento                                                                                                  | 🟡 Decisão do gestor                                                                   |
| 9     | Procedimento de material em urgência                                                                                                 | 🟡 Não disciplinado no TR                                                              |
| 10    | Estágio da instrução da nova contratação                                                                                             | 🟡 Ver seção 19                                                                        |

**Resolvidas pela documentação examinada:** modelo de fornecimento e as três bases de preço; número mínimo de orçamentos; fonte de referência; taxa de administração; existência, conteúdo e defeito do IMR; existência e **preços** da planilha pactuada; natureza do valor contratado; existência do empenho específico de material; meio e responsável pela montagem da cotação; fluxo e prazos de ateste.

---

## 19. Janela temporal e destino desta especificação

|                             |                                   |
| --------------------------- | --------------------------------- |
| Início da vigência          | 01/03/2022                        |
| Limite legal de prorrogação | 60 meses (Contrato, cláusula 2.1) |
| Encerramento máximo         | **28/02/2027**                    |
| Decorrido                   | 55 de 60 meses                    |

O contrato esgota o prazo legal em **28/02/2027**. Celebrado sob a Lei 8.666/1993, permanece regido por ela, e o teto de 60 meses para serviços continuados não admite nova prorrogação.

**Duplo destino:**

1. **Contrato vigente** — as regras aplicáveis hoje têm respaldo contratual direto: 3 orçamentos, aprovação prévia, preço pactuado, empenho específico, IMR com glosa. O sistema pode operar o fluxo e **substituir o controle por e-mail e planilha** que o próprio TR exige para os indicadores 3 e 4.
2. **Próxima contratação** — esta especificação é insumo para redigir o novo termo de referência, onde os controles hoje não normatizados nascem exigíveis.

### Recomendações para o novo termo de referência

1. **Definir a hierarquia das bases de preço** — qual prevalece, e o critério quando há mais de uma
2. **Dimensionar o material com peso adequado no julgamento.** Material a 1,8% do preço global não é disputado. Se o consumo real é relevante, a parcela precisa de peso que o reflita, ou de julgamento por item
3. **Usar o menor preço, e não a média, como referência** quando houver três ou mais cotações na estimativa — e exigir três fontes efetivas, padrão que a própria Administração não cumpriu em 81% dos itens
4. Corrigir a aritmética do IMR (RN-50)
5. Definir o que torna orçamentos "distintos", vedando mesma raiz de CNPJ entre si e com a contratada
6. Fixar prazo para apresentação do orçamento após o diagnóstico, hoje inexistente
7. Fixar percentual de variação admitido sobre o SINAPI
8. **Exigir que o controle de material e de atendimento seja mantido em sistema**, e não por e-mails digitalizados e planilha manual
9. Definir competência e alçada de aprovação, remetendo à portaria
10. Vincular o material ao equipamento atendido, viabilizando o custo acumulado por ativo
11. Conciliar as quantidades do Anexo V com a estimativa de consumo do empenho — hoje divergem em 28 vezes

---

## 20. Registro de alterações

### Da v2 para a v3 — correções

| Regra     | Mudança                                                                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RN-43** | **Invertida.** Dizia acompanhar o consumo de material contra o limite de 25% para acréscimos. A proposta vencedora mostra que o valor do contrato é integralmente mão de obra; o material corre por empenho próprio e **não consome esse limite** |
| **RN-22** | **Qualificada.** A dispensa de pesquisa nos caminhos 1 e 2 permanece, mas **deixa de implicar dispensa de conferência**. No caminho 1 a conferência contra o SINAPI é automática                                                                  |
| **RN-27** | **Recalibrada.** A referência é o SINAPI vigente, nunca a estimativa de 2021, cuja base é frágil (71% dos itens com fonte única)                                                                                                                  |
| **RN-41** | **Promovida.** De controle acessório a impedimento central, obrigatoriamente na primeira fatia de implantação                                                                                                                                     |

### Da v2 para a v3 — regras novas

| Nova  | Conteúdo                                                                         | Origem                               |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------ |
| RN-51 | Item em duas bases: apresentar ambas, registrar a aplicada com justificativa     | Lacuna da cláusula 9.1.2.2           |
| RN-52 | Preço do Anexo V acima do SINAPI gera advertência                                | Comparação estimativa × proposta     |
| RN-53 | Lista de conferência obrigatória para itens de preço anômalo                     | Itens 74, 50, 1, 46 e outros         |
| RN-54 | Relatório da diferença entre valor pago a preços do Anexo V e equivalente SINAPI | Sobrepreço agregado de 54,8%         |
| RN-55 | A base de conferência é o SINAPI vigente, não a estimativa de 2021               | Fragilidade da pesquisa de 2021      |
| RN-56 | Projeção de esgotamento do empenho de material                                   | Razão de 28x entre Anexo V e empenho |

### Da v2 para a v3 — seções novas

- **3.1 Números do contrato** — valor, natureza, empenho de material, vigência
- **6. Hierarquia das bases de preço** — o achado de maior impacto financeiro
- **9.1 Por que a estimativa de 2021 não serve de referência**
- **14. Saldo do empenho de material** — ampliada de regra isolada a seção própria

### Resumo do histórico

| Versão | Base documental                               | Regras | Critérios |
| ------ | --------------------------------------------- | ------ | --------- |
| v1     | Conhecimento do domínio                       | 39     | 17        |
| v2     | + contrato e termo de referência              | 51     | 25        |
| **v3** | **+ planilhas de custo e proposta vencedora** | **57** | **30**    |
