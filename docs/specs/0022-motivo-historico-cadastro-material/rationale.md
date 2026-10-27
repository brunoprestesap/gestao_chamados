# 0022. Motivo e histórico no cadastro de material: rationale

## Context

O cadastro de material (`/configuracoes/material`, specs 0019 e 0021) é onde o Admin decide quem pode aprovar cotação e com qual dinheiro. Três atos tiram algo de uso: revogar uma designação, desativar uma faixa de competência e inativar um empenho (que também pode ser reativado). A spec 0021 (AC-21) pôs uma confirmação antes de cada um, para evitar o clique errado, mas registrou de propósito que o servidor continuava sem motivo nem histórico.

Hoje o que fica gravado é desigual. A designação guarda `revogadaEm` e `revogadaPorUserId`, mas não o porquê. A faixa só troca `ativa` para `false`, sem data nem autor. O empenho troca `ativo` nos dois sentidos, sem nada. Numa auditoria do contrato, a pergunta "por que este aprovador perdeu a designação em março?" ou "quem inativou o empenho e por quê?" não tem resposta no sistema.

As restrições do módulo pesam. O MongoDB roda sem replica set, então não há transação: toda escrita de saldo e de situação é um update condicional num documento só (`lib/material/saldo.ts`). Designação e faixa são modelos só de inclusão (`models/_somente-inclusao.ts`), que barram escrita fora das funções próprias. O módulo já tem dois históricos embutidos com o mesmo formato (`MaterialConfig.historico` e `anomaliaHistorico` do Anexo V) e um limite de texto curto padrão (`TEXTO_CURTO_MIN` e `TEXTO_CURTO_MAX`, 10 a 500).

Sem decidir, o Sigma continua aceitando decisões que mudam quem aprova e com qual empenho sem deixar o porquê, e a fiscalização depende da memória de quem estava no cargo.

## Options considered

### Option 1: Campos no próprio documento

Designação ganha `revogadaMotivo`; faixa ganha `desativadaEm`, `desativadaPorUserId` e `desativadaMotivo`; empenho ganha o array `historicoSituacao`. Cada ato grava tudo na mesma escrita condicional que já existe.

**Pros**:

- Uma escrita só por ato, atômica no documento, sem transação e sem estado parcial.
- Segue o padrão do módulo (`historico` de `MaterialConfig`, `anomaliaHistorico`) e o `somenteInclusao` que já protege designação e faixa.
- A leitura por linha sai do documento que a tela já carrega.

**Cons**:

- Três formatos diferentes (dois com campos únicos, um com array) para o mesmo tipo de informação.
- Uma visão única de todos os atos exige juntar três coleções.

### Option 2: Coleção nova de eventos do cadastro

Uma coleção só de inclusão, `CadastroMaterialEvento` (`tipo`, `alvoId`, `ato`, `motivo`, `porUserId`, `em`), recebe um evento por ato, e os documentos continuam como hoje.

**Pros**:

- Um formato só para os três alvos, e uma seção Histórico vira uma consulta simples.
- Os modelos atuais quase não mudam.

**Cons**:

- Duas escritas por ato (o documento e o evento) sem transação: uma queda entre as duas deixa ato sem motivo ou motivo sem ato, justamente o que a feature quer impedir.
- Corrida de dois Admins grava eventos duplicados, a não ser que o evento passe a depender do resultado do update, o que reabre o problema da ordem.

### Option 3: Só pedir o motivo, sem guardar autor e data na faixa e no empenho

O motivo vai num campo de texto em cada documento, e a faixa e o empenho seguem sem autor nem data.

**Pros**:

- A menor mudança possível.

**Cons**:

- Não cumpre o "quem fez e quando" da feature.
- O empenho, que vai e volta, guardaria só o último motivo e perderia os anteriores.

## Rationale

A força que decide é a falta de transação. O ato e o motivo precisam ser gravados juntos, ou a garantia "todo ato tem motivo" fica furada justamente nos casos de erro, que são os que a auditoria olha. A opção 1 mantém cada ato numa escrita condicional só, no mesmo documento, como o resto do módulo já faz com saldo e situação. Por isso ela vence a opção 2, cujo único ganho (uma consulta única) é de leitura, e o Admin escolheu ler o histórico na própria linha, não numa seção à parte.

A diferença de formato entre os alvos segue a natureza de cada ato: revogar e desativar acontecem uma vez só, então campos únicos bastam e o filtro condicional (`revogadaEm: null`, `ativa: true`) já impede a repetição; o empenho vai e volta, então precisa de um array que só cresce, trocado no mesmo update com o filtro `ativo: !novo`. Esse filtro também resolve a corrida entre dois Admins sem item duplicado.

A opção 3 foi descartada porque não entrega o autor e a data, que são metade do pedido. O motivo é definitivo pela mesma razão da trilha da cotação: um registro de auditoria que pode ser reescrito não serve como registro. Os atos antigos ficam como estão, com frases fixas, porque inventar motivo ou data por migração mudaria o sentido do que foi gravado.
