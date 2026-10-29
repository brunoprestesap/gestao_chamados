# 0023. IMR do contrato: indicadores 3 e 4 (racional)

## Context

> ⚠️ Premise note: o CA-24 do funcional da 0019 diz que conta o atendimento "concluído" depois do dia útil seguinte, mas o TR prevê uma planilha com "data de início e tempo de atendimento". Medir a conclusão tornaria quase todo reparo com material uma ocorrência, e o indicador zeraria todo mês sem dizer nada útil. Esta spec mede o início (a atribuição ao técnico), que é o que a planilha do TR registra, e trata o CA-24 como um erro de redação a corrigir.

O contrato de manutenção tem um Instrumento de Medição de Resultado (TR, seção 30) com quatro indicadores e reflexo direto no pagamento: a soma define a faixa (100%, 97%, 95%, 93% ou 90%), e a reincidência de zero em qualquer indicador gera multa de 0,3% sobre a nota fiscal. Os indicadores 3 (tempo de resposta e não atendimento) e 4 (não fornecimento de material) são aferidos hoje por planilha e por e-mails digitalizados, embora o Sigma já tenha os dados: a atribuição do técnico (`sla.responseStartedAt`) e a autorização e execução da cotação de material (spec 0019).

Esses números têm efeito contratual (RN-49): uma glosa contestada precisa mostrar quais ocorrências deram aquele número, com que regra, e quem ajustou o quê. Um número que muda depois que o pagamento foi instruído é pior do que não ter número. Ao mesmo tempo, o TR não fixa prazo de fornecimento de material e tem um defeito aritmético (anuncia cinco indicadores, descreve quatro, e a fórmula soma cinco), que o sistema não pode replicar (RN-50).

Os indicadores 1 (salários) e 2 (EPI e uniforme) não têm dado no Sigma, mas a faixa de pagamento só existe com a soma dos quatro. O contrato vence em 28/02/2027, então a solução precisa entrar em uso logo e sem mudar o fluxo de quem atende chamados.

## Options considered

### Option 1: Novos facets no `imr-service.ts`

Acrescentar os indicadores 3 e 4 ao `$facet` único do IMR gerencial, com filtro por contrato, e mostrar numa aba nova de `/relatorios/imr`.

**Pros**:

- Reaproveita a agregação e o padrão de seções do IMR.
- Uma consulta só por relatório.

**Cons**:

- O IMR gerencial filtra chamados encerrados no período por `closedAt`; o indicador 3 precisa de chamados pelo vencimento do prazo, inclusive abertos e cancelados, e o 4 lê outra coleção.
- O prazo em dias úteis com feriados é difícil e frágil em agregação.
- Não resolve fechamento, ajustes nem imutabilidade; o IMR gerencial é sempre ao vivo e só Admin.

### Option 2: Módulo próprio com apuração pura, marcações e fechamento só de inclusão

`lib/imr-contrato/` lê as linhas do mês, uma função pura `apurarMes` aplica prazo, marcações, escala e faixa, e o fechamento grava a foto. Marcações, fechamentos e reaberturas são coleções só de inclusão.

**Pros**:

- A regra de negócio fica testável sem banco, e prévia e fechamento usam a mesma função.
- Imutabilidade garantida pela forma das coleções e por índices únicos.
- Não toca o ciclo do chamado; só a autorização da cotação ganha um campo.

**Cons**:

- Quatro coleções novas e uma tela nova.
- Lê mais documentos do que uma agregação filtrada faria.

### Option 3: Campos de IMR no Chamado e na Cotação, sempre ao vivo

Gravar o prazo e as marcações direto em `Chamado` e `CotacaoMaterial` e calcular a tela ao vivo, sem fechamento.

**Pros**:

- Menos coleções; leitura simples.

**Cons**:

- Perde a trilha de quem marcou e desfez.
- O número de um mês pago pode mudar (feriado novo, chamado editado), o que fragiliza a glosa.
- Espalha regra de contrato pelos modelos centrais.

## Rationale

A força dominante é o efeito contratual (RN-49): o resultado precisa ser reproduzível e imutável depois de fechado, e cada ajuste precisa de autor e motivo. Só a Option 2 entrega isso sem mexer no ciclo do chamado, que é o lugar mais arriscado do sistema. A Option 1 é tentadora por reaproveitar o IMR, mas o IMR gerencial responde outra pergunta (chamados encerrados no período, sempre ao vivo), e forçar os dois na mesma agregação misturaria filtros incompatíveis.

