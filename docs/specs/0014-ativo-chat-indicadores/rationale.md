# 0014. Rationale: ativo sugerido no chat e indicadores de ativo no IMR

## Context

Desde a spec 0011 o chamado pode apontar para um equipamento (`Chamado.ativoId`), mas o chamado aberto pelo chat nasce sempre sem ativo e depende da gestão para vincular. O chat é hoje a entrada principal, então quase todo corretivo chega sem equipamento, e qualquer indicador por ativo fica vazio. A spec 0011 deixou registrado que o ativo não deve passar pelo portão de confiança (spec 0007): um ativo errado não pode impedir nem atrasar a abertura.

Três forças pesam na parte do chat. Primeira, o prompt do assistente: qualquer mudança no texto sobe o `PROMPT_VERSION`, e subir a versão desliga a autonomia da IA até o Admin salvar a calibração de novo (spec 0006), o que interrompe a classificação e a atribuição automáticas já em produção. Segunda, a GPU é compartilhada e limitada (`lib/llm`): cada linha a mais no prompt custa em toda mensagem de toda conversa. Terceira, o cadastro: os 108 ativos do Tier A vieram do SICAM sem local físico (`localizacaoId: null` na carga), e a árvore de locais é preenchida pela vistoria (spec 0012), prédio a prédio. O local que a IA extrai é texto livre (`localExato`), não um id de `Localizacao`; o que liga a conversa à árvore é a unidade da pessoa, porque `Localizacao.unitId` diz quem ocupa o local.

Na parte dos indicadores, o IMR atual (`lib/imr-service.ts`) é uma única aggregation com `$facet`, filtrada por chamados `encerrado` com `closedAt` no período, e todos os números dele têm leitura contratual (glosa). Os indicadores de ativo da proposta (MTBF, MTTR, reincidência, mais problemáticos) nascem informativos, como base para o próximo termo de referência, e falha se mede quando abre, não quando fecha. Se nada for decidido, o vínculo de ativo continua manual e os indicadores, quando construídos, mostram um parque quase vazio.

## Options considered

### Option 1: Regra determinística no servidor (escolhida)

Depois que a IA extrai serviço e local, o servidor procura códigos no texto e, sem código, cruza a categoria ligada ao subtipo do serviço com os locais da unidade, desempatando pelas palavras do local. O cartão mostra de 1 a 5 candidatos.

**Pros**:

- Não muda o prompt: autonomia, calibração e custo de GPU ficam como estão.
- Exato quando a pessoa dá o código; previsível e testável sem modelo.
- Cada sugestão é explicável ("é o único ar condicionado da sua unidade").

**Cons**:

- Não entende descrições soltas ("o da janela").
- Depende do local preenchido pela vistoria; ativo sem `localizacaoId` só aparece pelo código.

### Option 2: Candidatos no prompt, o modelo escolhe

O servidor monta uma lista curta (pela unidade e pelo serviço da proposta anterior) e o modelo devolve o código do ativo no mesmo objeto da extração.

**Pros**:

- Entende linguagem natural sobre posição e aparência do equipamento.
- Aproveita a mesma chamada ao modelo, sem chamada extra.

**Cons**:

- Sobe `PROMPT_VERSION` e desliga a autonomia até nova calibração.
- Mais tokens por mensagem na GPU compartilhada; a lista depende do serviço do turno anterior, então o primeiro turno nunca tem candidatos.
- Erro do modelo em código é silencioso e difícil de auditar.

### Option 3: Lista inteira de ativos no prompt

Os ativos vinculáveis vão em todo prompt, e o modelo escolhe.

**Pros**:

- Não depende da unidade nem da vistoria para achar o candidato.

**Cons**:

- O mais caro em tokens, e cresce com o cadastro.
- Lista longa piora a extração dos outros campos.
- Também sobe `PROMPT_VERSION`.

Para os indicadores, a alternativa considerada foi acrescentar facets ao pipeline único do IMR. Ela mantém a regra de "uma aggregation", mas exigiria trocar o `$match` comum (status `encerrado` e `closedAt`) por um que inclua chamados abertos filtrados por `createdAt`, mexendo nos números contratuais para servir números informativos.

## Rationale

A força decisiva é a autonomia em produção: qualquer opção que toque no prompt desliga a classificação e a atribuição automáticas até o Admin recalibrar, por um ganho incerto num campo que a própria spec 0011 declarou não crítico. A regra no servidor entrega o caso mais valioso (o código da etiqueta, que é exato) e o caso mais comum depois da vistoria (um só aparelho daquela categoria na unidade) sem esse custo. O teto de 5 e o "Não sei" já marcado fazem com que a regra erre para o lado de não sugerir, o que é seguro porque a gestão continua vinculando como hoje.

A decisão `ativo` em `DecisaoIa` com `decididoPor: 'regra'` segue o precedente do técnico na atribuição automática (spec 0008) e transforma a escolha entre a Opção 1 e a Opção 2 em algo medível: se a taxa de correção for alta, ou se muitos cartões ficarem sem ativo com a vistoria completa, a Opção 2 volta à mesa com números. As exclusões em `iaSituacao`, revisão e calibragem existem porque o código atual trata toda decisão `aplicado` como decisão do modelo; sem elas, cada chamado com ativo cairia na fila de revisão do Preposto.

Os indicadores ficam numa aggregation própria porque base e propósito são diferentes dos do IMR: corretivos por `createdAt`, incluindo abertos, sem efeito contratual. O cálculo em JS sobre poucos documentos por período é simples de testar, e o mesmo módulo serve a ficha. A única peça compartilhada com o IMR, a expressão do MTTR com pausa, é extraída para uma função, para os dois números nunca divergirem.
