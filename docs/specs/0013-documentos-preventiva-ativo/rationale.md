# 0013. Rationale: documentos do ativo e preventiva por categoria

## Context

A spec 0011 colocou o equipamento no centro do chamado e a 0012 trouxe a vistoria e o importador, mas o Sigma ainda não sabe duas coisas que o contrato predial cobra. A primeira são os documentos com prazo legal: PMOC da climatização, AVCB do prédio, ART de serviço, laudo de SPDA e garantia. Hoje eles vivem em pastas e planilhas, e quem descobre que o AVCB venceu costuma ser a fiscalização. A categoria de ativo já tem `exigeDocumento` desde a 0011, mas como texto livre e sem nada que o leia.

A segunda é a preventiva por equipamento. O `RecurringTicket` gera um chamado genérico por rodada ("manutenção dos splits do prédio"), que não aponta para nenhum aparelho. Assim não dá para saber qual split ficou sem preventiva, e o histórico da ficha só mostra corretivas. `periodicidadePreventivaDias` também existe desde a 0011 sem uso.

As forças: o Mongo de produção é standalone (sem transação), então qualquer regra de "um só vigente" precisa de índice e de desfazer manual. O container `cron` já chama três rotas com segredo, e o recorrente roda a cada 30 minutos. Os anexos de chamado já vivem no disco (`data/uploads`), com backup. O parque Tier A tem 108 ativos (centenas no máximo), então volume não é problema; repetição e corrida são. A equipe é pequena: cada infraestrutura nova pesa.

O custo de não decidir: o primeiro laudo vencido descoberto numa fiscalização vira multa ou interdição, e a preventiva continua impossível de medir por equipamento, o que trava os indicadores da fatia 4 (MTBF, reincidência).

## Options considered

### Documentos, opção 1: coleção própria, disco local, job diário com marca por limite (escolhida)

`TipoDocumento` e `DocumentoAtivo` novos, arquivo em `data/uploads/documentos/`, job uma vez por dia que grava em `alertasEnviados` cada limite já avisado.

**Pros**: modelo fiel ao domínio (validade, substituição, alvo ativo ou local); reaproveita disco, backup e as guardas de upload; o aviso nunca se repete e nunca se perde, mesmo com o job parado um dia.

**Cons**: mais uma coleção, mais uma rota de upload e um bloco a mais no nginx.

### Documentos, opção 2: reaproveitar `Attachment`

Estender o anexo de chamado com `ativoId`, `validadeAte` e tipo.

**Pros**: menos código novo; rota de upload já existe.

**Cons**: `chamadoId` é obrigatório e indexado, o limite é 20 por chamado e 5 MB; substituição e herança pelos locais não cabem; misturaria regras de duas coisas diferentes no mesmo modelo.

### Documentos, opção 3: MinIO para os arquivos

Storage S3 compatível em container, como a proposta 0009 cogitou para fotos.

**Pros**: separa arquivo do servidor de aplicação; pronto para crescer.

**Cons**: um container novo para operar e fazer backup, por dezenas de PDFs por ano. Fica para quando as fotos da vistoria chegarem, se chegarem.

### Documentos, opção 4: alerta calculado na hora, sem marca

O job avisa quando os dias restantes são exatamente 90, 60 ou 30.

**Pros**: nenhum campo de controle.

**Cons**: um dia de job parado (deploy, container caído) perde o aviso para sempre; documento cadastrado já perto do vencimento nunca é avisado.

### Preventiva, opção 1: novo escopo no `RecurringTicket` (escolhida)

Campo `escopo` com `categoria_ativo`, um lote por rodada, um chamado por ativo.

**Pros**: reaproveita tela, recorrência, rota e cron; a proposta 0009 já previa o campo; modelos antigos não mudam.

**Cons**: o mesmo modelo passa a ter dois comportamentos, e a união discriminada no schema precisa de cuidado.

### Preventiva, opção 2: plano preventivo por ativo, com ciclo próprio

Cada ativo guarda a data da última preventiva e vence N dias depois.

**Pros**: mais fiel quando aparelhos entram em operação em datas diferentes.

**Cons**: modelo e tela novos, chamados espalhados todo dia, difícil de conferir contra o cronograma do contrato. Recusada na conversa.

### Preventiva, opção 3: chamado único com lista de ativos

Um chamado por rodada, com os ativos numa lista dentro dele.

**Pros**: nada muda no fluxo de chamado.

**Cons**: `Chamado.ativoId` é um só; a ficha e os indicadores por ativo não enxergariam a preventiva, que é o objetivo.

## Rationale

Nos documentos, a força decisiva é "nunca perder nem repetir um aviso" sem transação. A marca por limite resolve as duas pontas: quem grava a marca condicionalmente é o único que envia, e o limite alcançado e não marcado sai no primeiro dia em que o job roda. Avisar só o limite mais urgente evita três e-mails no mesmo dia para um documento cadastrado já perto do vencimento. A regra de um vigente por tipo e alvo vai para o índice único parcial, porque sem transação só o banco garante isso numa corrida; o desfazer manual cobre o resto. Disco local vence MinIO pelo custo operacional em relação ao volume.

Tipos configuráveis foram escolha sua, contra a recomendação de deixá-los fixos no código. Funciona bem com uma condição que esta spec impõe: `exigeDocumento` guarda a `chave`, que é imutável, e não o `_id` nem o nome. Assim renomear um tipo não quebra nenhuma categoria, e o valor antigo de texto livre é reconhecido quando bate com uma chave. O custo aceito é uma tela e um modelo a mais.

Na preventiva, a força decisiva é reaproveitar o que já roda. O escopo novo mantém o cálculo de recorrência e o cron, e o nascimento `validado` com prioridade do modelo segue o mesmo caminho da 0007 (`montarSnapshotSla`), então o SLA da preventiva é calculado igual ao de qualquer chamado. A atribuição automática da 0008 ficou de fora de propósito: a menor carga, aplicada a dezenas de chamados no mesmo instante, despejaria o lote no mesmo técnico. A reserva atômica do modelo entra só no ramo novo; o ramo antigo também gera em dobro se duas execuções se cruzarem, mas mexer nele muda o comportamento de quem já usa e merece decisão própria.

### Follow-up deste registro

- **Reserva atômica no recorrente comum**: o ramo `template` de `processRecurringTickets` também pode gerar duas vezes se duas execuções se cruzarem; aplicar a mesma reserva quando for conveniente. Candidato ao Deferred do scope.
- **Atribuição automática da preventiva**: se o Preposto passar a distribuir sempre do mesmo jeito, avaliar um critério de distribuição em lote (rodízio) em vez da menor carga.
- **Documento vencido gera chamado**: recusado agora (renovação é tarefa administrativa); reavaliar se a gestão pedir.