A apuração em JavaScript em vez de agregação é deliberada: o prazo em dias úteis com feriado já existe em TypeScript (`lib/sla-timezone.ts`), o volume por contrato e mês é de centenas de chamados, e uma função pura torna os cenários de borda (sexta à noite, feriado na segunda, cancelado depois do prazo) testáveis sem banco. Se o volume crescer muito, a leitura pode ser estreitada sem mudar a regra.

Decisões que o arquiteto tomou sozinho, com a alternativa descartada:

- **Reabertura em coleção própria** em vez de campo no fechamento: o índice único em `versaoReaberta` resolve a corrida e mantém tudo só de inclusão. Alternativa: um campo `situacao` no fechamento, que exigiria update.
- **Cotação antiga resolvida na leitura** (N = 5 com o `autorizadoEm`) em vez do script de carga única combinado na conversa: a imagem de produção não tem `tsx`, o cálculo depende do calendário em TypeScript, e um script em `mongosh` duplicaria essa regra. Como o fechamento congela o resultado, calcular na leitura é seguro. Alternativa: script de carga, se a equipe preferir o campo preenchido em todo documento.
- **Prazo vencido não é apagado pela ação `alterar`**: sem isso, a contratada atrasada poderia mudar o valor, voltar à aprovação e ganhar um prazo novo. Alternativa: sempre recalcular, mais simples e manipulável.
- **Janela de leitura de 30 dias corridos antes do mês** para a base do indicador 3 (era 15 no primeiro rascunho; a checagem cruzada mostrou que recesso de fim de ano mais feriados poderia passar disso): sobra folga e continua barato. Alternativa: ler pelo prazo gravado, o que exigiria gravar o prazo no chamado em todos os caminhos de abertura.
- **Chamado antigo sem `responseStartedAt`** conta à parte, como "sem registro de início", e não como atraso: sem isso, a prévia de meses passados acusaria atraso em massa por falta de dado, não por falta de atendimento.
- **Sem notificação** nesta spec: ninguém precisa ser avisado em tempo real; fica como follow up o aviso de mês sem fechamento.
- **Sem índice novo no Chamado**: o volume é pequeno e o índice `{ tipoServico, status }` existe; medir antes de criar.

## Revisão de 29/10/2026

Depois da revisão de código feita por outro modelo (`docs/reviews/2026-10-29-main.md`), cinco detalhes da construção mudaram sem mudar a decisão (Option 2 continua):

- **Conferência no fechamento.** A tela mostrava a soma com o I3 e o I4 da página carregada, mas o servidor recalculava; se alguém marcasse algo no meio, a foto imutável gravaria números que a pessoa não viu. A alternativa de só mostrar o total gravado depois de fechar foi descartada, porque o erro já estaria na foto. A tela passou a mandar `pontosVistos`, e a divergência recusa.
- **Instante do fechamento.** `fechadoEm` era o `agora` da entrada, anterior às leituras; uma marcação gravada nessa janela entrava na foto mas ficava dentro do intervalo fechado e sumia depois de uma reabertura. Agora o instante é tomado logo antes da gravação.
- **Dias úteis num módulo neutro.** O núcleo de transições do material importava `lib/imr-contrato/`. A conta e a leitura do calendário foram para `lib/dias-uteis/`, e o prazo de fornecimento para `lib/material/fornecimento.ts`.
- **Prazo nulo.** Antes, a falta de prazo era silenciosa e um erro na leitura dos feriados derrubava a autorização. Agora há aviso no log, e a autorização segue; a leitura do I4 já estima o prazo com N = 5.
- **Índice.** O índice esparso em `fornecimentoAte` não excluía nada (o campo tem padrão null) e não atendia o ramo do prazo nulo; virou o composto `{ fornecimentoAte: 1, autorizadoEm: 1 }`.

Na checagem cruzada da spec atualizada (outro modelo, mesmo dia), três pontos viraram código e o resto virou texto:

- **Tela depois de `previaMudou`.** O diálogo ficava com o I3 e o I4 antigos, e um novo clique falhava de novo até recarregar a página à mão. Agora a tela chama `router.refresh()` e mantém o I1 e o I2 digitados.
- **N da estimativa.** A cotação autorizada depois da spec e sem prazo (o cálculo falhou) era medida com N = 5 mesmo com outro N configurado. Agora usa o N atual; o 5 ficou só para a cotação anterior a `INICIO_PRAZO_GRAVADO`. Gravar o N por cotação foi descartado: a falha é rara e o N atual é o que a contratada conhece.
- **Janela de feriados.** O prazo lia feriados de 120 dias, e a contagem vai até 400; com expediente curto e N alto, feriados depois do dia 120 eram ignorados. A leitura passou a cobrir a mesma janela da contagem.
